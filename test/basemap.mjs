import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://localhost:3301'; const OUT = process.env.OUT || '../screenshots/basemap'; const sl = t => new Promise(r => setTimeout(r, t));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [], info = {};
const views = [['vn', 108.5, 15.5, 5], ['hoangsa', 112.0, 16.4, 8], ['truongsa', 114.2, 10.0, 7], ['hanoi', 105.85, 21.03, 12], ['hcm-street', 106.627, 10.783, 16], ['danang', 108.22, 16.06, 14]];
for (const [dev, vp] of [['d', { width: 1440, height: 900 }], ['m', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const p = await b.newPage(); await p.setViewport(vp); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 90000 }); await sl(2000);
  for (const [n, lon, lat, z] of views) {
    await p.evaluate((lon, lat, z) => __map.jumpTo({ center: [lon, lat], zoom: z }), lon, lat, z);
    await p.evaluate(() => new Promise(r => { const t = setTimeout(r, 15000); __map.once('idle', () => { clearTimeout(t); r(); }); })); await sl(800);
    if (n === 'hoangsa' || n === 'truongsa' || n === 'vn') info[dev + n] = await p.evaluate(() => [...new Set(__map.queryRenderedFeatures().filter(f => f.properties && (f.properties.name || f.properties.n)).map(f => f.layer.id + ':' + (f.properties['name:vi'] || f.properties.name || f.properties.n)))].slice(0, 60));
    await p.screenshot({ path: `${OUT}/${dev}-${n}-z${z}.png` });
  }
  if (dev === 'd') { await p.evaluate(() => __map.jumpTo({ center: [106.627, 10.783], zoom: 16 })); await sl(3000); await p.mouse.click(720, 450); await sl(3500); info.popup = await p.evaluate(() => document.querySelector('.maplibregl-popup')?.innerText); await p.screenshot({ path: `${OUT}/d-click-popup.png` }); await p.click('.lyr-b').catch(() => {}); await sl(400); await p.screenshot({ path: `${OUT}/d-layers.png` }); }
}
console.log(JSON.stringify({ info, errs: [...new Set(errs)].slice(0, 15) }, null, 1)); await b.close();
