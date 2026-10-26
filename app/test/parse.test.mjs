// Messy real-world address inputs -> expected top match (old: ward|district, new: ward|province)
import test from 'node:test'; import assert from 'node:assert/strict';
const B = process.env.BASE || 'http://localhost:3300';
const q = (s, mode = 'old') => fetch(`${B}/api/search?mode=${mode}&q=${encodeURIComponent(s)}`).then(r => r.json());
const OLD = [
  ['60 đường số 1 tân thành tân phú', 'Phường Tân Thành|Quận Tân Phú', '60 đường số 1'],
  ['60 duong so 1 tan thanh tan phu', 'Phường Tân Thành|Quận Tân Phú', '60 duong so 1'],
  ['60 đường số 1, Phường Tân Thành, Quận Tân Phú, TP.HCM', 'Phường Tân Thành|Quận Tân Phú', '60 đường số 1'],
  ['tan thanh tan phu hcm', 'Phường Tân Thành|Quận Tân Phú'],
  ['tân phú tân thành', 'Phường Tân Thành|Quận Tân Phú'],
  ['60 duong so 1 tan thnah tan phu', 'Phường Tân Thành|Quận Tân Phú', '60 duong so 1'],
  ['3421 phạm thế hiển p7 q8', 'Phường 7|Quận 8', '3421 phạm thế hiển'],
  ['3421 Phạm Thế Hiển, F7, Q8, SG', 'Phường 7|Quận 8', '3421 Phạm Thế Hiển'],
  ['123 nguyen trai p2 q5 sg', 'Phường 2|Quận 5', '123 nguyen trai'],
  ['123 Nguyễn Trãi phường 2 quận 5', 'Phường 2|Quận 5', '123 Nguyễn Trãi'],
  ['12 le loi ben nghe q1', 'Phường Bến Nghé|Quận 1', '12 le loi'],
  ['12 Lê Lợi, P. Bến Nghé, Q.1, TP. Hồ Chí Minh', 'Phường Bến Nghé|Quận 1', '12 Lê Lợi'],
  ['45 dien bien phu p25 binh thanh', 'Phường 25|Quận Bình Thạnh', '45 dien bien phu'],
  ['thao dien quan 2', 'Phường Thảo Điền|Thành phố Thủ Đức'],
  ['thảo điền thủ đức', 'Phường Thảo Điền|Thành phố Thủ Đức'],
  ['linh trung thu duc', 'Phường Linh Trung|Thành phố Thủ Đức'],
  ['phuc xa ba dinh hn', 'Phường Phúc Xá|Quận Ba Đình'],
  ['Phúc Xá, Ba Đình, Hà Nội', 'Phường Phúc Xá|Quận Ba Đình'],
  ['18 hang bai hang bai hoan kiem', 'Phường Hàng Bài|Quận Hoàn Kiếm', '18 hang bai'],
  ['bat trang gia lam', 'Xã Bát Tràng|Huyện Gia Lâm'],
  ['xa bat trang huyen gia lam ha noi', 'Xã Bát Tràng|Huyện Gia Lâm'],
  ['bát tràng gia lâm hn', 'Xã Bát Tràng|Huyện Gia Lâm'],
  ['dich vong cau giay', 'Phường Dịch Vọng|Quận Cầu Giấy'],
  ['dich vong hau cau giay ha noi', 'Phường Dịch Vọng Hậu|Quận Cầu Giấy'],
  ['so 5 ngo 42 trung kinh trung hoa cau giay', 'Phường Trung Hòa|Quận Cầu Giấy'],
  ['van quan ha dong', 'Phường Văn Quán|Quận Hà Đông'],
  ['thach that, binh yen', 'Xã Bình Yên|Huyện Thạch Thất'],
  ['x. dien hong, h. dien ban, quang nam', 'Xã Điện Hồng|Thị xã Điện Bàn'],
  ['minh an hoi an quang nam', 'Phường Minh An|Thành phố Hội An'],
  ['12 tran phu minh an hoi an', 'Phường Minh An|Thành phố Hội An', '12 tran phu'],
  ['hai chau hai chau da nang', 'Phường Hải Châu|Quận Hải Châu'],
  ['thac gian thanh khe dn', 'Phường Thạc Gián|Quận Thanh Khê'],
  ['hoa khanh bac lien chieu da nang', 'Phường Hòa Khánh Bắc|Quận Liên Chiểu'],
  ['hoa vang hoa bac', 'Xã Hòa Bắc|Huyện Hòa Vang'],
  ['ninh kieu tan an can tho', 'Phường Tân An|Quận Ninh Kiều'],
  ['tt cờ đỏ cần thơ', 'Thị trấn Cờ Đỏ|Huyện Cờ Đỏ'],
  ['xa ea tu buon ma thuot', 'Xã Ea Tu|Thành phố Buôn Ma Thuột'],
  ['tan thanh cmau', null, null, r => r.length > 0],
  ['dong xoai tan thanh binh phuoc', 'Xã Tân Thành|Thành phố Đồng Xoài'],
  ['sa pa lao cai', null, null, r => /Sa Pa/.test(r[0].d)],
  ['phong nha bo trach quang binh', null, null, r => /Bố Trạch/.test(r[0].d)],
  ['tan thanh', null, null, r => r.length >= 5 && r.every(x => /T[âa]n Th[àạ]nh/.test(x.w))],
  ['tân thành cà mau', null, null, r => r[0].w.endsWith('Tân Thành') && r[0].p === 'Tỉnh Cà Mau' && r.slice(0, 2).every(x => x.p === 'Tỉnh Cà Mau')],
  ['quan tan phu', null, null, r => r.length > 0 && r[0].d === 'Quận Tân Phú'],
  ['nguyen trai thanh xuan', null, null, r => r.some(x => x.d === 'Quận Thanh Xuân') && r[0].street === 'nguyen trai'],
];
const NEW = [
  ['phuong hoi an da nang', 'Phường Hội An|Thành phố Đà Nẵng'],
  ['hoi an da nang', 'Phường Hội An|Thành phố Đà Nẵng'],
  ['phu tho hoa hcm', 'Phường Phú Thọ Hoà|Thành phố Hồ Chí Minh'],
  ['60 duong so 1 phu tho hoa tp hcm', 'Phường Phú Thọ Hoà|Thành phố Hồ Chí Minh', '60 duong so 1'],
  ['bat trang ha noi', 'Xã Bát Tràng|Thành phố Hà Nội'],
  ['ba dinh hn', 'Phường Ba Đình|Thành phố Hà Nội'],
  ['hoi an quang nam', 'Phường Hội An|Thành phố Đà Nẵng'],
  ['dac khu phu quoc', null, null, r => /Phú Quốc/.test(r[0].n)],
];
const chk = (mode, [s, exp, street, fn]) => test(`${mode}: ${s}`, async () => { const r = await q(s, mode); assert.ok(r.length, 'empty');
  if (fn) return assert.ok(fn(r), JSON.stringify(r.slice(0, 3)));
  const top = mode === 'old' ? `${r[0].w}|${r[0].d}` : `${r[0].n}|${r[0].pn}`; assert.equal(top, exp);
  if (street !== undefined) assert.equal(r[0].street, street); });
OLD.forEach(c => chk('old', c)); NEW.forEach(c => chk('new', c));
test('speed: 200 parses < 4 s', async () => { const t = Date.now(); for (let i = 0; i < 200; i++) await q('60 duong so 1 tan thnah tan phu hcm ' + i); assert.ok(Date.now() - t < 4000); });
