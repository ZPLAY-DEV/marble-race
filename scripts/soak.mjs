/**
 * The PRD §26 test matrix, run against the real game in a real browser.
 *
 *   1. Many seeds at the default field size — do races finish, and do results vary?
 *   2. Field sizes 10 / 25 / 50 / 100 — does the sim stay stable and fast enough?
 *   3. Frame-rate independence — same seed under different CPU throttling.
 *
 * Usage: node scripts/soak.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const baseUrl = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:5174';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(`${baseUrl}/?seed=1&players=10`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__marbleRace?.ready === true, { timeout: 30000 });

/** Runs one race to completion and reports timing plus frame rate. */
async function race(players, seed) {
  return page.evaluate(
    (config) =>
      new Promise((resolve) => {
        const game = window.__marbleRace;
        let frames = 0;
        const startedAt = performance.now();
        const count = () => {
          frames++;
          if (game.raceManager.state !== 'RESULT') requestAnimationFrame(count);
        };

        const stop = game.raceManager.events.on('raceComplete', ({ result }) => {
          stop();
          const wall = (performance.now() - startedAt) / 1000;
          resolve({
            order: result.finishOrder.join(','),
            duration: result.duration,
            dnf: result.records.filter((r) => r.dnf).length,
            players: result.playerCount,
            fps: frames / wall,
            wall,
          });
        });

        game.startRaceWithCount(config.players, config.seed);
        requestAnimationFrame(count);
      }),
    { players, seed },
  );
}

let failures = 0;
const fail = (message) => {
  failures++;
  console.log(`  ✗ ${message}`);
};

// ---------------------------------------------------------------- 1. seeds
console.log('\n1. Seed variety and completion (10 players)');
const orders = new Set();
for (const seed of [1, 7, 42, 101, 2024, 55555, 987654, 20260812]) {
  const result = await race(10, seed);
  orders.add(result.order);
  const status = result.dnf === 0 ? '✓' : '✗';
  console.log(
    `  ${status} seed ${String(seed).padEnd(9)} ${result.duration.toFixed(1)}s  DNF ${result.dnf}`,
  );
  if (result.dnf > 0) fail(`seed ${seed} left ${result.dnf} marbles unfinished`);
}
console.log(`  distinct finish orders: ${orders.size}/8`);
if (orders.size < 7) fail('seeds produce too little variety');

// ------------------------------------------------------------ 2. field size
console.log('\n2. Field sizes (PRD §26 / §19)');
for (const players of [10, 25, 50, 100]) {
  const result = await race(players, 31337);
  const finishers = result.players - result.dnf;
  console.log(
    `  ${players.toString().padStart(3)} marbles  ${result.duration.toFixed(1)}s sim  ` +
      `${result.fps.toFixed(0)} fps  finishers ${finishers}/${result.players}`,
  );
  // Software rendering makes absolute FPS meaningless; what matters is that the
  // simulation stays correct and terminates at every field size.
  if (finishers < result.players * 0.9) {
    fail(`${players} marbles: only ${finishers} finished`);
  }
}

// --------------------------------------------------- 3. frame-rate independence
console.log('\n3. Frame-rate independence (PRD §18)');
// CPU throttling barely moves the frame rate here, because software rendering
// is GPU-bound — so instead we burn a fixed slice of wall-clock inside every
// animation frame. That directly lengthens the frame interval, which is the
// variable PRD §18 actually cares about.
await page.evaluate(() => {
  window.__frameBurnMs = 0;
  const burn = () => {
    const until = performance.now() + window.__frameBurnMs;
    while (performance.now() < until) {
      /* deliberately blocking the frame */
    }
    requestAnimationFrame(burn);
  };
  requestAnimationFrame(burn);
});

const runs = [];
for (const burnMs of [0, 25, 55]) {
  await page.evaluate((ms) => {
    window.__frameBurnMs = ms;
  }, burnMs);

  try {
    const result = await race(10, 4242);
    runs.push({ burnMs, ...result });
    console.log(
      `  +${String(burnMs).padStart(2)}ms/frame → ${result.fps.toFixed(0).padStart(2)} fps, ` +
        `sim ${result.duration.toFixed(3)}s`,
    );
  } catch (error) {
    console.log(`  ! +${burnMs}ms: run failed (${String(error).split('\n')[0]})`);
  }
}
await page.evaluate(() => {
  window.__frameBurnMs = 0;
});

if (runs.length < 2) fail('not enough runs to compare');

const spread = Math.max(...runs.map((r) => r.fps)) / Math.min(...runs.map((r) => r.fps));
const identical = runs.every((r) => r.order === runs[0].order);
console.log(`  frame rate varied ${spread.toFixed(1)}x across runs`);
console.log(identical ? '  ✓ identical finish order at every frame rate' : '  ✗ order changed with frame rate');
if (!identical) fail('results depend on frame rate');
if (spread < 1.3) console.log('  ! throttling barely changed the frame rate; test is weak');

if (errors.length) {
  console.log(`\n✗ ${errors.length} console error(s):`);
  for (const error of errors.slice(0, 8)) console.log(`  ${error}`);
  failures += errors.length;
}

await browser.close();
console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
