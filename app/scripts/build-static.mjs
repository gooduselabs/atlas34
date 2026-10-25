// Static build for GitHub Pages: runs server.js locally, crawls every page, rewrites paths under BASE, adds client-side API + data shards.
// Usage: BASE=/atlas34 SITE=https://gooduselabs.github.io node scripts/build-static.mjs  -> dist/
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const BASE = (process.env.BASE ?? '/atlas34').replace(/\/$/, ''); const SITE = process.env.SITE || 'https://gooduselabs.github.io';
const OUT = path.resolve('dist'); const PORT = 3399; const H = `http://127.0.0.1:${PORT}`;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const w = (f, d) => { const p = path.join(OUT, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, d); };
const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT, DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'a34-')), PUBLIC_URL: SITE + BASE, REFRESH_ON_START: '0', ADMIN_PASSWORD: '' }, stdio: 'inherit' });
try {
  for (let i = 0; i < 50; i++) { try { await fetch(H + '/api/stats'); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
  // 1. static assets
  fs.cpSync('public', OUT, { recursive: true, filter: s => !/admin\.html$|index\.html$/.test(s) });
  for (const f of ['maplibre-gl.js', 'maplibre-gl.css']) w('vendor/maplibre/' + f, fs.readFileSync('node_modules/maplibre-gl/dist/' + f));
  // 2. data: leaders/facts as served by the API, legal, OSM shards, PIP
  const { provinces } = JSON.parse(fs.readFileSync('public/data/provinces.json'));
  const leaders = {}, facts = {};
  for (const p of provinces) { const d = await (await fetch(`${H}/api/province/${p.code}`)).json(); leaders[p.code] = d.leaders; facts[p.code] = d.facts; }
  w('data/leaders.json', JSON.stringify(leaders)); w('data/facts.json', JSON.stringify(facts));
  w('data/legal.json', fs.readFileSync('data-private/legal.json'));
  const osm = JSON.parse(fs.readFileSync('data-private/osm_split.json')); for (const [id, v] of Object.entries(osm)) w(`osm/${id}.json`, JSON.stringify(v));
  for (const f of fs.readdirSync('data-private/pip')) w('pip/' + f, fs.readFileSync('data-private/pip/' + f));
  // 3. pages
  const fix = h => h.replace(/(href|src)="\/(?!\/)/g, `$1="${BASE}/`)
    .replace('<script>', `<script>window.__BASE=${JSON.stringify(BASE)};</script><script src="${BASE}/static-api.js" defer></script><script>`);
  const pages = ['/', '/doi-dia-chi', '/chi-muc', ...provinces.map(p => '/tinh/' + p.slug)];
  for (const u of pages) w((u === '/' ? '' : u.slice(1) + '/') + 'index.html', fix(await (await fetch(H + u)).text()));
  w('404.html', fix(await (await fetch(H + '/')).text()).replace('<head>', `<head><base href="${BASE}/">`));
  for (const c of ['vn', ...provinces.map(p => p.code)]) w(`og/${c}.png`, Buffer.from(await (await fetch(`${H}/og/${c}.png`)).arrayBuffer()));
  w('sitemap.xml', await (await fetch(H + '/sitemap.xml')).text());
  w('robots.txt', `User-agent: *\nSitemap: ${SITE}${BASE}/sitemap.xml\n`); w('.nojekyll', '');
  console.log('static build ok:', pages.length, 'pages,', Object.keys(osm).length, 'OSM shards ->', OUT);
} finally { srv.kill(); }
