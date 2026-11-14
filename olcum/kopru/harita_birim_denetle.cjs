// Harita sayfasında makine çevirisi dillerinin birim adları ve yol özeti (13.11.2026, Özet §123). harita.html'in
// metinKur + makineDuzelt işlevleri sayfadan alınıp harita_metin_ek.js'in her dili için koşturulur:
//   · uzaklık ve süre sayıyla birlikte tarayıcının dil verisinden (Intl) yazılmalı — çevirmenin "min → en az"ı sayfaya
//     ulaşmamalı; birim adı sayıya göre değişir (Arapça 2 metre / 5 metre), bu yüzden sayılar tek tek denenir
//   · yol özeti çeviri kalıbından değil parçalardan kurulmalı (Japonca "約{1}分" → "31 分分" olmasın)
//   · sayfa makineDuzelt'i gerçekten çağırmalı
// Ölçülmüş tr/en/cs dokunulmadan kalmalı. Kullanım: node olcum/kopru/harita_birim_denetle.cjs [harita.html yolu]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const HEYBE = path.join(__dirname, '..', '..', 'tasinabilir', 'usb_kok', 'heybe');
const sayfa = fs.readFileSync(process.argv[2] || path.join(HEYBE, 'harita.html'), 'utf8');
// işlevi sayfadan süslü parantez sayarak al (tek satırlık uzunluk/sure de, çok satırlık makineDuzelt de)
function islev(ad) {
  const i = sayfa.indexOf(`function ${ad}(`);
  if (i < 0) return '';
  let d = 0;
  for (let j = sayfa.indexOf('{', i); j < sayfa.length; j++) {
    if (sayfa[j] === '{') d++;
    else if (sayfa[j] === '}' && --d === 0) return sayfa.slice(i, j + 1);
  }
  return '';
}
const a = sayfa.indexOf('const METIN = {'), b = sayfa.indexOf('\n};\n', a);
const c = { window: {}, Intl };
vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(HEYBE, 'harita_metin_ek.js'), 'utf8'), c);
vm.runInContext(sayfa.slice(a, b + 3).replace('const METIN =', 'var METIN =') + ['metinKur', 'makineDuzelt', 'birimli', 'uzunluk', 'sure'].map(islev).join('\n'), c);
const hata = [];
if (typeof c.makineDuzelt !== 'function') hata.push('makineDuzelt işlevi yok');
if (!/\nmakineDuzelt\(M, dil\);/.test(sayfa)) hata.push('sayfa makineDuzelt(M, dil) çağırmıyor');
const BIRIM = { m: 'meter', km: 'kilometer', dk: 'minute', sa: 'hour' };
const intl = (dil, x, k) => new Intl.NumberFormat(dil, { style: 'unit', unit: BIRIM[k], unitDisplay: 'short', maximumFractionDigits: 1 }).format(x);
// uzunluk/sure sayfadaki M ve sayi'yı okur: her dil için bağlamda kurulur
const kur = (M, dil) => { c.M = M; c.sayi = new Intl.NumberFormat(dil, { maximumFractionDigits: 1 }); };
let dilSay = 0;
if (!hata.length) {
  for (const [dil, ek] of Object.entries(c.window.HEYBE_HARITA_EK || {})) {
    const M = c.makineDuzelt(c.metinKur(c.METIN.en, ek), dil);
    kur(M, dil);
    dilSay++;
    const iste = [[c.uzunluk(20), intl(dil, 20, 'm')], [c.uzunluk(500), intl(dil, 500, 'm')], [c.uzunluk(2000), intl(dil, 2, 'km')],
      [c.uzunluk(8400), intl(dil, 8.4, 'km')], [c.sure(60), intl(dil, 1, 'dk')], [c.sure(5 * 60), intl(dil, 5, 'dk')],
      [c.sure(31 * 60), intl(dil, 31, 'dk')], [c.sure(125 * 60), `${intl(dil, 2, 'sa')} ${intl(dil, 5, 'dk')}`]];
    for (const [ol, bek] of iste) if (ol !== bek) { hata.push(`${dil}: "${ol}" (beklenen "${bek}")`); break; }
    const oz = M.ozetYaya('8 X', '31 Y'), oa = M.ozetArac('8 X', '31 Y');
    if (!oz.includes(M.yaya) || !oz.endsWith('31 Y') || !oa.includes(M.arac) || !oa.endsWith('31 Y')) hata.push(`${dil} özet parçalardan kurulmamış: "${oz}" / "${oa}"`);
  }
  // ölçülmüş diller eski biçimiyle kalmalı
  const ESKI = { tr: ['1,5 km', '31 dk', '2 sa 5 dk', '500 m'], en: ['1.5 km', '31 min', '2 h 5 min', '500 m'], cs: ['1,5 km', '31 min', '2 h 5 min', '500 m'] };
  for (const [dil, bek] of Object.entries(ESKI)) {
    const M = { ...c.METIN[dil] };
    c.makineDuzelt(M, dil);
    kur(M, dil);
    const ol = [c.uzunluk(1500), c.sure(31 * 60), c.sure(125 * 60), c.uzunluk(500)];
    if (ol.join('|') !== bek.join('|')) hata.push(`${dil} ölçülmüş biçim değişti: ${ol.join(' · ')}`);
    if (M.ozetYaya !== c.METIN[dil].ozetYaya) hata.push(`${dil} ölçülmüş özet değişti`);
  }
}
console.log(hata.length ? `BİRİM: ${hata.length} hata\n  ` + hata.slice(0, 12).join('\n  ') : `BİRİM: tamam (${dilSay} dil)`);
process.exit(hata.length ? 1 : 0);
