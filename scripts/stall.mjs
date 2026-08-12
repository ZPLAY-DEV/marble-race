import { chromium } from 'playwright';
const seed = Number(process.argv[2] ?? 31337);
const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:900,height:600} });
p.on('pageerror', e => console.log('[err]', e.message));
await p.goto('http://localhost:4173/', { waitUntil:'load' });
await p.waitForFunction(() => window.__marbleRace?.ready === true, { timeout:60000 });
const out = await p.evaluate(s => new Promise(res => {
  const g = window.__marbleRace, t = g.track;
  g.startRaceWithCount(13, s);
  const V = g.marbles.all[0].position.constructor;
  const tick = () => {
    if (g.raceManager.elapsedTime >= 170) {
      const stuck = g.marbles.all.filter(m => m.bestProgress < 0.97);
      const rows = t.root.children.filter(c => c.tags?.has?.('obstacle'))
        .map(c => ({ n:c.name, y:+c.getLocalPosition().y.toFixed(1), x:+c.getLocalPosition().x.toFixed(2) }));
      return res(stuck.map(m => {
        const l = t.worldToLocal(m.position, new V());
        const near = rows.filter(r => Math.abs(r.y - l.y) < 5)
          .sort((a,b)=>Math.abs(a.x-l.x)-Math.abs(b.x-l.x)).slice(0,4);
        return { name:m.participant.name, lx:+l.x.toFixed(2), ly:+l.y.toFixed(2), lz:+l.z.toFixed(2),
                 sp:+m.speed.toFixed(2), resc:m.rescueCount, near: near.map(r=>`${r.n}@x${r.x}y${r.y}`) };
      }));
    }
    if (g.raceManager.state === 'RESULT') return res([]);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}), seed);
console.log(`seed ${seed}:`);
for (const s of out) console.log(` ${s.name} at x=${s.lx} y=${s.ly} z=${s.lz} v=${s.sp} rescues=${s.resc}\n   near: ${s.near.join('  ')}`);
if (!out.length) console.log('  none stuck');
await b.close();
