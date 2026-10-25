// Verify leaders against xaydungchinhsach.chinhphu.vn and write results back to content/leaders.json.
// Usage: node scripts/news-verify.mjs [provinceCode...]   (run from the box/Mac: .vn sites may block US CI runners)
process.env.DATA_DIR ||= (await import('node:os')).tmpdir() + '/atlas34-news-' + Date.now();
const { seedFromContent, exportToContent } = await import('../lib/content.js');
const { verifyAll } = await import('../lib/news-verify.js'); const { db } = await import('../lib/db.js');
seedFromContent(true); const only = process.argv.slice(2); const s = await verifyAll(db, console.log, only.length ? only : null); exportToContent();
const fs = await import('node:fs'); fs.writeFileSync(process.env.NEWS_SUMMARY || '/tmp/news-summary.json', JSON.stringify(s, null, 1));
console.log(JSON.stringify({ checked: s.checked, verified: s.verified, updated: s.updated.length, conflict: s.conflict.length, not_found: s.not_found.length, errors: s.errors.length }));
