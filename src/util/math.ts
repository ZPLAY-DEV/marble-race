/** Small pure math helpers shared across layers. */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export function inverseLerp(from: number, to: number, value: number): number {
  if (from === to) return 0;
  return clamp((value - from) / (to - from), 0, 1);
}

/**
 * Frame-rate independent exponential smoothing.
 * `smoothing` is the fraction of remaining distance left after one second.
 */
export function damp(from: number, to: number, smoothing: number, dt: number): number {
  return lerp(from, to, 1 - Math.pow(smoothing, dt));
}

export const DEG_TO_RAD = Math.PI / 180;

/** Formats seconds as `M:SS.mmm`, for result readouts. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  const whole = Math.floor(rest);
  const millis = Math.round((rest - whole) * 1000);
  const pad = (n: number, width: number) => n.toString().padStart(width, '0');
  return `${minutes}:${pad(whole, 2)}.${pad(millis, 3)}`;
}
