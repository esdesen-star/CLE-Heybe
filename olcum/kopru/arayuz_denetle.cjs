// Ekran yazılarının makine çevirisi kendi dilinde mi? (07.11.2026 — Pencapça/Zuluca dersi, Özet §41)
// metin_ek.js'teki her dilin seçilen anahtarlarını birleştirip sayfanın dil algılayıcısıyla (dilTahmin) okur.
// İkinci ölçü (07.11, Sırpça dersi): Latin olmayan alfabeli dilde Latin harfli gerçek kelime var mı (alfabe karışması).
// Kullanım: node olcum/kopru/arayuz_denetle.cjs [anahtar,anahtar,…] [metin_ek.js yolu]   (anahtar verilmezse bütün metinler)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const HEYBE = path.join(__dirname, '..', '..', 'tasinabilir', 'usb_kok', 'heybe');
const sayfa = fs.readFileSync(path.join(HEYBE, 'sayfa.html'), 'utf8');
const a = sayfa.indexOf('  const SIK = {'), b = sayfa.indexOf('  async function dilTahminiUygula');
const dilTahmin = new Function(sayfa.slice(a, b) + '; return dilTahmin;')();
const c = { window: {} };
vm.createContext(c);
vm.runInContext(fs.readFileSync(process.argv[3] || path.join(HEYBE, 'metin_ek.js'), 'utf8'), c);
const EK = c.window.HEYBE_METIN_EK;
const ANAHTAR = (process.argv[2] || '').split(',').filter((x) => x && x !== 'hepsi');
const duz = (o) => (o && typeof o === 'object' ? Object.values(o).flatMap(duz) : typeof o === 'string' ? [o] : []);
const AYRI = new Set(['pa', 'zu']);   // sayfada yok (çevirmen yazamıyor)
let tutan = 0, toplam = 0, bos = 0;
const tutmayan = [];
for (const [dil, metin] of Object.entries(EK)) {
  if (AYRI.has(dil)) continue;
  const parca = ANAHTAR.length ? ANAHTAR.map((k) => metin[k]) : Object.values(metin);
  const yazi = duz(parca).join(' ').replace(/\{\d\}/g, ' ');
  toplam++;
  if (!yazi.trim()) { bos++; tutmayan.push(`${dil}: boş (İngilizce kalır)`); continue; }
  const t = dilTahmin(yazi);
  const bekle = dil === 'no' ? ['no', 'nb'] : [dil];
  if (bekle.includes(t)) tutan++;
  else tutmayan.push(`${dil}→${t}: ${yazi.slice(0, 90)}`);
}
console.log(`— ${toplam} dil · kendi dilinde ${tutan} · boş ${bos} —`);
tutmayan.forEach((x) => console.log('  ' + x));

// alfabe karışması (ölçü alfabe.cjs'te — çevirici de aynısını kullanır): dilin ana alfabesine yabancı kelimeler
const { dilBetigi, yabanciKelimeler } = require('./alfabe.cjs');
const karisik = [];
for (const [dil, metin] of Object.entries(EK)) {
  if (AYRI.has(dil)) continue;
  const parcalar = duz(ANAHTAR.length ? ANAHTAR.map((k) => metin[k]) : Object.values(metin));
  const ana = dilBetigi(dil);
  const kelime = new Set(parcalar.flatMap((m) => yabanciKelimeler(m, ana)));
  if (kelime.size) karisik.push(`${dil} (${ana}): ${kelime.size} yabancı kelime — ${[...kelime].slice(0, 10).join(' ')}`);
}
console.log(`— alfabe karışması: ${karisik.length} dil —`);
karisik.forEach((x) => console.log('  ' + x));

// korunan adlar (klasör, dosya adı, uzantı) çeviride harfi harfine kaldı mı
const { eksikAdlar } = require('./alfabe.cjs');
const vm2 = { METIN: null, SATIR: '\n' };
vm.createContext(vm2);
const ma = sayfa.indexOf('const METIN = {'), mb = sayfa.indexOf('\n  };\n', ma);
vm.runInContext(sayfa.slice(ma, mb + 5).replace('const METIN =', 'METIN ='), vm2);
const yollar = (o, p = '') => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => yollar(v, p + k + '.'))
  : [[p.slice(0, -1), typeof o === 'function' ? o('{0}', '{1}', '{2}') : String(o)]]);
const al = (o, p) => p.split('.').reduce((x, k) => x && x[k], o);
const kayip = [];
for (const [yol, en] of yollar(vm2.METIN.en)) {
  for (const [dil, metin] of Object.entries(EK)) {
    if (AYRI.has(dil)) continue;
    const t = al(metin, yol);
    if (typeof t === 'string' && eksikAdlar(t, en).length) kayip.push(`${dil}:${yol} (${eksikAdlar(t, en).join(', ')})`);
  }
}
console.log(`— korunan adlar: ${kayip.length} metinde kayıp —`);
kayip.slice(0, 30).forEach((x) => console.log('  ' + x));

