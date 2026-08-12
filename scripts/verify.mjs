/**
 * Runtime verification harness.
 *
 * Drives the real game in a real browser: boots it, watches a full race, and
 * asserts the PRD §30 completion conditions actually happen. Static types and
 * unit tests can't tell you whether marbles reach the finish line — only
 * running the physics can.
 *
 * Usage: node scripts/verify.mjs [baseUrl] [--players N] [--seed N] [--shots]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const baseUrl = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5174';
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};
const players = flag('players', 10);
const seed = flag('seed', 20260812);
const wantShots = args.includes('--shots');
const shotDir = new URL('../.verify/', import.meta.url).pathname;

if (wantShots) mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const url = `${baseUrl}/?seed=${seed}&players=${players}`;
console.log(`→ ${url}`);
await page.goto(url, { waitUntil: 'load' });

// The game exposes itself for exactly this purpose; wait for physics to be live.
await page.waitForFunction(() => window.__marbleRace?.ready === true, { timeout: 30000 });
console.log('✓ booted, physics world created');

const boot = await page.evaluate(() => {
  const game = window.__marbleRace;
  return {
    state: game.raceManager.state,
    marbles: game.marbleCount,
    obstacles: game.obstacleCount,
    seed: game.raceManager.currentSeed,
  };
});
console.log(`✓ scene: ${boot.marbles} marbles, ${boot.obstacles} obstacles, seed ${boot.seed}`);
if (boot.marbles !== players) throw new Error(`expected ${players} marbles, got ${boot.marbles}`);

if (wantShots) await page.screenshot({ path: `${shotDir}01-start.png` });

// Watch a full race on the fixed seed, so the replay below is comparable.
await page.evaluate((c) => window.__marbleRace.startRaceWithCount(c.players, c.seed), { players, seed });

const seen = new Set();
let shotAt = 0;
const started = Date.now();
let last = null;

while (Date.now() - started < 120000) {
  last = await page.evaluate(() => {
    const game = window.__marbleRace;
    const race = game.raceManager;
    return {
      state: race.state,
      elapsed: race.elapsedTime,
      finished: race.ranking.finishedCount,
      lead: game.leadProgress,
      result: race.lastResult,
    };
  });

  if (!seen.has(last.state)) {
    seen.add(last.state);
    console.log(`  ${last.state.padEnd(9)} t=${last.elapsed.toFixed(1)}s`);
  }

  if (wantShots && last.state === 'RACING' && Date.now() - shotAt > 2500) {
    shotAt = Date.now();
    const index = String(seen.size + Math.floor((Date.now() - started) / 2500)).padStart(2, '0');
    await page.screenshot({ path: `${shotDir}${index}-racing.png` });
  }

  if (last.state === 'RESULT') break;
  await page.waitForTimeout(250);
}

if (last?.state !== 'RESULT') {
  throw new Error(`race did not reach RESULT (stuck in ${last?.state}, lead ${last?.lead})`);
}

const result = last.result;
console.log(`✓ race complete in ${result.duration.toFixed(2)}s`);
console.log(`  order: ${result.finishOrder.join(' > ')}`);

const dnf = result.records.filter((r) => r.dnf);
console.log(`  finishers ${result.records.length - dnf.length}/${result.records.length}, DNF ${dnf.length}`);

if (dnf.length) {
  const snapshot = await page.evaluate(() => window.__marbleRace.snapshot());
  console.log('  where the stragglers stopped:');
  for (const entry of snapshot.filter((s) => !s.finished).sort((a, b) => b.progress - a.progress)) {
    console.log(`    ${entry.id}  progress ${(entry.progress * 100).toFixed(1)}%  speed ${entry.speed}`);
  }
}

// PRD §30: the result panel must actually be on screen.
await page.waitForSelector('#result:not([hidden])', { timeout: 5000 });
const rows = await page.locator('#result-list li').count();
if (rows !== players) throw new Error(`result list shows ${rows} rows, expected ${players}`);
console.log(`✓ result screen shows ${rows} ranked rows`);

if (wantShots) await page.screenshot({ path: `${shotDir}99-result.png` });

// Determinism: same seed, same finish order (PRD §18, §26).
const rerun = await page.evaluate(async (config) => {
  const game = window.__marbleRace;
  game.startRaceWithCount(config.players, config.seed);
  return new Promise((resolve) => {
    const stop = game.raceManager.events.on('raceComplete', ({ result }) => {
      stop();
      resolve(result.finishOrder);
    });
  });
}, { players, seed });

const first = result.finishOrder.join(',');
const second = rerun.join(',');
console.log(second === first ? '✓ determinism: identical order on replay' : '✗ determinism: DIVERGED');
if (second !== first) {
  console.log(`  run 1: ${first}`);
  console.log(`  run 2: ${second}`);
}

if (errors.length) {
  console.log(`\n✗ ${errors.length} console error(s):`);
  for (const error of errors.slice(0, 10)) console.log(`  ${error}`);
}

await browser.close();

const ok = last.state === 'RESULT' && second === first && errors.length === 0;
console.log(ok ? '\nPASS' : '\nFAIL');
process.exit(ok ? 0 : 1);
