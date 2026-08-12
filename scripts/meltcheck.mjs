import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1440,height:900} });
p.on('pageerror', e => console.log('[err]', e.message));
await p.goto('http://localhost:4173/', { waitUntil:'load' });
await p.waitForFunction(() => window.__marbleRace?.ready === true, { timeout:60000 });

// --- shuffle must change the names shown on the marbles, not just the list
const before = await p.evaluate(() => window.__marbleRace.marbles.all.map(m => m.participant.name).join(','));
await p.click('#roster-shuffle');
await p.waitForTimeout(900);
const after = await p.evaluate(() => window.__marbleRace.marbles.all.map(m => m.participant.name).join(','));
const listAfter = await p.evaluate(() => [...document.querySelectorAll('#roster-list .roster__item span:last-child')].map(n=>n.textContent).join(','));
console.log('shuffle changed marble order :', before !== after);
console.log('marbles match list order     :', after === listAfter);

// --- melt balls exist, block, then disappear
const counts = await p.evaluate(() => ({
  total: window.__marbleRace.track.root.findByTag('melt-ball').length,
}));
console.log('melt balls built             :', counts.total);
await p.click('#start-button');
const melt = await p.evaluate(() => new Promise(res => {
  const g = window.__marbleRace;
  const all = g.track.root.findByTag('melt-ball');
  const tick = () => {
    const alive = all.filter(e => e.enabled).length;
    if (alive < all.length * 0.5) return res({ alive, total: all.length, t: g.raceManager.elapsedTime });
    if (g.raceManager.state === 'RESULT') return res({ alive, total: all.length, t: g.raceManager.elapsedTime });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));
console.log(`melted to ${melt.total - melt.alive}/${melt.total} by t=${melt.t.toFixed(1)}s`);
await p.screenshot({ path: new URL('../.verify/melt.png', import.meta.url).pathname });
await b.close();
