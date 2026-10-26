import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://localhost:3300', OUT = process.env.OUT || '../screenshots/converter'; const W = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); const errs = [];
for (const [vp, s] of [[{ width: 1440, height: 900 }, 'desktop'], [{ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'mobile']]) {
  const p = await b.newPage(); await p.setViewport(vp); p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/doi-dia-chi', { waitUntil: 'networkidle0', timeout: 60000 }); await W(1500);
  await p.click('#how [data-h=text]'); await p.type('#fa', '60 đường số 1 tân thành tân phú'); await p.click('#go'); await W(3000);
  const hero = await p.$eval('#res .cv-hero .a', e => e.innerText).catch(() => null); console.log(s, '->', hero);
  if (s === 'desktop') await p.evaluate(() => document.querySelector('#alt').scrollIntoView({ block: 'start' })); await W(700);
  await p.screenshot({ path: `${OUT}/fuzzy-${s}.png` }); await p.close(); }
console.log(JSON.stringify(errs)); await b.close();
