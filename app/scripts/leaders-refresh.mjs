// GitHub Actions: seed temp DB from content/, run leader pipeline, write content/ back (diff -> PR).
process.env.DATA_DIR ||= (await import('node:os')).tmpdir() + '/atlas34-' + Date.now();
const { seedFromContent, exportToContent } = await import('../lib/content.js');
const { refreshAll } = await import('../lib/leaders.js');
seedFromContent(true); const s = await refreshAll(() => {}); const e = exportToContent();
console.log(JSON.stringify({ ...s, ...e }));
const fs = await import('node:fs');
fs.writeFileSync(process.env.SUMMARY_FILE || '/tmp/leaders-summary.md', `Tự động làm mới lãnh đạo (Wikipedia VI → Wikidata → cổng TTĐT).\n\n- Tỉnh: ${s.provinces}, tìm thấy: ${s.found}, đối chiếu cổng TTĐT: ${s.verified}, xung đột: ${s.flagged}\n- Lỗi: ${s.errors.length ? s.errors.join('; ') : 'không'}\n\nDuyệt: đặt \`"status": "approved"\` và \`name\`/\`source_url\`/\`verified_at\` trong content/leaders.json cho mục đã kiểm tra với nguồn chính thức. Mục \`flag: conflict|changed\` cần xem kỹ.\n`);
