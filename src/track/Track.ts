import * as pc from 'playcanvas';
import { SURFACE } from '../physics/PhysicsConfig';
import type { RandomStream } from '../random/RandomManager';
import { clamp, DEG_TO_RAD } from '../util/math';
import type { MaterialFactory } from '../visual/MaterialFactory';
import { SCENE_COLORS } from '../visual/Palette';
import { createCatcher, createFinishZone, type FinishCallback } from './FinishZone';
import { StartGate } from './StartGate';
import { boardExtent, START_GRID, type TrackConfig } from './TrackConfig';
import type { ObstacleSpec, TrackLayout } from './TrackLayout';
import { createBumper, createBumperGlow } from './obstacles/Bumper';
import { createDeflector } from './obstacles/Deflector';
import { createFunnel } from './obstacles/Funnel';
import { createLauncher } from './obstacles/Launcher';
import { createLogoBar } from './obstacles/LogoBar';
import { createMeltBall } from './obstacles/MeltBall';
import { type Obstacle, type ObstacleContext, createStaticBox } from './obstacles/Obstacle';
import { createRotor } from './obstacles/RotatingObstacle';
import { createSplitter } from './obstacles/Splitter';
import { createNarrowPassage, createSlantedWall, createVerticalWall } from './obstacles/Walls';

/**
 * Turns a TrackLayout into scene entities.
 *
 * The split matters: TrackGenerator decides *what* the track is (pure data),
 * Track decides how to render and collide it. A server could run the generator
 * with no renderer at all.
 */
export class Track {
  /** Board-local space. Everything track-related is a child of this. */
  readonly root: pc.Entity;
  readonly startGate: StartGate;

  private readonly moving: Obstacle[] = [];
  /** Cached world→board matrix. The board never moves, so this is computed once. */
  private readonly worldToBoard = new pc.Mat4();
  private readonly scratch = new pc.Vec3();

  constructor(
    private readonly config: TrackConfig,
    layout: TrackLayout,
    materials: MaterialFactory,
    random: RandomStream,
    onFinish: FinishCallback,
    onLaunch?: (marble: pc.Entity) => void,
    launchScaleFor?: (marble: pc.Entity) => number,
    onBumperHit?: (marble: pc.Entity, level: number) => void,
    onMeltStart?: (marble: pc.Entity) => void,
  ) {
    this.root = new pc.Entity('track');
    // Tilt about X so the board face looks up and toward the camera; marbles
    // then run down-board and toward the viewer, giving the scene real depth.
    this.root.setLocalEulerAngles(-config.tiltDegrees, 0, 0);

    const boardRotation = new pc.Quat().setFromEulerAngles(-config.tiltDegrees, 0, 0);
    const context: ObstacleContext = {
      materials,
      config,
      random,
      boardRotation,
      onLaunch,
      launchScaleFor,
      onBumperHit,
      onMeltStart,
    };

    this.buildBoard(materials);
    this.buildSideWalls(materials);
    this.buildGlass();
    this.buildCeiling(materials);

    for (const row of layout.rows) {
      for (const spec of row.obstacles) {
        this.addObstacle(spec, context);
      }
    }

    this.startGate = new StartGate(config, materials, config.startY - 1.6);
    this.root.addChild(this.startGate.entity);

    this.root.addChild(createFinishZone(config, materials, onFinish));
    this.root.addChild(createCatcher(config, materials));
  }

  /** Called on the fixed physics step, before the simulation advances. */
  update(dt: number): void {
    for (const obstacle of this.moving) obstacle.update?.(dt);
  }

  /** Converts a board-local point to world space. */
  localToWorld(x: number, y: number, z: number, out = new pc.Vec3()): pc.Vec3 {
    out.set(x, y, z);
    return this.root.getWorldTransform().transformPoint(out, out);
  }

  /**
   * Progress down the board, 0 at the start line and 1 at the finish, derived
   * from a world position. This is how the race layer ranks marbles that never
   * finished without knowing anything about geometry.
   */
  progressOf(worldPosition: pc.Vec3): number {
    const local = this.worldToLocal(worldPosition, this.scratch);
    const span = this.config.startY - this.config.finishY;
    return (this.config.startY - local.y) / span;
  }

  worldToLocal(worldPosition: pc.Vec3, out = new pc.Vec3()): pc.Vec3 {
    return this.worldToBoard.transformPoint(worldPosition, out);
  }

  /**
   * Caches the world→board matrix. Must be called once the track has been
   * parented into the scene, since the transform is not final before that.
   */
  cacheTransforms(): void {
    this.worldToBoard.copy(this.root.getWorldTransform()).invert();
  }

  /** Unit world-space vector pointing down the board. */
  get downhill(): pc.Vec3 {
    const direction = new pc.Vec3(0, -1, 0);
    this.root.getRotation().transformVector(direction, direction);
    return direction.normalize();
  }

  /**
   * Containment failsafe.
   *
   * Returns a corrected world position when a marble has left the playable
   * cavity, or null when it is where it should be.
   *
   * Solid walls are the primary defence, but they are not a guarantee: a marble
   * crushed against a wall by a crowd can be pushed through by the solver's
   * penetration recovery, and a marble that escapes is lost for the rest of the
   * race — it can never finish, so the race cannot resolve. This backstop makes
   * losing one impossible. It applies the same rule to every marble, so it
   * costs nothing in fairness.
   */
  cavityCorrection(worldPosition: pc.Vec3, radius: number, out = new pc.Vec3()): pc.Vec3 | null {
    const local = this.worldToLocal(worldPosition, this.scratch);
    const { top, bottom } = boardExtent(this.config);

    const limitX = this.config.width / 2 - radius;
    const limitZ = this.config.depth / 2 - radius * 0.5;

    const x = clamp(local.x, -limitX, limitX);
    const z = clamp(local.z, -limitZ, limitZ);
    const y = clamp(local.y, bottom + radius, top - radius);

    // Tolerance keeps normal contact jitter from triggering a correction.
    const escaped =
      Math.abs(local.x - x) > 0.25 || Math.abs(local.z - z) > 0.25 || Math.abs(local.y - y) > 0.25;
    if (!escaped) return null;

    return this.localToWorld(x, y, z, out);
  }

  /** Unit world-space vector pointing up the board, toward the start. */
  get uphill(): pc.Vec3 {
    const direction = new pc.Vec3(0, 1, 0);
    this.root.getRotation().transformVector(direction, direction);
    return direction.normalize();
  }

  /** Board-local Y above which a marble is back in the start hopper. */
  get hopperFloorY(): number {
    return this.config.firstRowY;
  }

  /** Board-local Y of a world position — cheap accessor for per-step checks. */
  localY(worldPosition: pc.Vec3): number {
    return this.worldToLocal(worldPosition, this.scratch).y;
  }

  /** Unit world-space vector pointing out of the board face, toward the camera. */
  get outward(): pc.Vec3 {
    const direction = new pc.Vec3(0, 0, 1);
    this.root.getRotation().transformVector(direction, direction);
    return direction.normalize();
  }

  private addObstacle(spec: ObstacleSpec, context: ObstacleContext): void {
    const obstacle = buildObstacle(spec, context);
    this.root.addChild(obstacle.entity);
    if (obstacle.decoration) this.root.addChild(obstacle.decoration);
    if (obstacle.update) this.moving.push(obstacle);

    if (spec.kind === 'bumper') {
      this.root.addChild(createBumperGlow(spec, context));
    }
  }

  /** The back slab marbles roll against. */
  private buildBoard(materials: MaterialFactory): void {
    const material = materials.get({
      color: SCENE_COLORS.board,
      metalness: 0.15,
      gloss: 0.35,
    });

    const { height, centre: centreY } = boardExtent(this.config);

    const board = createStaticBox(
      'board-face',
      new pc.Vec3(this.config.width, height, this.config.wallThickness),
      material,
      SURFACE.board,
    );
    board.setLocalPosition(0, centreY, -this.config.depth / 2 - this.config.wallThickness / 2);
    this.root.addChild(board);

    // Emissive trim down both edges, so the board has a readable silhouette
    // against the dark backdrop.
    const trimMaterial = materials.get({
      color: SCENE_COLORS.boardTrim,
      emissiveIntensity: 0.85,
      metalness: 0.2,
      gloss: 0.9,
    });
    for (const side of [-1, 1] as const) {
      const trim = new pc.Entity('board-trim');
      trim.addComponent('render', { type: 'box', material: trimMaterial, castShadows: false });
      trim.setLocalScale(0.22, height, 0.22);
      trim.setLocalPosition(
        side * (this.config.width / 2 + this.config.wallThickness * 0.5),
        centreY,
        this.config.depth * 0.55,
      );
      this.root.addChild(trim);
    }
  }

  private buildSideWalls(materials: MaterialFactory): void {
    const material = materials.get({
      color: SCENE_COLORS.wall,
      metalness: 0.45,
      gloss: 0.6,
    });

    const { height, centre: centreY } = boardExtent(this.config);

    for (const side of [-1, 1] as const) {
      const wall = createStaticBox(
        'side-wall',
        new pc.Vec3(this.config.wallThickness, height, this.config.depth * 1.4),
        material,
        SURFACE.wall,
      );
      wall.setLocalPosition(
        side * (this.config.width / 2 + this.config.wallThickness / 2),
        centreY,
        0,
      );
      this.root.addChild(wall);
    }
  }

  /**
   * Invisible front pane. Collider only, no render component — the marbles need
   * containing, but a visible sheet of glass between the camera and the race
   * would only get in the way (PRD §14: effects must never obscure the result).
   */
  /**
   * Lid over the top of the board.
   *
   * The launchers throw marbles up around forty units, which is more than
   * enough to clear the top of the hopper. Anything that leaves through the
   * open top is outside the walls and the glass, and simply falls out of the
   * world — so the board is closed. It also makes the ricochet off the top
   * part of the show rather than a lost marble.
   */
  private buildCeiling(materials: MaterialFactory): void {
    const { top } = boardExtent(this.config);
    const material = materials.get({
      color: SCENE_COLORS.boardTrim,
      emissiveIntensity: 0.5,
      metalness: 0.4,
      gloss: 0.8,
    });

    const thickness = 0.8;
    const ceiling = createStaticBox(
      'ceiling',
      new pc.Vec3(this.config.width + this.config.wallThickness * 2, thickness, this.config.depth * 1.4),
      material,
      SURFACE.wall,
    );
    ceiling.setLocalPosition(0, top + thickness / 2, 0);
    this.root.addChild(ceiling);
  }

  private buildGlass(): void {
    const { height, centre: centreY } = boardExtent(this.config);

    // Thickness must clear MIN_COLLIDER_THICKNESS: a launched marble at full
    // speed would pass straight through a thin pane between steps and escape
    // the board entirely. Positioned so its inner face stays where the cavity
    // needs it, regardless of how thick the pane is.
    const glassHalfThickness = 0.4;
    const glass = new pc.Entity('front-glass');
    glass.setLocalPosition(0, centreY, this.config.depth / 2 + glassHalfThickness);
    glass.addComponent('collision', {
      type: 'box',
      halfExtents: new pc.Vec3(this.config.width / 2, height / 2, glassHalfThickness),
    });
    glass.addComponent('rigidbody', {
      type: 'static',
      friction: 0.02,
      restitution: 0.1,
    });
    this.root.addChild(glass);
  }

  /**
   * World-space position of a start slot, used by MarbleManager.
   *
   * Large fields stack into rows above the start line; the hopper those rows
   * occupy is enclosed by the board, walls and glass (see `startAreaHeight`),
   * so nothing spawns outside the world.
   */
  startSlotWorld(index: number, count: number, jitterX: number, jitterZ: number): pc.Vec3 {
    const perRow = Math.min(count, Math.max(1, Math.floor(this.config.width / START_GRID.minSpacing)));
    const row = Math.floor(index / perRow);
    const column = index % perRow;
    const spacing = this.config.width / (perRow + 1);

    const x = -this.config.width / 2 + spacing * (column + 1) + jitterX;
    const y = this.config.startY + row * START_GRID.rowPitch;
    return this.localToWorld(x, y, jitterZ);
  }

  /** Radians of board tilt, for camera framing. */
  get tiltRadians(): number {
    return this.config.tiltDegrees * DEG_TO_RAD;
  }

  destroy(): void {
    this.moving.length = 0;
    this.root.destroy();
  }
}

function buildObstacle(spec: ObstacleSpec, context: ObstacleContext): Obstacle {
  switch (spec.kind) {
    case 'bumper':
      return createBumper(spec, context);
    case 'slantedWall':
      return createSlantedWall(spec, context);
    case 'verticalWall':
      return createVerticalWall(spec, context);
    case 'narrowPassage':
      return createNarrowPassage(spec, context);
    case 'splitter':
      return createSplitter(spec, context);
    case 'funnel':
      return createFunnel(spec, context);
    case 'rotor':
      return createRotor(spec, context);
    case 'deflector':
      return createDeflector(spec, context);
    case 'launcher':
      return createLauncher(spec, context);
    case 'meltBall':
      return createMeltBall(spec, context);
    case 'logoBar':
      return createLogoBar(spec, context);
    default: {
      const exhaustive: never = spec;
      throw new Error(`Unhandled obstacle spec: ${JSON.stringify(exhaustive)}`);
    }
  }
}
