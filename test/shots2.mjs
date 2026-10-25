import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://localhost:3300'; const OUT = process.env.OUT || '../screenshots'; const sl = t => new Promise(r => setTimeout(r, t));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const M = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }; const errs = []; const out = {};
async function pg(url) { const p = await b.newPage(); await p.setViewport(M); p.on('pageerror', e => errs.push(e.message)); await p.goto(BASE + url, { waitUntil: 'networkidle0', timeout: 90000 }); await sl(2500); return p; }
// 1. exact user flow
let p = await pg('/doi-dia-chi');
await p.type('#cq', '60 đường số 1, Phường Tân Thành, Quận Tân Phú, TP.HCM', { delay: 15 }); await sl(1200);
await p.keyboard.press('Enter'); await sl(3500);
out.sample = await p.evaluate(() => ({ street: document.querySelector('#st').value, method: document.querySelector('.method')?.innerText, hit: document.querySelector('.cand.def .nm')?.innerText, url: location.href }));
await p.screenshot({ path: `${OUT}/m1-user-sample-map.png` });
await p.evaluate(() => document.querySelector('#res').scrollIntoView()); await sl(500); await p.screenshot({ path: `${OUT}/m2-user-sample-result.png` });
await p.evaluate(() => document.querySelector('.cand.def details')?.setAttribute('open', '')); await sl(300); await p.evaluate(() => document.querySelector('.cand.def').scrollIntoView()); await p.screenshot({ path: `${OUT}/m3-user-sample-legal.png` });
// 2. street crossing units
p = await pg('/doi-dia-chi?cu=27433&dc=' + encodeURIComponent('Trịnh Quang Nghị')); await sl(1500);
out.amb = await p.evaluate(() => document.querySelector('.warnbox')?.innerText);
await p.evaluate(() => document.querySelector('#res').scrollIntoView()); await sl(400); await p.screenshot({ path: `${OUT}/m4-ambiguous-street.png` });
// 3. pick on map
await p.click('#pk'); await sl(1200); const box = await p.$eval('#map', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await p.screenshot({ path: `${OUT}/m5-pick-mode.png` }); await p.touchscreen.tap(box[0], box[1]); await sl(3000);
out.pick = await p.evaluate(() => ({ method: document.querySelector('.method')?.innerText, hit: document.querySelector('.cand.def .nm')?.innerText }));
await p.screenshot({ path: `${OUT}/m6-picked-point.png` });
// 4. split without street: stamps must not overlap names
p = await pg('/doi-dia-chi?cu=00583'); await p.evaluate(() => document.querySelector('#res').scrollIntoView()); await sl(400);
out.overlap = await p.evaluate(() => [...document.querySelectorAll('.cand')].map(c => { const a = c.querySelector('.stamp, .kick')?.getBoundingClientRect(), n = c.querySelector('.nm').getBoundingClientRect(); return a ? !(a.bottom <= n.top + 1 || a.right <= n.left || a.left >= n.right) : false; }));
await p.screenshot({ path: `${OUT}/m7-split-no-overlap.png` });
console.log(JSON.stringify({ out, errs }, null, 1)); await b.close();
