/**
 * Captures screenshots at the key moments of a race, for eyeballing the visual
 * design. Each step is independently guarded: races are long now, and a slow
 * software-rendered run should still yield the shots it did reach.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const baseUrl = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:4173';
const dir = new URL('../.verify/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(240000);

await page.goto(`${baseUrl}/?seed=20260812&players=10`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__marbleRace?.ready === true, { timeout: 60000 });

const shot = async (name) => {
  await page.screenshot({ path: `${dir}${name}.png` });
  console.log('  captured', name);
};

const step = async (name, wait) => {
  try {
    if (wait) await wait();
    await shot(name);
  } catch (error) {
    console.log(`  ! ${name} skipped: ${String(error).split('\n')[0]}`);
  }
};

await page.waitForTimeout(1500);
await shot('1-startline');

await page.evaluate(() => window.__marbleRace.startRaceWithCount(10, 20260812));

await step('2-countdown', async () => {
  await page.waitForFunction(() => window.__marbleRace.raceManager.state === 'COUNTDOWN', {
    timeout: 15000,
  });
  await page.waitForTimeout(900);
});

await step('3-racing', () =>
  page.waitForFunction(() => window.__marbleRace.leadProgress > 0.2, { timeout: 240000 }),
);

await step('4-finishline', () =>
  page.waitForFunction(() => window.__marbleRace.leadProgress > 0.85, { timeout: 240000 }),
);

await step('5-result', async () => {
  await page.waitForFunction(() => window.__marbleRace.raceManager.state === 'RESULT', {
    timeout: 240000,
  });
  await page.waitForTimeout(1500);
});

console.log('shots written to', dir);
await browser.close();
