import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://localhost:3300'; const OUT = process.env.OUT; const TAG = process.env.TAG || 'after';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = []; const W = ms => new Promise(r => setTimeout(r, ms));
const D = { width: 1440, height: 900 }, M = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
async function shot(name, url, vp, fn) { const p = await b.newPage(); await p.setViewport(vp); p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await p.goto(BASE + url, { waitUntil: 'networkidle0', timeout: 60000 }); await W(2000); if (fn) await fn(p); await W(1200);
  await p.screenshot({ path: `${OUT}/${TAG}-${name}.png`, fullPage: vp === M }); await p.close(); }
const free = async p => { if (await p.$('#fa')) { await p.click('#how [data-h=text]'); await p.type('#fa', '60 đường số 1, Phường Tân Thành, Quận Tân Phú, TP.HCM'); await p.click('#go'); } else { await p.type('#cq', '60 đường số 1, Phường Tân Thành, Quận Tân Phú, TP.HCM'); await W(600); await p.keyboard.press('Enter'); } };
for (const [vp, s] of [[D, 'desktop'], [M, 'mobile']]) {
  await shot('empty-' + s, '/doi-dia-chi', vp);
  await shot('freetext-' + s, '/doi-dia-chi', vp, free);
  await shot('split-' + s, '/doi-dia-chi?cu=00583', vp);
  if (TAG !== 'before') { await shot('pick-' + s, '/doi-dia-chi', vp, async p => { await p.click('#how [data-h=pick]'); await W(500);
    const choose = async (i, txt) => { const b = (await p.$$('.pk-b'))[i]; await b.click(); await W(300); await p.keyboard.type(txt); await W(300); await p.keyboard.press('Enter'); await W(900); };
    await choose(0, 'ha noi'); await choose(1, 'gia lam'); await choose(2, 'bat trang'); });
    await shot('newold-' + s, '/doi-dia-chi?moi=00577', vp); }
}
console.log(JSON.stringify(errs)); await b.close();
