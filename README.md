# 3D Marble Race

A 3D random-draw race game for the browser — ten marbles released down an
inclined pachinko board, first to the finish line wins. Built on PlayCanvas
Engine, TypeScript, Vite and Ammo.js, with no external 3D assets: everything is
primitive geometry and procedural material.

```bash
npm install
npm run dev      # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm test` | Unit tests for the pure game-logic layer |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify` | Drives a real browser through a full race and checks the result |
| `npm run soak` | The PRD §26 matrix: many seeds, 10–100 marbles, frame-rate independence |
| `npm run seedcheck` | Quick check that races finish across several seeds |

`verify` and `soak` need the dev server already running.

## URL parameters

| Parameter | Effect |
| --- | --- |
| `?seed=12345` | Runs a specific race. The same seed reproduces the same track and the same result. |
| `?players=25` | Field size, 2–100. |
| `?selftest` | Runs one seed twice and logs whether the finish orders match. |

**Camera:** the mouse wheel zooms continuously. Scrolling all the way out tips
the board into a flat, perspective-free 2D plan showing the entire play area at
once; FULL BOARD jumps straight to that extreme and back. Press `D` for an FPS
and simulation readout.

## Entrants and launchers

The start screen lists the default line-up as checkboxes, all ticked; untick
anyone sitting out. Marbles are labelled with names rather than numbers, and the
colour swatch beside each name is that person's marble — which matters because
the roster contains the same name twice, and colour is what tells those two
apart. `?players=N` overrides the list with a generated field for load testing.

The board is a pinball table: **launch pads** throw marbles back *up* the track,
so a leader can lose ten places in a second. Three rules keep that from turning
into a stalemate, and each exists because it failed without it:

- **Pads leave a marble-sized gap.** `width` is a half-extent; sized greedily the
  pads merge into an unbroken kicker wall and the field never descends at all.
- **A launcher-free run-in above the finish**, so whatever reaches the last
  stretch can actually finish rather than being fired back up forever.
- **Launch fatigue.** Repeated launches give progressively less lift, recovering
  over a few seconds. Without it one marble in a pocket ran a race to the 180s
  timeout; with it, the same seed finishes in 47s.
- **A launcher-free drop below the start**, because the field leaves the gate
  packed against the walls and a kicker there fired the outermost marbles
  straight back into the hopper — they looked stuck while everyone else raced.

**Melting balls** form two near-solid rows across the middle of the board:
white, bumper-shaped, and gone two seconds after anything touches them. They
are packed almost edge to edge with the second row offset half a ball, so there
is no straight path through — the field has to eat a hole in the wall. That
density is only safe because they always vanish; any permanent obstacle placed
that tightly would simply dam the board.

**Pop bumpers charge up.** Each hit advances one of five heat steps, turning the
bumper redder and doubling its kick: 3 → 6 → 12 → 24 → 48 units/s. The top of
that ladder is exactly `maxSpeed`, so the reddest bumper hits as hard as the
simulation allows and no harder — overshooting would be clipped by the speed
clamp and the last step would feel identical to the one before it. The kick is
an explicit outward impulse, not a restitution bump, so it fires the same
whether a marble arrives fast or trickles in.

Clicking the title toggles it. Ticking a name or pressing 순서 랜덤 rebuilds the
grid immediately — start slot and colour both follow roster position, so a
shuffled list with an unchanged board would be showing the wrong thing.

The page waits at the start line for you to press START rather than racing on
load. That is deliberate: browsers refuse to play audio until the page has seen
a real user gesture, so an auto-started first race is always silent.

## Sound

Samples live in `public/sounds` and are fetched and decoded on first interaction:
`pop_low` / `pop_high` for impacts (pitched by energy), `whoosh` for launches,
`melt` for deflectors, `bong` for the countdown, `finish` for arrivals. Any cue
whose file is missing or fails to decode falls back to the WebAudio synthesis it
shipped with, so the game is never silent and never blocks on audio.

## Verified behaviour

`npm run soak`, run against the production build in headless Chromium
(software rendering, so absolute frame rates mean little — completion and
reproducibility are the point):

```
1. Seed variety (10 players)     8/8 seeds finish, 0 DNF, 8/8 distinct orders
   Full 13-person roster         5/5 seeds finish 13/13, races 30-47s
2. Field sizes                   10 → 10/10    25 → 25/25
                                 50 → 50/50   100 → 100/100 finishers
3. Frame-rate independence       27 → 17 fps (1.6x spread)
                                 sim 10.858s and identical finish order at every rate
```

Every claim in the section below was established by measurement, not assumed.
Several were assumptions first — and wrong. Races used to time out with a third
of the field wedged in place, seeds did not reproduce, and at 50 marbles two
thirds of the field fell out of the world. Those are the reasons the invariants
below exist and are pinned by tests.

## Architecture

The central constraint is the PRD's separation of game rules from physics and
rendering. Two layers, one dependency direction:

```
        pure TypeScript                    PlayCanvas
   ┌──────────────────────┐        ┌────────────────────────┐
   │ RandomManager        │        │ Track / obstacles      │
   │ TrackGenerator       │──data─▶│ MarbleManager          │
   │ RaceManager          │        │ CameraManager          │
   │ RankingManager       │◀events─│ PhysicsWorld           │
   │ GameStateMachine     │        │ UI / audio / particles │
   └──────────────────────┘        └────────────────────────┘
```

`random/`, `race/`, `util/`, `core/GameState.ts`, `core/GameConfig.ts` and the
track's generator, layout and config never import `playcanvas`. The scene layer
pushes events *into* the rules layer; the rules layer never reaches back.
`tests/layerBoundary.test.ts` enforces this by scanning imports, because a
comment claiming a layer is pure decays the moment someone adds one.

That boundary is what makes the PRD §31 roadmap — server-authoritative results,
replay, a track editor — a swap rather than a rewrite. A track is plain JSON, and
a race outcome is a function of a seed.

```
src/
  core/      Game (composition root), GameLoop, GameState, GameConfig
  physics/   AmmoLoader, PhysicsWorld, PhysicsConfig
  random/    RandomManager — seeded PRNG with named streams
  race/      RaceManager, RankingManager, RaceResult
  track/     TrackGenerator (seed → layout), Track (layout → entities),
             obstacles/, FinishZone, StartGate
  marble/    Marble, MarbleManager, MarbleConfig
  camera/    CameraManager — overview / race / finish / result shots
  ui/        HTML+CSS overlay: HUD, countdown, leaderboard, labels, result
  audio/     SoundManager — samples from public/sounds, synthesis as fallback
  visual/    Palette, MaterialFactory, Lighting
  fx/        ParticleFX
```

## Reproducibility

A race is a pure function of its seed. The same seed rebuilds the same track,
the same start jitter, the same deflector kicks — and produces the same finish
order.

Three things make that hold, and each was verified by measurement rather than
assumed:

**A fixed timestep.** `GameLoop` accumulates real time and releases it to the
simulation only in exact 1/120 s steps, with Ammo's `maxSubSteps` pinned to 1.
The engine's own variable-delta stepping is unsubscribed. `npm run soak` checks
this by burning a fixed slice of wall-clock inside every animation frame — 27
down to 17 fps — and comparing results.

**A fresh physics world per race.** Bullet's broadphase tree and the solver's
warm-starting caches live as long as the world does, so a second race run in the
world a first race left behind starts from different internal state. Measured:
identical seeds matched exactly across fresh worlds and diverged across reused
ones. `PhysicsWorld.recreate()` rebuilds the world between races.

**Named RNG streams.** Each of `track`, `deflector` and `rescue` is derived from
the master seed by hashing its name, so adding a draw in one cannot shift
another. Without this, any change to track generation would silently invalidate
every shared seed.

**The limit worth stating:** Ammo is deterministic for a fixed timestep on a
given build, not across CPU architectures or engine versions. `RaceResult`
therefore records `engineVersion` alongside the seed — a future server would
verify by re-simulating with a matching build. Slow motion scales only the real
time entering the accumulator, never the step size, so the dramatic finish
cannot alter the result it is dramatising.

## Board geometry

Three dimensions are load-bearing, and each was set by a failure rather than a
guess:

- **Width** must fit the whole default roster on one start row. Narrower, and
  the overflow stacks into a second row released a beat late — those marbles
  look like they are refusing to fall.
- **Depth** must be shallower than *two* marble diameters. At 1.9 it was not,
  and two marbles could stack front-to-back and wedge each other against an
  obstacle — a jam that survived 58 rescue impulses and ran a race to the
  timeout.
- **Funnels hang below their row line.** Built upward, a tall funnel's mouth
  intruded into the row above and left a marble-high slot that trapped seven
  marbles at once against a side wall.


The board is an inclined slab (~26° from vertical), not a flat vertical plane —
that tilt is what gives the scene real perspective depth rather than a 2D layout
wearing 3D clothing. Board-local space: `+X` across, `+Y` up-board toward the
start, `+Z` out of the face toward the camera. Marbles travel toward `-Y`.

One consequence of the incline drove several design rules and is worth knowing
before editing the track: **no surface may be level.** A face whose normal is
board-local `+Y` absorbs the entire down-board component of gravity through the
contact normal, leaving only the component pressing the marble into the board.
That corner holds a marble permanently, and a rescue impulse just lets it settle
straight back. Flat-topped obstacles once collected half the field and ran races
to the timeout. Hence `LEDGE_TILT` on every ledge, and `minDrainGap` — a
guaranteed clearance between every blocking obstacle and the side walls, since an
obstacle reaching a wall is a dead end for anything sliding along it.
`tests/trackGenerator.test.ts` enforces the drain rule across 80 seeds.

Tunnelling is prevented by geometry rather than continuous collision detection,
which PlayCanvas 2.21 does not expose: `maxSpeed × FIXED_TIMESTEP` is held below
the thinnest collider, and `tests/physicsInvariants.test.ts` holds that
relationship.

## Ammo

`public/lib/ammo/` holds the WASM build from
[playcanvas/engine](https://github.com/playcanvas/engine) (`examples/assets/wasm/ammo`),
zlib licensed, loaded via `pc.WasmModule` with an asm.js fallback.

It is vendored rather than installed because neither `ammojs-typed` nor `ammo.js`
on npm ships a build this engine can drive — both predate `Ammo.addFunction`, the
Emscripten runtime export PlayCanvas needs to install Bullet's internal tick
callback. Without it the engine warns that contacts may go unreported, and every
finish in this game is detected by a trigger volume. Updating means replacing
those three files and bumping `ENGINE_VERSION` in `src/race/RaceResult.ts`.

## Configuration

No magic numbers outside config. `GameConfig` (players, countdown, timeout,
stuck-rescue), `PhysicsConfig` (gravity, mass, friction, restitution, damping,
speed cap, timestep), `TrackConfig` (tilt, dimensions, row spacing, drain gap),
`MarbleConfig` and `Palette`.

Physics values are tuned for watchability over realism, as the PRD asks:
restitution above 1 on bumpers, gravity well above earth's, and a speed cap that
keeps the race readable.
