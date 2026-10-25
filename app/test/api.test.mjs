import test from 'node:test'; import assert from 'node:assert/strict';
const B = process.env.BASE || 'http://localhost:3300'; const j = async u => { const r = await fetch(B + u); return { s: r.status, d: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() }; };
test('counts 34 / 3321', async () => { const { d } = await j('/api/stats'); assert.equal(d.provinces, 34); assert.equal(d.wards, 3321); });
test('NQ202 figures: Đà Nẵng merged from Đà Nẵng + Quảng Nam', async () => { const { d } = await j('/api/province/48');
  assert.deepEqual(d.oldProvinces.sort(), ['Thành phố Đà Nẵng', 'Tỉnh Quảng Nam']); assert.equal(d.area, 11859.59); assert.equal(d.population, 3065628);
  assert.ok(d.wards.some(w => w.name === 'Hoàng Sa')); });
test('Khánh Hòa includes Trường Sa', async () => { const { d } = await j('/api/province/56'); assert.ok(d.wards.some(w => w.name === 'Trường Sa')); });
test('split case: Xã Bát Tràng (Gia Lâm) -> 3 candidates, one default', async () => { const { d } = await j('/api/convert?old=00583');
  assert.equal(d.split, true); assert.equal(d.to.length, 3); assert.equal(d.to.filter(t => t.default).length, 1); assert.equal(d.to[0].default, true); });
test('search old address autocompletes (no diacritics)', async () => { const { d } = await j('/api/search?q=phuc%20xa%20ba%20dinh');
  assert.equal(d[0].w, 'Phường Phúc Xá'); const c = await j('/api/convert?old=' + d[0].id); assert.equal(c.d.to[0].province, 'Thành phố Hà Nội'); });
test('Quảng Nam old ward maps into Đà Nẵng', async () => { const { d } = await j('/api/search?q=hoi%20an%20quang%20nam'); const c = await j('/api/convert?old=' + d[0].id);
  assert.ok(c.d.to.every(t => t.provinceCode === '48')); });
test('new -> old reverse lists sources, flags partial', async () => { const { d } = await j('/api/convert?new=00145'); assert.ok(d.from.length >= 2); assert.ok(d.from.some(o => o.split)); });
test('every split legacy ward has >=2 distinct targets', async () => { const m = await (await fetch(B + '/data/mapping.json')).json();
  for (const r of m.rows) if (r[4].length > 1) assert.equal(new Set(r[4].map(x => x[0])).size, r[4].length); });
test('SEO page + OG + sitemap', async () => { const p = await j('/tinh/khanh-hoa'); assert.match(p.d, /<title>Tỉnh Khánh Ho/); assert.match(p.d, /og:image/); assert.match(p.d, /Trường Sa/);
  assert.equal((await fetch(B + '/og/56.png')).headers.get('content-type'), 'image/png'); assert.match((await j('/sitemap.xml')).d, /tinh\/ca-mau/); });
test('admin is protected', async () => { assert.equal((await j('/api/admin/leaders')).s, 401);
  const r = await fetch(B + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"wrong"}' }); assert.equal(r.status, 401); });
test('admin login + approve flow', { skip: !process.env.ADMIN_PASSWORD }, async () => {
  const r = await fetch(B + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
  assert.equal(r.status, 200); const ck = r.headers.get('set-cookie').split(';')[0];
  const L = await (await fetch(B + '/api/admin/leaders', { headers: { cookie: ck } })).json(); assert.ok(L.length >= 60);
  const bad = await fetch(B + `/api/admin/facts`, { method: 'POST', headers: { cookie: ck, 'content-type': 'application/json' }, body: JSON.stringify({ province: '48', text: 'x' }) }); assert.equal(bad.status, 400);
});
const conv = (id, st) => j(`/api/convert?old=${id}&street=${encodeURIComponent(st)}`).then(r => r.d);
test('user sample: 60 đường số 1, P.Tân Thành, Q.Tân Phú -> exactly Phường Phú Thọ Hòa', async () => {
  const s = (await j('/api/search?q=' + encodeURIComponent('60 đường số 1, Phường Tân Thành, Quận Tân Phú, TP.HCM'))).d;
  assert.equal(s[0].id, '27022'); assert.equal(s[0].street, '60 đường số 1');
  const d = await conv('27022', '60 đường số 1'); assert.equal(d.resolve.method, 'street'); assert.equal(d.resolve.code, '27022');
  assert.match(d.to.find(t => t.code === '27022').name, /Phú Thọ Ho/); assert.equal(d.to.find(t => t.code === '27022').legal.k, 64); });
test('NQ 1685 clauses attached for all 3 Tân Thành candidates', async () => { const d = await conv('27022', ''); assert.deepEqual(d.to.map(t => t.legal.k).sort(), [63, 64, 65]); });
test('house-number hit (OSM addr): 3421 Phạm Thế Hiển, P7 Q8', async () => { const d = await conv('27433', '3421 Phạm Thế Hiển'); assert.equal(d.resolve.method, 'house'); assert.equal(d.resolve.code, '27424'); });
test('street crossing units -> ambiguous with shares', async () => { const d = await conv('27433', 'Trịnh Quang Nghị'); assert.ok(['ambiguous', 'interp'].includes(d.resolve.method)); assert.ok(d.resolve.parts.length >= 2); });
test('unknown street -> none, asks map', async () => { const d = await conv('27022', 'đường không tồn tại xyz'); assert.equal(d.resolve.method, 'none'); });
test('locate point restricted to candidates', async () => { const r = (await j('/api/locate?lat=10.7901&lon=106.6318&old=27022')).d; assert.equal(r.code, '27022');
  const far = (await j('/api/locate?lat=21.03&lon=105.85&old=27022')).d; assert.equal(far.code, null); });
test('locate anywhere (Hoàn Kiếm area)', async () => { const r = (await j('/api/locate?lat=21.0287&lon=105.8523')).d; assert.equal(r.provinceCode, '01'); });
// ---- v2: bulk API, API keys, ward pages ----
const post = (u, body, h = {}) => fetch(B + u, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(body) }).then(async r => ({ s: r.status, d: await r.json() }));
test('bulk: full address, split ward and garbage', async () => {
  const { s, d } = await post('/api/bulk', { addresses: ['60 đường số 1, Phường Tân Thành, Quận Tân Phú, TP.HCM', 'Xã Bát Tràng, Gia Lâm, Hà Nội', 'abc xyz'] });
  assert.equal(s, 200); assert.equal(d.results.length, 3);
  assert.equal(d.results[0].status, 'ok'); assert.match(d.results[0].new, /^60 đường số 1, Phường Phú Thọ Ho/); assert.equal(d.results[0].code, '27022');
  assert.equal(d.results[1].status, 'warn'); assert.ok(d.results[1].code.includes('|'));
  assert.equal(d.results[2].status, 'bad'); assert.ok(d.quota.limit >= 3); });
test('bulk: validation and size limit', async () => { assert.equal((await post('/api/bulk', {})).s, 400); assert.equal((await post('/api/bulk', { addresses: Array(501).fill('x') })).s, 413); });
test('bulk: bad API key rejected', async () => { assert.equal((await post('/api/bulk', { addresses: ['x'] }, { 'x-api-key': 'a34_nope' })).s, 401); });
test('bulk: API key flow', { skip: !process.env.ADMIN_PASSWORD }, async () => {
  const r = await fetch(B + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) }); const ck = r.headers.get('set-cookie').split(';')[0];
  const k = await post('/api/admin/keys', { owner: 'test-co', daily_limit: 2 }, { cookie: ck }); assert.equal(k.s, 200); assert.match(k.d.key, /^a34_/);
  const ok = await post('/api/bulk', { addresses: ['Phường Phúc Xá, Ba Đình, Hà Nội'] }, { 'x-api-key': k.d.key }); assert.equal(ok.s, 200); assert.equal(ok.d.quota.limit, 2);
  const over = await post('/api/bulk', { addresses: ['a', 'b'] }, { 'x-api-key': k.d.key }); assert.equal(over.s, 429);
  const L = await (await fetch(B + '/api/admin/keys', { headers: { cookie: ck } })).json(); const id = L.find(x => x.owner === 'test-co').id;
  await fetch(B + `/api/admin/keys/${id}/revoke`, { method: 'POST', headers: { cookie: ck } });
  assert.equal((await post('/api/bulk', { addresses: ['x'] }, { 'x-api-key': k.d.key })).s, 401); });
test('ward page: canonical redirect, SEO, sitemap has 3321 wards', async () => {
  const r = await fetch(B + '/xa/27022', { redirect: 'manual' }); assert.equal(r.status, 301); assert.match(r.headers.get('location'), /\/xa\/phuong-phu-tho-hoa-27022$/);
  const p = await j('/xa/phuong-phu-tho-hoa-27022'); assert.equal(p.s, 200); assert.match(p.d, /<title>Phường Phú Thọ Ho/); assert.match(p.d, /Phường Tân Thành/);
  assert.equal((await j('/xa/khong-co-99999')).s, 404);
  const sm = (await j('/sitemap.xml')).d; assert.equal((sm.match(/\/xa\//g) || []).length, 3321); assert.match(sm, /hang-loat/); });
test('bulk page renders', async () => { const p = await j('/hang-loat'); assert.match(p.d, /hàng loạt/i); });
test('leader news source link (Báo Chính phủ / Xây dựng Chính sách, Pháp luật)', async () => {
  const { d } = await j('/api/province/51'); const l = d.leaders.find(x => x.role === 'bi_thu');
  assert.ok(l.news, 'Quảng Ngãi bí thư has a news source'); assert.match(l.news.url, /^https:\/\/xaydungchinhsach\.chinhphu\.vn\/.+\.htm$/);
  assert.ok(l.news.title.includes(l.name), 'article title names the displayed leader'); assert.match(l.news.date, /^\d{4}-\d{2}-\d{2}$/);
  const js = await (await fetch(B + '/app.js')).text(); assert.match(js, /class="newsl" href="\$\{esc\(nw\.url\)\}" target="_blank" rel="noopener"/); assert.match(js, /Xây dựng Chính sách, Pháp luật/);
});
