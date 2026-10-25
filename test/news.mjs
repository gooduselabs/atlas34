import puppeteer from 'puppeteer-core'; const sl = t => new Promise(r => setTimeout(r, t)); const B = process.env.BASE || 'http://localhost:3301';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); const out = {};
for (const [n, vp, u] of [['d', { width: 1440, height: 900 }, '/tinh/ha-noi'], ['m', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, '/tinh/quang-ngai']]) {
  const p = await b.newPage(); await p.setViewport(vp); await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await p.goto(B + u, { waitUntil: 'networkidle0' }); await sl(1500);
  out[n] = await p.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, links: [...document.querySelectorAll('a.newsl')].map(a => [a.textContent, a.target, a.rel, a.parentElement.textContent.trim()]) }));
  if (n === 'm') await p.evaluate(() => { document.querySelector('#folio').classList.add('full'); }); await sl(500);
  await p.evaluate(() => document.querySelector('.leaders')?.scrollIntoView({ block: 'center' })); await sl(600);
  await p.screenshot({ path: `../screenshots/news/${n}-leader-source.png` });
}
console.log(JSON.stringify(out, null, 1)); await b.close();
