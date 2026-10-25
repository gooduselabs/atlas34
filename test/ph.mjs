import puppeteer from 'puppeteer-core'; const sl = t => new Promise(r => setTimeout(r, t));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const th of ['light', 'dark']) {
  const p = await b.newPage(); await p.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.evaluateOnNewDocument(t => localStorage.setItem('a34-theme', t), th);
  await p.goto('http://localhost:3301/', { waitUntil: 'networkidle0' }); await p.mouse.wheel({ deltaY: 1 }).catch(() => {}); await p.evaluate(() => dispatchEvent(new Event('scroll')));
  await p.waitForFunction(() => document.querySelector('.map-wrap.live'), { timeout: 60000 }); await sl(3000);
  await p.addStyleTag({ content: '.maplibregl-control-container,.msearch,.lyr,.map-legend,.folio,.mast,.sheet-hint,.map-ph{visibility:hidden!important}' }); await sl(300);
  const el = await p.$('#map'); await el.screenshot({ path: `/tmp/ph-${th}.png` }); console.log(th, await p.evaluate(() => [innerWidth, document.querySelector('#map').getBoundingClientRect().height]));
}
await b.close();
