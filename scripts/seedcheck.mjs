import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:900,height:600} });
p.on('pageerror', e => console.log('[err]', e.message));
await p.goto('http://localhost:4173/?players=13', { waitUntil:'load' });
await p.waitForFunction(() => window.__marbleRace?.ready === true, { timeout:60000 });
const race = (seed) => p.evaluate(s => new Promise(res => {
  const g = window.__marbleRace;
  const stop = g.raceManager.events.on('raceComplete', ({result}) => { stop();
    res({ dur:+result.duration.toFixed(1), dnf:result.records.filter(r=>r.dnf).length,
          order:result.finishOrder.join(','), n:result.playerCount }); });
  g.startRaceWithCount(13, s);
}), seed);
let bad = 0;
for (const seed of [1, 42, 777, 20260812, 31337, 8888]) {
  const r = await race(seed);
  const ok = r.dnf === 0;
  if (!ok) bad++;
  console.log(`  ${ok?'✓':'✗'} seed ${String(seed).padEnd(9)} ${String(r.dur).padStart(5)}s  ${r.n-r.dnf}/${r.n} finished`);
}
console.log(bad ? `\nFAIL (${bad})` : '\nPASS');
await b.close();
process.exit(bad?1:0);
