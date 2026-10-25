import puppeteer from 'puppeteer-core'; const sl = t => new Promise(r => setTimeout(r, t));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); p.on('pageerror', e => console.log('ERR', e.stack));
await p.goto('http://localhost:3300/doi-dia-chi?cu=27433&dc=Tr%E1%BB%8Bnh%20Quang%20Ngh%E1%BB%8B', { waitUntil: 'networkidle0' }); await sl(3000);
await p.click('#pk'); await sl(800); const bx = await p.$eval('#map', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await p.touchscreen.tap(bx[0], bx[1]); await sl(2500);
console.log(await p.evaluate(() => document.querySelector('#res').innerText.slice(0, 300))); await b.close();
