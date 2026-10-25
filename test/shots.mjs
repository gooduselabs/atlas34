import puppeteer from 'puppeteer-core'; import fs from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:3300'; const OUT = process.env.OUT || '../screenshots';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = []; const res = {};
async function shot(name, url, vp, fn) {
  const p = await b.newPage(); await p.setViewport(vp); p.on('pageerror', e => errs.push(name + ': ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(name + ' console: ' + m.text()));
  await p.goto(BASE + url, { waitUntil: 'networkidle0', timeout: 60000 }); await new Promise(r => setTimeout(r, 2500));
  if (fn) await fn(p); res[name] = await p.evaluate(() => ({ title: document.title, canvas: !!document.querySelector('.maplibregl-canvas'), labels: [...document.querySelectorAll('.lbl-isl')].map(e => e.innerText.replace(/\n/g, ' ')), h1: document.querySelector('.folio h1')?.innerText }));
  await p.screenshot({ path: `${OUT}/${name}.png` }); await p.close();
}
const D = { width: 1440, height: 900 }, M = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
await shot('01-home-desktop', '/', D);
await shot('02-province-danang-desktop', '/tinh/da-nang', D);
await shot('03-province-khanhhoa-desktop', '/tinh/khanh-hoa', D);
await shot('04-convert-split-desktop', '/doi-dia-chi?cu=00583', D);
await shot('05-convert-new-old-desktop', '/doi-dia-chi?moi=00577', D);
await shot('06-autocomplete-desktop', '/doi-dia-chi', D, async p => { await p.type('#cq', 'dien ban quang nam', { delay: 30 }); await new Promise(r => setTimeout(r, 800)); });
await shot('07-index-desktop', '/chi-muc', D);
await shot('08-home-mobile', '/', M);
await shot('09-province-mobile', '/tinh/ha-noi', M, async p => { await p.evaluate(() => scrollTo(0, 500)); await new Promise(r => setTimeout(r, 600)); });
await shot('10-convert-mobile', '/doi-dia-chi?cu=00583', M, async p => { await p.evaluate(() => scrollTo(0, 400)); await new Promise(r => setTimeout(r, 600)); });
await shot('11-admin-login', '/admin', D);
if (process.env.ADMIN_PASSWORD) await shot('12-admin-leaders', '/admin', D, async p => { await p.type('#pw', process.env.ADMIN_PASSWORD); await p.click('.btn'); await new Promise(r => setTimeout(r, 1500)); });
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ res, errs }, null, 1)); console.log(JSON.stringify({ res, errs }, null, 1)); await b.close();
