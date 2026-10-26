// Atlas 34 flexible address parser (shared by server.js and the static build).
// Free text, no keywords/commas/diacritics needed, any order, abbreviations, typos.
// Matches n-grams against ward/district/province name indexes, keeps only hierarchy-consistent
// combinations, prefers suffix + most specific match; the unmatched prefix is the street part.
(function (G) {
  const fold = s => (s || '').normalize('NFC').toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/\p{M}/gu, '');
  const TYPE = /^(tinh|thanh pho|quan|huyen|thi xa|phuong|xa|thi tran|dac khu) /;
  const core = s => fold(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().replace(TYPE, '').replace(/^0+(\d)/, '$1');
  // marker tokens: W ward, D district, P province, S street
  const MK = { p: 'W', f: 'W', ph: 'W', phuong: 'W', x: 'W', xa: 'W', tt: 'W', q: 'D', quan: 'D', h: 'D', huyen: 'D', tx: 'D', tp: 'PD', t: 'P', tinh: 'P', d: 'S', duong: 'S', pho: 'S', so: 'S' };
  const MK2 = { 'thi tran': 'W', 'thi xa': 'D', 'thanh pho': 'PD', 'dac khu': 'W' };
  const PALIAS = { 'ho chi minh': ['hcm', 'tphcm', 'sg', 'sai gon', 'saigon', 'hochiminh'], 'ha noi': ['hn', 'hanoi', 'tphn'], 'da nang': ['danang', 'tpdn'], 'hai phong': ['hp'], 'can tho': ['ct'], 'thua thien hue': ['hue', 'tth'], 'ba ria vung tau': ['brvt', 'vung tau'] };
  function tokenize(q) { const out = []; const re = /[^\s,.;/\\\-–()]+/g; let m;
    while ((m = re.exec(q))) { const raw = m[0], f = fold(raw).replace(/[^a-z0-9]/g, ''); if (!f) continue;
      const g = f.match(/^(p|f|q|x|h|ph|tx|tt)(\d{1,2})$/); // glued p1 q10 f7
      if (g) { out.push({ f: g[1], s: m.index, e: m.index + g[1].length }); out.push({ f: String(+g[2]), s: m.index + g[1].length, e: m.index + raw.length }); }
      else out.push({ f: /^\d+$/.test(f) && f.length <= 2 ? String(+f) : f, s: m.index, e: m.index + raw.length }); }
    return out; }
  function lev(a, b, max) { if (Math.abs(a.length - b.length) > max) return max + 1; let pp = null, p = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) { const c = [i]; let lo = i; for (let j = 1; j <= b.length; j++) { c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) c[j] = Math.min(c[j], pp[j - 2] + 1); lo = Math.min(lo, c[j]); } if (lo > max) return max + 1; pp = p; p = c; }
    return p[b.length]; }
  function index(keys) { const ex = new Map(), byLen = new Map(); for (const [k, v] of keys) { if (!k) continue; if (!ex.has(k)) { ex.set(k, []); const L = k.length; (byLen.get(L) || byLen.set(L, []).get(L)).push(k); } ex.get(k).push(v); } return { ex, byLen }; }
  function look(ix, s) { const r = []; const e = ix.ex.get(s); if (e) r.push({ v: e, ed: 0 });
    const max = s.length >= 10 ? 2 : s.length >= 5 ? 1 : 0; if (!max || /\d/.test(s)) return r;
    for (let L = s.length - max; L <= s.length + max; L++) for (const k of ix.byLen.get(L) || []) { if (k === s || k[0] !== s[0]) continue; const d = lev(s, k, max); if (d <= max) r.push({ v: ix.ex.get(k), ed: d }); }
    return r; }
  function make({ legacy, newW, provinces }) {
    // legacy rows: {id,w,d,p,t}; newW: {c,n,p,pn}; provinces: new provinces [{code,full,oldProvinces}]
    const pk = n => { const c = core(n); return [c, ...(PALIAS[c] || [])]; };
    const L = { W: index(legacy.map(r => [core(r.w), r])), D: index([...new Map(legacy.map(r => [r.p + '|' + r.d, r])).values()].map(r => [core(r.d), r.p + '|' + r.d])),
      P: index([...new Set(legacy.map(r => r.p))].flatMap(p => pk(p).map(k => [k, p]))) };
    const N = { W: index(newW.map(w => [core(w.n), w])), P: index(provinces.flatMap(p => [...pk(p.full).map(k => [k, p.code]), ...(p.oldProvinces || []).flatMap(o => pk(o).map(k => [k, p.code + '~']))])) };
    const numTypeOk = (toks, i, want) => { const a = toks[i - 1]?.f, b = i >= 2 ? toks[i - 2].f + ' ' + toks[i - 1].f : ''; return (MK[a] || '').includes(want) || (MK2[b] || '').includes(want); };
    // all spans (<=5 tokens) that hit an index; numeric names need an explicit marker before them
    function spans(toks, ix, lvl) { const out = [];
      for (let i = 0; i < toks.length; i++) for (let j = i + 1; j <= Math.min(toks.length, i + 5); j++) { const s = toks.slice(i, j).map(t => t.f).join(' ');
        if (/^\d+$/.test(s) && !numTypeOk(toks, i, lvl)) continue; if (MK[toks[j - 1].f] && /^\d+$/.test(toks[j]?.f || '')) continue; if (j - i === 1 && MK[s] && !/^\d/.test(s)) continue;
        for (const h of look(ix, s)) out.push({ i, j, v: h.v, ed: h.ed, lvl }); }
      return out; }
    // extend a span leftwards over its type marker(s)
    const grow = (toks, sp) => { let i = sp.i, bonus = 0; const a = toks[i - 1]?.f, b = i >= 2 ? toks[i - 2].f + ' ' + toks[i - 1].f : '';
      if (MK2[b] && i >= 2) { bonus = MK2[b].includes(sp.lvl) ? .6 : -.4; i -= 2; } else if (MK[a] && MK[a] !== 'S') { bonus = MK[a].includes(sp.lvl) ? .6 : -.4; i -= 1; } return { i, bonus }; };
    function rank(toks, cands, known = new Set()) { // cands: [{key,item,used:[spans]}] -> scored
      const n = toks.length;
      return cands.map(c => { let sc = 0, lo = n, hi = 0; const cover = new Set();
        for (const s of c.used) { const g = grow(toks, s); sc += (s.j - s.i) * 1.2 + 2 + g.bonus - s.ed * 1.6; lo = Math.min(lo, g.i); hi = Math.max(hi, s.j); for (let k = g.i; k < s.j; k++) cover.add(k); }
        let gap = 0; for (let k = lo; k < n; k++) if (!cover.has(k) && !MK[toks[k].f] && !MK2[toks[k].f]) gap += known.has(k) ? .35 : 1;
        sc -= gap * 1.1; sc += lo / Math.max(n, 1) * .8; // suffix preference
        sc -= c.pen || 0; return { ...c, sc, lo }; }).sort((a, b) => b.sc - a.sc); }
    const overl = (a, b) => a.i < b.j && b.i < a.j;
    function parseOld(q, n = 8) { const toks = tokenize(q).slice(-14); if (!toks.length) return [];
      const W = spans(toks, L.W, 'W'), D = spans(toks, L.D, 'D'), P = spans(toks, L.P, 'P'); const cands = [];
      const dOf = new Map(); for (const d of D) for (const k of d.v) (dOf.get(k) || dOf.set(k, []).get(k)).push(d);
      const pOf = new Map(); for (const p of P) for (const k of p.v) (pOf.get(k) || pOf.set(k, []).get(k)).push(p);
      const best = (list, not) => (list || []).filter(x => !not.some(y => overl(x, y))).sort((a, b) => (b.j - b.i - b.ed * 1.4) - (a.j - a.i - a.ed * 1.4) || b.i - a.i)[0];
      for (const w of W) for (const r of w.v) { const d = best(dOf.get(r.p + '|' + r.d), [w]); const p = best(pOf.get(r.p), d ? [w, d] : [w]);
        cands.push({ key: r.id, item: r, used: [w, d, p].filter(Boolean), lv: 1 + !!d + !!p }); }
      // district-only reading ("quan tan phu", "thanh xuan"): offer that district's wards, slightly below a full match
      for (const d of D) for (const k of d.v) { const [pp, dd] = k.split('|'); const p = best(pOf.get(pp), [d]);
        for (const r of legacy.filter(r => r.p === pp && r.d === dd).slice(0, 3)) cands.push({ key: r.id, item: r, used: [d, p].filter(Boolean), pen: .3, partial: 'district' }); }
      const known = new Set(); for (const x of [...W, ...D, ...P]) for (let k = x.i; k < x.j; k++) known.add(k);
      return finish(toks, q, rank(toks, cands, known), n); }
    function parseNew(q, n = 8) { const toks = tokenize(q).slice(-12); if (!toks.length) return [];
      const W = spans(toks, N.W, 'W'), P = spans(toks, N.P, 'P'); const cands = [];
      for (const w of W) for (const x of w.v) { const p = P.filter(p => !overl(p, w) && p.v.some(v => v === x.p || v === x.p + '~')).sort((a, b) => b.j - b.i - (a.j - a.i))[0];
        if (p && !p.v.includes(x.p)) p.ed = Math.max(p.ed, .5); cands.push({ key: x.c, item: x, used: [w, p].filter(Boolean) }); }
      const known = new Set(); for (const x of [...W, ...P]) for (let k = x.i; k < x.j; k++) known.add(k);
      return finish(toks, q, rank(toks, cands, known), n); }
    function finish(toks, q, r, n) { const seen = new Set(), out = [];
      for (const c of r) { if (seen.has(c.key)) continue; seen.add(c.key); const lo = Math.min(...c.used.map(s => grow(toks, s).i));
        const street = lo > 0 ? q.slice(0, toks[lo].s).replace(/[\s,.;\-–]+$/, '').trim() || null : null; out.push({ item: c.item, street, score: +c.sc.toFixed(2), partial: c.partial || null }); if (out.length >= n) break; }
      return out; }
    return { parseOld, parseNew, tokenize, core };
  }
  G.A34Parse = { make, fold, core, tokenize };
})(globalThis);
