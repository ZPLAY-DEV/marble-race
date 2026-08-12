/**
 * Sound (PRD §22).
 *
 * There are no audio assets, so every cue is synthesised with WebAudio at
 * runtime. That is a deliberate choice over silence: the game gets real
 * feedback now, and `play()` is already the seam an asset pipeline would slot
 * into later — load a buffer per cue id and the synth path becomes the
 * fallback rather than the implementation.
 *
 * Everything here degrades gracefully. If WebAudio is unavailable or the user
 * hasn't interacted with the page yet, calls are no-ops.
 */

export type SoundId =
  | 'countdown'
  | 'go'
  | 'marble-bounce'
  /** A high-energy impact; falls back to the ordinary bounce when unavailable. */
  | 'marble-bounce-hard'
  | 'launch'
  | 'deflector'
  | 'finish'
  | 'result'
  | 'ui-click';

export interface PlayOptions {
  /** 0..1 loudness multiplier, e.g. scaled by impact speed. */
  intensity?: number;
}

/**
 * Sample files in `public/sounds`, and how loud each should sit in the mix.
 *
 * A cue with no entry here — or whose file fails to load — falls through to the
 * synthesised version, so the game is never silent and never blocks on audio.
 */
const SAMPLES: Partial<Record<SoundId, { file: string; gain: number }>> = {
  'marble-bounce': { file: 'pop_low.mp3', gain: 0.85 },
  'marble-bounce-hard': { file: 'pop_high.mp3', gain: 1 },
  launch: { file: 'whoosh.mp3', gain: 0.9 },
  deflector: { file: 'melt.mp3', gain: 0.55 },
  finish: { file: 'finish.mp3', gain: 0.8 },
  countdown: { file: 'bong.mp3', gain: 0.7 },
  go: { file: 'bong.mp3', gain: 1 },
  result: { file: 'finish.mp3', gain: 0.9 },
  'ui-click': { file: 'pop_high.mp3', gain: 0.5 },
};

const SOUND_BASE = 'sounds';

export class SoundManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private unlocked = false;
  /** Decoded samples, keyed by file name. Absent entries fall back to synthesis. */
  private readonly buffers = new Map<string, AudioBuffer>();

  /** Rate limit for collision sounds — 50 marbles would otherwise be a wall of noise. */
  private lastBounceAt = 0;
  private bouncesThisWindow = 0;
  private windowStartedAt = 0;

  /**
   * Creates the AudioContext. Browsers require a user gesture, so this is
   * called from the first click rather than at startup.
   */
  unlock(): void {
    if (this.unlocked) return;

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return; // No WebAudio: the game stays silent and playable.

    try {
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.context.destination);
      this.unlocked = true;
    } catch {
      this.context = null;
      this.master = null;
    }
    void this.context?.resume();
    void this.loadSamples();
  }

  /**
   * Fetches and decodes everything in SAMPLES.
   *
   * Deliberately not awaited: the race must never wait on audio. Cues play
   * synthesised until their sample arrives, then switch over silently. A file
   * that 404s or fails to decode simply stays synthesised.
   */
  private async loadSamples(): Promise<void> {
    const context = this.context;
    if (!context) return;

    const files = [...new Set(Object.values(SAMPLES).map((entry) => entry.file))];

    await Promise.all(
      files.map(async (file) => {
        try {
          const response = await fetch(`${SOUND_BASE}/${file}`);
          if (!response.ok) throw new Error(`${response.status}`);
          const decoded = await context.decodeAudioData(await response.arrayBuffer());
          this.buffers.set(file, decoded);
        } catch (error) {
          console.warn(`[sound] ${file} unavailable, using synthesised fallback`, error);
        }
      }),
    );
  }

  /**
   * Plays a decoded sample. Returns false when it isn't loaded, so the caller
   * can fall through to synthesis.
   */
  private playSample(id: SoundId, intensity: number): boolean {
    const entry = SAMPLES[id];
    const context = this.context;
    const master = this.master;
    if (!entry || !context || !master) return false;

    const buffer = this.buffers.get(entry.file);
    if (!buffer) return false;

    const source = context.createBufferSource();
    source.buffer = buffer;
    // Vary pitch slightly with impact energy so repeated hits don't machine-gun
    // the identical sample.
    source.playbackRate.value = 0.92 + intensity * 0.3;

    const gain = context.createGain();
    gain.gain.value = entry.gain * (0.45 + intensity * 0.55);

    source.connect(gain).connect(master);
    source.start();
    return true;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master) this.master.gain.value = enabled ? 0.35 : 0;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  play(id: SoundId, options: PlayOptions = {}): void {
    if (!this.enabled || !this.context || !this.master) return;
    if (this.context.state === 'suspended') void this.context.resume();

    const intensity = Math.max(0, Math.min(1, options.intensity ?? 1));

    // Collision cues are throttled before anything is scheduled — with 50
    // marbles on a peg field, unthrottled impacts are indistinguishable from
    // static whether they're samples or synthesis.
    const isImpact = id === 'marble-bounce' || id === 'marble-bounce-hard';
    if (isImpact && !this.throttleBounce()) return;

    // Real samples where we have them; the synth below is the fallback.
    if (this.playSample(id, intensity)) return;

    switch (id) {
      case 'countdown':
        this.blip(660, 0.12, 0.5);
        break;
      case 'go':
        this.chord([523.25, 659.25, 783.99], 0.45, 0.6);
        break;
      case 'marble-bounce':
      case 'marble-bounce-hard':
        this.click(intensity);
        break;
      case 'launch':
        // Rising sweep — the pitch going up sells the marble going back up.
        this.sweep(280, 1400, 0.22, 0.32);
        break;
      case 'deflector':
        this.sweep(300, 900, 0.18, 0.25);
        break;
      case 'finish':
        this.chord([659.25, 830.61, 987.77], 0.35, 0.5);
        break;
      case 'result':
        this.arpeggio([523.25, 659.25, 783.99, 1046.5], 0.11);
        break;
      case 'ui-click':
        this.blip(880, 0.06, 0.3);
        break;
      default: {
        const exhaustive: never = id;
        throw new Error(`Unknown sound id: ${String(exhaustive)}`);
      }
    }
  }

  /**
   * Caps collision sounds to a readable rate. With 50 marbles on a peg field,
   * unthrottled bounces are indistinguishable from static.
   */
  private throttleBounce(): boolean {
    const now = this.context?.currentTime ?? 0;
    if (now - this.windowStartedAt > 0.1) {
      this.windowStartedAt = now;
      this.bouncesThisWindow = 0;
    }
    if (this.bouncesThisWindow >= 4) return false;
    if (now - this.lastBounceAt < 0.012) return false;

    this.bouncesThisWindow++;
    this.lastBounceAt = now;
    return true;
  }

  /** Short sine tone with an exponential decay. */
  private blip(frequency: number, duration: number, gain: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;

    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    const now = context.currentTime;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(gain, now + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(envelope).connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  /** Percussive marble-on-marble tick: filtered noise, pitched by impact strength. */
  private click(intensity: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;

    const length = Math.floor(context.sampleRate * 0.045);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      // Deterministic decaying noise — no Math.random, so audio can't be the
      // one place the game becomes unreproducible.
      const decay = 1 - i / length;
      const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      data[i] = noise * decay * decay;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900 + intensity * 2200;
    filter.Q.value = 1.6;

    const envelope = context.createGain();
    envelope.gain.value = 0.08 + intensity * 0.22;

    source.connect(filter).connect(envelope).connect(master);
    source.start();
  }

  private chord(frequencies: number[], duration: number, gain: number): void {
    for (const frequency of frequencies) {
      this.blip(frequency, duration, gain / frequencies.length);
    }
  }

  private arpeggio(frequencies: number[], step: number): void {
    frequencies.forEach((frequency, index) => {
      window.setTimeout(() => this.blip(frequency, 0.3, 0.4), index * step * 1000);
    });
  }

  private sweep(from: number, to: number, duration: number, gain: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;

    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'triangle';

    const now = context.currentTime;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);

    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(envelope).connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }
}
