import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1440,height:900} });
p.on('pageerror', e => console.log('[err]', e.message));
await p.goto('http://localhost:4173/', { waitUntil:'load' });
await p.waitForFunction(() => window.__marbleRace?.ready === true, { timeout:60000 });

// Any marble still in the top 15% of the board 15s in counts as "stuck at the start".
const check = (seed) => p.evaluate(s => new Promise(res => {
  const g = window.__marbleRace;
  g.startRaceWithCount(13, s);
  const tick = () => {
    if (g.raceManager.elapsedTime >= 15) {
      return res(g.marbles.all.filter(m => m.bestProgress < 0.15)
        .map(m => `${m.participant.name}(${(m.bestProgress*100).toFixed(0)}% resc${m.rescueCount})`));
    }
    if (g.raceManager.state === 'RESULT') return res([]);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}), seed);

let bad = 0;
for (const seed of [1, 42, 777, 20260812, 31337, 8888]) {
  const stuck = await check(seed);
  if (stuck.length) bad++;
  console.log(`  ${stuck.length ? '✗' : '✓'} seed ${String(seed).padEnd(9)} ${stuck.length ? stuck.join('  ') : 'all clear of the start'}`);
}
console.log(bad ? `\nFAIL (${bad})` : '\nPASS');
await b.close();
