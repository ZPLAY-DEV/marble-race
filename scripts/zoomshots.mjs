import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const dir = new URL('../.verify/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1440,height:900} });
p.on('pageerror', e => console.log('[err]', e.message));
await p.goto('http://localhost:4173/', { waitUntil:'load' });
await p.waitForFunction(() => window.__marbleRace?.ready === true, { timeout:60000 });
await p.click('#start-button');
await p.waitForFunction(() => window.__marbleRace.leadProgress > 0.2, { timeout:240000 });

for (const [name, zoom] of [['z1-default', 1], ['z2-mid', 2.4], ['z3-flat2d', 4]]) {
  await p.evaluate(z => window.__marbleRace.camera.setZoom(z), zoom);
  await p.waitForTimeout(4000);   // let the damping settle
  await p.screenshot({ path: `${dir}${name}.png` });
  const flat = await p.evaluate(() => window.__marbleRace.camera.isFlattened);
  console.log(`  ${name}: zoom ${zoom}, flattened=${flat}`);
}
await b.close();
