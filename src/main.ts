import * as pc from 'playcanvas';
import { Game } from './core/Game';
import { clampPlayerCount, DEFAULT_GAME_CONFIG } from './core/GameConfig';
import { loadAmmo } from './physics/AmmoLoader';
import { parseRaceParams } from './race/RaceResult';
import { runSelfTest } from './dev/SelfTest';
import { requireElement } from './ui/dom';

/**
 * Entry point.
 *
 * Ammo has to finish loading before the PlayCanvas app is constructed, because
 * the engine only creates its physics world if `Ammo` is already a global. That
 * ordering is the one hard constraint in the whole bootstrap.
 */
async function boot(): Promise<void> {
  const canvas = requireElement<HTMLCanvasElement>('game-canvas');
  const params = parseRaceParams(location.search);

  const app = new pc.Application(canvas, {
    graphicsDeviceOptions: {
      alpha: true, // lets the CSS gradient backdrop show through
      antialias: true,
      powerPreference: 'high-performance',
    },
    mouse: new pc.Mouse(canvas),
    touch: new pc.TouchDevice(canvas),
  });

  app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  window.addEventListener('resize', () => app.resizeCanvas());

  // Transparent clear so the page's gradient shows behind the board.
  app.scene.clusteredLightingEnabled = false;

  const game = new Game(app, {
    seed: params.seed,
    // Left undefined when the URL says nothing, so Game falls back to the full
    // default roster. Passing a number here unconditionally would mean the
    // checkbox line-up could never decide the opening field size.
    playerCount: params.players
      ? clampPlayerCount(params.players, DEFAULT_GAME_CONFIG)
      : undefined,
  });

  // start() is what triggers onLibrariesLoaded -> the rigidbody system builds
  // its Ammo world. Nothing physical can exist before this line.
  app.start();

  if (!game.ready) {
    game.fail('PHYSICS FAILED TO INITIALISE');
    return;
  }

  game.initialise();
  game.markReady();

  // Exposed for the runtime verification harness (scripts/verify.mjs) and for
  // poking at a race from the devtools console. Read-only in practice; nothing
  // in the game reads it back.
  (window as unknown as { __marbleRace: Game }).__marbleRace = game;

  if (params.selftest) {
    runSelfTest(game);
  }
}

loadAmmo()
  .then(boot)
  .catch((error: unknown) => {
    console.error('[marble-race] boot failed', error);
    const boot = document.getElementById('boot');
    const status = boot?.querySelector('.boot__status');
    if (status) status.textContent = 'FAILED TO START — SEE CONSOLE';
  });
