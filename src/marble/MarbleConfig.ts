import type { Participant } from '../race/RaceResult'
import { marbleColor } from '../visual/Palette'

/** Visual/labelling parameters for marbles. Physics lives in PhysicsConfig. */
export const MARBLE_VISUAL = {
  /** Extra size multiplier applied to the render sphere vs the collider. */
  renderScale: 1,
  metalness: 0.25,
  gloss: 0.92,
  /** Emissive strength so marbles read against the dark board. */
  emissiveIntensity: 0.22,
} as const

/** `marble-01`-style id (PRD §5). Padded so ids sort lexically. */
export function marbleId(index: number): string {
  return `marble-${String(index + 1).padStart(2, '0')}`
}

/** `PLAYER 04`-style fallback name, used when the roster runs out (PRD §15). */
export function playerName(index: number): string {
  return `PLAYER ${String(index + 1).padStart(2, '0')}`
}

/**
 * The default line-up, shown as checkboxes on the start screen.
 *
 * Order is the roster order and therefore determines colours, so it is kept
 * exactly as supplied. Note that one name appears twice — treated as two
 * separate entrants, since two people can share a name; they are told apart by
 * marble colour.
 */
export const DEFAULT_NAMES: readonly string[] = [
  '김민지',
  '김태환',
  '신태준',
  '오진석',
  '원정빈',
  '유정은',
  '윤다인',
  '이다은',
  '이민희',
  '이청',
  '임승희',
  '임채훈',
  '천용재',
]

/**
 * Names for a race of `count` entrants: the default roster first, then
 * generated `PLAYER NN` entries so `?players=100` still works.
 */
export function namesForCount(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    index < DEFAULT_NAMES.length ? DEFAULT_NAMES[index] : playerName(index),
  )
}

/**
 * Builds the roster for a race. Pure: ids and colours follow from position, so
 * a given line-up always describes the same marbles.
 */
export function createRoster(names: readonly string[]): Participant[] {
  return names.map((name, index) => ({
    id: marbleId(index),
    number: index + 1,
    name,
    color: marbleColor(index),
  }))
}
