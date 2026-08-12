import * as pc from 'playcanvas';
import { SoundManager } from '../audio/SoundManager';
import { CameraManager, CameraMode } from '../camera/CameraManager';
import { ParticleFX } from '../fx/ParticleFX';
import { MarbleManager } from '../marble/MarbleManager';
import { createRoster, DEFAULT_NAMES, namesForCount } from '../marble/MarbleConfig';
import { DEFAULT_PHYSICS_CONFIG, type PhysicsConfig } from '../physics/PhysicsConfig';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { RandomManager, STREAM } from '../random/RandomManager';
import { RaceManager } from '../race/RaceManager';
import type { RaceResult } from '../race/RaceResult';
import { Track } from '../track/Track';
import { DEFAULT_TRACK_CONFIG, type TrackConfig } from '../track/TrackConfig';
import { generateTrack } from '../track/TrackGenerator';
import { CountdownUI } from '../ui/CountdownUI';
import { DebugPanel } from '../ui/DebugPanel';
import { GameUI } from '../ui/GameUI';
import { LeaderboardUI } from '../ui/LeaderboardUI';
import { MarbleLabels } from '../ui/MarbleLabels';
import { ResultUI } from '../ui/ResultUI';
import { RosterUI } from '../ui/RosterUI';
import { FOG_FAR, FOG_NEAR, setupLighting } from '../visual/Lighting';
import { BUMPER_HEAT_STEPS, bumperHeatColor } from '../visual/Palette';
import { lerp } from '../util/math';
import { MaterialFactory } from '../visual/MaterialFactory';
import { clampPlayerCount, DEFAULT_GAME_CONFIG, type GameConfig } from './GameConfig';
import { GameLoop } from './GameLoop';
import { GameState } from './GameState';

export interface GameOptions {
  seed?: number;
  playerCount?: number;
  game?: GameConfig;
  physics?: PhysicsConfig;
  track?: TrackConfig;
}

/**
 * Composition root: owns every subsystem and wires them together.
 *
 * The dependency direction is deliberate and one-way. RaceManager (pure rules)
 * emits events; this class translates them into scene, camera, audio and UI
 * effects. Nothing in the race layer ever calls back into rendering, which is
 * what makes a future server-authoritative mode a swap rather than a rewrite
 * (PRD §9, §31).
 */
export class Game {
  private readonly gameConfig: GameConfig;
  private readonly physicsConfig: PhysicsConfig;
  private readonly trackConfig: TrackConfig;

  private readonly random: RandomManager;
  private readonly materials = new MaterialFactory();
  private readonly loop: GameLoop;
  private readonly physics: PhysicsWorld;

  private readonly marbles: MarbleManager;
  private readonly race: RaceManager;
  private readonly sound = new SoundManager();

  private readonly ui: GameUI;
  private readonly countdownUI = new CountdownUI();
  private readonly resultUI: ResultUI;
  private readonly leaderboard = new LeaderboardUI();
  private readonly labels = new MarbleLabels();
  private readonly roster: RosterUI;
  private readonly debug = new DebugPanel();

  private readonly sceneRoot: pc.Entity;
  private readonly fx: ParticleFX;
  private track!: Track;
  private camera!: CameraManager;

  private playerCount: number;
  /** Entrant names for the current race, in roster order. */
  private lineup: string[];
  private slowMotionUntil = 0;

  constructor(
    private readonly app: pc.Application,
    options: GameOptions = {},
  ) {
    this.gameConfig = options.game ?? DEFAULT_GAME_CONFIG;
    this.physicsConfig = options.physics ?? DEFAULT_PHYSICS_CONFIG;
    this.trackConfig = options.track ?? DEFAULT_TRACK_CONFIG;

    this.playerCount = clampPlayerCount(
      options.playerCount ?? DEFAULT_NAMES.length,
      this.gameConfig,
    );
    // A field size from the URL wins over the checkbox roster, so `?players=50`
    // still works for load testing; otherwise the default line-up is used.
    this.lineup = namesForCount(this.playerCount);
    this.random = new RandomManager(options.seed);

    this.sceneRoot = new pc.Entity('scene');
    this.app.root.addChild(this.sceneRoot);
    setupLighting(this.app, this.sceneRoot);

    this.physics = new PhysicsWorld(this.app, this.physicsConfig);
    this.loop = new GameLoop(this.app);
    this.fx = new ParticleFX(this.sceneRoot);

    this.marbles = new MarbleManager(
      this.physicsConfig,
      this.gameConfig,
      this.materials,
      this.random,
      STREAM.rescue,
    );
    this.sceneRoot.addChild(this.marbles.root);

    this.race = new RaceManager(this.gameConfig, this.marbles);

    this.ui = new GameUI({
      onStart: (seed) => this.startRace(this.selectedNames(), seed),
      onReset: () => this.reset(),
      onToggleSound: () => {
        this.sound.unlock();
        this.sound.setEnabled(!this.sound.isEnabled());
        return this.sound.isEnabled();
      },
      onToggleView: () => this.toggleFullBoard(),
      onZoom: (delta) => this.camera?.nudgeZoom(delta),
    });
    // Built after GameUI: its change callback fires immediately on construction
    // and drives the START button's enabled state.
    this.roster = new RosterUI(undefined, (selected) => {
      this.ui.setStartEnabled(selected.length >= this.gameConfig.minPlayers);
      this.ui.setPlayerCount(selected.length);
      this.onLineupChanged(selected);
    });

    this.resultUI = new ResultUI(
      () => this.startRace(this.selectedNames(), null),
      (url) => void navigator.clipboard?.writeText(url),
    );

    this.bindRaceEvents();

    // Any first interaction unlocks WebAudio; browsers require a gesture.
    window.addEventListener('pointerdown', () => this.sound.unlock(), { once: true });
  }

  /**
   * Builds the first track and shows the start line, held for the player to
   * choose a line-up and press START. Call once after construction.
   */
  initialise(): void {
    this.physics.takeManualControl();

    // Keep the checkbox list agreeing with a field size that came from the URL,
    // so the panel never claims a different line-up than the one on the grid.
    if (this.playerCount !== DEFAULT_NAMES.length) {
      this.roster.selectFirst(this.playerCount);
    }

    this.buildRace(this.random.getSeed(), this.lineup, false);

    this.loop.onFixedStep((dt) => this.fixedStep(dt));
    this.loop.start();
    this.app.on('update', (dt: number) => this.renderStep(dt));

    this.sceneReady = true;
    this.ui.setPlayerCount(this.playerCount);
    this.ui.setSeed(this.random.getSeed());
    this.ui.syncState(this.race.state);
  }

  /** Entrants currently ticked on the start screen. */
  private selectedNames(): string[] {
    return this.roster.selected;
  }

  /**
   * Rebuilds the grid whenever the line-up changes on the start screen.
   *
   * Ticking a name or shuffling the order has to be visible on the board, not
   * just in the list: start slot and colour both follow roster position, so a
   * shuffled list with an unchanged grid is showing the wrong thing. Suppressed
   * during a race — the field is already committed by then.
   */
  private onLineupChanged(selected: readonly string[]): void {
    if (!this.sceneReady) return;
    if (this.race.state === GameState.COUNTDOWN || this.race.state === GameState.RACING) return;
    if (selected.length < this.gameConfig.minPlayers) return;

    this.race.reset();
    this.buildRace(this.random.getSeed(), selected, false);
  }

  /** False until the first track exists, so roster callbacks can't fire early. */
  private sceneReady = false;

  /**
   * Rebuilds track and field for a seed. Everything downstream of the seed is
   * regenerated, so no state can leak between races (PRD §9).
   *
   * `armed` distinguishes setting up the start screen from actually starting:
   * see RaceManager.prepare.
   */
  private buildRace(seed: number, names: readonly string[], armed: boolean): void {
    this.random.setSeed(seed);
    this.lineup = [...names];
    this.playerCount = this.lineup.length;

    // Tear down every rigidbody before the world goes, then start the physics
    // world fresh. Order matters twice over: destroying bodies after the world
    // would dereference freed Ammo memory, and reusing the world would carry
    // solver state into the next race and break seed reproducibility.
    this.track?.destroy();
    this.marbles.clear();
    this.camera?.entity.destroy();
    this.physics.recreate();

    const layout = generateTrack(
      this.random.stream(STREAM.track),
      this.trackConfig,
      seed,
    );

    this.track = new Track(
      this.trackConfig,
      layout,
      this.materials,
      this.random.stream(STREAM.deflector),
      (entity) => this.onFinishTrigger(entity),
      (entity) => this.onLaunch(entity),
      (entity) => this.marbles.fromEntity(entity)?.registerLaunch() ?? 1,
      (entity, level) => this.onBumperHit(entity, level),
      (entity) => this.onMeltStart(entity),
    );
    this.sceneRoot.addChild(this.track.root);
    this.track.cacheTransforms();

    const participants = createRoster(this.lineup);
    this.marbles.spawn(participants, this.track);

    this.camera = new CameraManager(
      this.track,
      this.marbles,
      Math.abs(this.trackConfig.finishY),
      this.trackConfig.startY,
    );
    this.sceneRoot.addChild(this.camera.entity);
    this.camera.reset();
    this.camera.snap();

    this.leaderboard.build(this.marbles.all.length);
    this.leaderboard.update(this.marbles.standings());
    this.labels.build(this.marbles.all);

    this.race.prepare(participants, seed, armed);
    this.ui.setSeed(seed);
    this.ui.setPlayerCount(this.playerCount);
  }

  /**
   * Starts a race with the given line-up. A null seed means "roll a fresh one".
   *
   * Unlocking audio here matters: this is only ever reached from a real user
   * gesture, which is the one moment a browser will let us create a running
   * AudioContext.
   */
  startRace(names: readonly string[], seed: number | null): void {
    if (names.length < this.gameConfig.minPlayers) return;

    this.sound.unlock();
    this.resultUI.hide();
    this.countdownUI.hide();
    this.roster.hide();

    this.race.reset();
    this.buildRace(seed ?? RandomManager.randomSeed(), names, true);

    this.leaderboard.show();
    this.labels.show();
    this.loop.flush();
    this.loop.setTimeScale(1);
    this.slowMotionUntil = 0;
  }

  /**
   * Starts a race with a generated line-up of `count` entrants.
   *
   * The verification harness drives field sizes rather than named people, and
   * `?players=50` does the same. Named entrants come from the checkbox roster.
   */
  startRaceWithCount(count: number, seed: number | null): void {
    this.startRace(namesForCount(clampPlayerCount(count, this.gameConfig)), seed);
  }

  /** Returns to the start screen without racing (PRD §30 condition 10). */
  reset(): void {
    this.sound.unlock();
    this.sound.play('ui-click');
    this.resultUI.hide();
    this.countdownUI.hide();
    this.race.reset();
    this.buildRace(this.random.getSeed(), this.selectedNames(), false);
    this.roster.show();
    this.leaderboard.show();
    this.labels.show();
    this.loop.flush();
    this.loop.setTimeScale(1);
  }

  // ------------------------------------------------------------ simulation

  /**
   * One fixed physics step. Order matters: kinematic obstacles are posed and
   * marble forces applied *before* the solver runs, so both take effect this
   * tick rather than a frame late.
   */
  private fixedStep(dt: number): void {
    const racing = this.race.state === GameState.RACING;

    this.track.update(dt);
    this.marbles.update(dt, this.track, racing);
    this.physics.step();
    this.race.tick(dt);
  }

  /** Per-rendered-frame work: camera, labels, HUD. Never touches physics. */
  private renderStep(dt: number): void {
    this.camera.update(dt);
    this.syncFogToZoom();

    const cameraComponent = this.camera.entity.camera;
    if (cameraComponent) this.labels.update(this.marbles.all, cameraComponent);

    if (this.race.state === GameState.RACING) {
      this.leaderboard.update(this.marbles.standings());
      this.updateCameraDirection();
      this.updateSlowMotion();
    }

    this.debug.update(dt, {
      marbles: this.marbles.all.length,
      fixedSteps: this.loop.lastStepCount,
      state: this.race.state,
      elapsed: this.race.elapsedTime,
      seed: this.race.currentSeed,
    });
  }

  /**
   * Jumps between the followed race view and the flat whole-board view.
   *
   * A shortcut for what the scroll wheel does continuously — the two share one
   * mechanism, so the button can never disagree with the wheel.
   */
  private toggleFullBoard(): boolean {
    this.sound.play('ui-click');
    const goingOut = !this.camera.isFlattened;
    this.camera.setZoomExtreme(goingOut);
    return goingOut;
  }

  /** The shot the director would choose for a lifecycle stage. */
  private cameraModeForState(state: GameState): CameraMode {
    switch (state) {
      case GameState.RACING:
        return CameraMode.RACE;
      case GameState.FINISHED:
      case GameState.RESULT:
        return CameraMode.RESULT;
      default:
        return CameraMode.OVERVIEW;
    }
  }

  /**
   * Pushes the fog range back as the view flattens.
   *
   * The whole-board camera sits far enough away that play-range fog would erase
   * the entire track, which is exactly what it did: the flat view showed a black
   * column with nothing in it.
   */
  private syncFogToZoom(): void {
    const flat = this.camera.flatAmount;
    const fog = this.app.scene.fog;
    fog.start = lerp(FOG_NEAR.start, FOG_FAR.start, flat);
    fog.end = lerp(FOG_NEAR.end, FOG_FAR.end, flat);
  }

  /** Switches to the finish camera once the leader is close to the line. */
  private updateCameraDirection(): void {
    if (this.camera.getMode() === CameraMode.FINISH) return;
    if (this.marbles.leadProgress >= 0.9) {
      this.camera.setMode(CameraMode.FINISH);
    }
  }

  /**
   * Slow motion for the closing stretch (PRD §14).
   *
   * This only scales how much real time enters the accumulator — step size is
   * unchanged, so the drama cannot alter the result it is dramatising.
   */
  private updateSlowMotion(): void {
    if (this.slowMotionUntil > 0) {
      if (this.race.elapsedTime >= this.slowMotionUntil) {
        this.loop.setTimeScale(1);
        this.slowMotionUntil = 0;
      }
      return;
    }

    const lead = this.marbles.leadProgress;
    if (lead >= 0.965 && this.race.ranking.finishedCount === 0) {
      this.loop.setTimeScale(0.35);
      this.slowMotionUntil = this.race.elapsedTime + 1.1;
    }
  }

  // ---------------------------------------------------------------- events

  private bindRaceEvents(): void {
    this.race.events.on('stateChange', ({ to }) => {
      this.ui.syncState(to);

      this.camera.setMode(this.cameraModeForState(to));

      switch (to) {
        case GameState.RESULT: {
          // Bring the entrant list back so the next race can be re-picked.
          this.roster.show();
          const result = this.race.lastResult;
          if (result) this.showResult(result);
          break;
        }
        default:
          break;
      }
    });

    this.race.events.on('countdown', ({ value }) => {
      this.countdownUI.show(value);
      this.sound.play(value <= 0 ? 'go' : 'countdown');
      if (value <= 0) this.camera.shake(0.25);
    });

    this.race.events.on('raceStart', () => {
      // Opening the gate is the only thing that releases the field, so every
      // marble starts from rest on the same event (PRD §12).
      this.track.startGate.release();
    });

    this.race.events.on('marbleFinished', ({ record, participant }) => {
      this.sound.play('finish');
      this.camera.shake(record.rank === 1 ? 0.35 : 0.12);

      const marble = this.marbles.get(record.id);
      if (marble) {
        marble.finished = true;
        this.fx.burst(marble.position, participant.color, record.rank === 1 ? 2.2 : 1.3);
      }

      // The race camera has nothing left to follow once the leader is home.
      if (record.rank === 1) this.camera.setMode(CameraMode.FINISH);
    });

    this.race.events.on('raceComplete', () => {
      this.loop.setTimeScale(1);
      this.slowMotionUntil = 0;
      this.sound.play('result');
    });
  }

  /**
   * A pop bumper fired. Effects only — the impulse is applied by the bumper
   * inside the fixed step, so nothing here can influence the result.
   *
   * Reported by the bumper rather than by each marble: one listener per bumper
   * instead of one per marble, so the feedback keeps working at every field
   * size instead of being switched off for large ones.
   */
  private onBumperHit(entity: pc.Entity, level: number): void {
    if (this.race.state !== GameState.RACING) return;

    const marble = this.marbles.fromEntity(entity);
    if (!marble) return;

    // A charged bumper should sound and look more violent than a cold one.
    const heat = level / Math.max(1, BUMPER_HEAT_STEPS - 1);
    this.sound.play(heat > 0.4 ? 'marble-bounce-hard' : 'marble-bounce', {
      intensity: 0.35 + heat * 0.65,
    });

    if (heat > 0.35) {
      this.fx.burst(marble.position, bumperHeatColor(level), 0.7 + heat);
      if (level >= BUMPER_HEAT_STEPS - 1) this.camera.shake(0.12);
    }
  }

  /**
   * A launcher fired. Effects only — the impulse itself is applied by the
   * launcher inside the fixed step, so nothing here can influence the result.
   */
  private onLaunch(entity: pc.Entity): void {
    const marble = this.marbles.fromEntity(entity);
    if (!marble || this.race.state !== GameState.RACING) return;

    this.sound.play('launch');
    this.fx.burst(marble.position, marble.participant.color, 0.9);
  }

  /** A melt ball started dissolving. Effects only. */
  private onMeltStart(entity: pc.Entity): void {
    if (this.race.state !== GameState.RACING) return;
    const marble = this.marbles.fromEntity(entity);
    if (!marble) return;
    this.sound.play('deflector', { intensity: 0.5 });
  }

  /** The finish trigger reports every entry; RankingManager owns de-duplication. */
  private onFinishTrigger(entity: pc.Entity): void {
    const marble = this.marbles.fromEntity(entity);
    if (!marble || marble.finished) return;
    this.race.reportFinish(marble.id);
  }

  private showResult(result: RaceResult): void {
    this.labels.hide();
    this.resultUI.show(result, this.race.roster);
  }

  // ------------------------------------------------------------------ misc

  get raceManager(): RaceManager {
    return this.race;
  }

  get ready(): boolean {
    return this.physics.ready;
  }

  get marbleCount(): number {
    return this.marbles.all.length;
  }

  /** Entities tagged as obstacles in the current track. Used by the verifier. */
  get obstacleCount(): number {
    return this.track.root.findByTag('obstacle').length;
  }

  /** How far down the board the leader has reached, 0..1. */
  get leadProgress(): number {
    return this.marbles.leadProgress;
  }

  /**
   * Per-marble state for the verification harness. Reporting *where* marbles
   * end up is the difference between "some didn't finish" and knowing which
   * obstacle row they piled up against.
   */
  snapshot(): Array<{ id: string; progress: number; speed: number; finished: boolean }> {
    return this.marbles.all.map((marble) => ({
      id: marble.id,
      progress: Number(marble.bestProgress.toFixed(3)),
      speed: Number(marble.speed.toFixed(2)),
      finished: marble.finished,
    }));
  }

  markReady(): void {
    this.ui.dismissBoot();
  }

  fail(message: string): void {
    this.ui.showFatal(message);
  }

  destroy(): void {
    this.loop.stop();
    this.marbles.destroy();
    this.track.destroy();
    this.fx.destroy();
    this.materials.destroy();
    this.sceneRoot.destroy();
  }
}
