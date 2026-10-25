import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://localhost:8099/atlas34'; const OUT = process.env.OUT || '../screenshots/pages'; const sl = t => new Promise(r => setTimeout(r, t));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const M = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }; const errs = [], out = {};
async function pg(u) { const p = await b.newPage(); await p.setViewport(M); p.on('pageerror', e => errs.push(u + ': ' + e.message)); p.on('requestfailed', r => errs.push('fail ' + r.url())); p.on('response', r => r.status() >= 400 && errs.push(r.status() + ' ' + r.url())); await p.goto(BASE + u, { waitUntil: 'networkidle0', timeout: 90000 }); await sl(2500); return p; }
let p = await pg('/');
out.home = await p.evaluate(() => ({ isl: [...document.querySelectorAll('.lbl-isl')].map(e => e.innerText.replace(/\n/g, ' ')), h1: document.querySelector('.folio h1')?.innerText, font: getComputedStyle(document.querySelector('.folio h1')).fontFamily }));
await p.screenshot({ path: `${OUT}/p1-home.png` });
p = await pg('/doi-dia-chi/'); await p.type('#cq', '60 đường số 1, Phường Tân Thành, Quận Tân Phú, TP.HCM', { delay: 15 }); await sl(2500); await p.keyboard.press('Enter'); await sl(4000);
out.sample = await p.evaluate(() => ({ method: document.querySelector('.method')?.innerText, hit: document.querySelector('.cand.def .nm')?.innerText, legal: document.querySelector('.cand.def .legal summary')?.innerText, url: location.href }));
await p.screenshot({ path: `${OUT}/p2-convert-map.png` }); await p.evaluate(() => document.querySelector('#res').scrollIntoView()); await sl(400); await p.screenshot({ path: `${OUT}/p3-convert-result.png` });
p = await pg('/doi-dia-chi/?cu=27433&dc=' + encodeURIComponent('Trịnh Quang Nghị')); await p.click('#pk'); await sl(1000);
const bx = await p.$eval('#map', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await p.touchscreen.tap(bx[0], bx[1]); await sl(3000);
out.pick = await p.evaluate(() => document.querySelector('.method')?.innerText); await p.evaluate(() => document.querySelector('#res').scrollIntoView()); await p.screenshot({ path: `${OUT}/p4-pick.png` });
p = await pg('/tinh/khanh-hoa/'); out.kh = await p.evaluate(() => document.querySelector('.folio h1')?.innerText); await p.evaluate(() => scrollTo(0, 450)); await sl(500); await p.screenshot({ path: `${OUT}/p5-province.png` });
p = await pg('/tinh/da-nang'); await p.click('.tabs a[data-view="index"]'); await sl(1500); out.nav = await p.evaluate(() => location.pathname); await p.screenshot({ path: `${OUT}/p6-index.png` });
console.log(JSON.stringify({ out, errs: [...new Set(errs)] }, null, 1)); await b.close();
