// Kullanım: CEVIRMEN=http://127.0.0.1:18082 node olcum/kopru/olc_dil_tahmin.cjs  (çeviriler önbellekte; Özet §41)
// Ö16 dil tanıma ölçümü: bir uzun not ve bir kısa açıklama TranslateGemma ile 51 dile çevrilir, dilTahmin sınanır.
const fs = require('fs');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:8888/cevirmen';
const sayfa = fs.readFileSync(require('path').join(__dirname, '..', '..', 'tasinabilir', 'usb_kok', 'heybe', 'sayfa.html'), 'utf8');
const a = sayfa.indexOf('  const SIK = {'), b = sayfa.indexOf('  async function dilTahminiUygula');
const dilTahmin = new Function(sayfa.slice(a, b) + '; return dilTahmin;')();
const ONB = require('path').join(__dirname, '..', 'sonuc', 'dil_tahmin_onbellek.json');
const onb = fs.existsSync(ONB) ? JSON.parse(fs.readFileSync(ONB, 'utf8')) : {};
const UZUN = 'Our family meeting place after an earthquake is the park next to the primary school. My father takes blood pressure medicine every morning and he is allergic to penicillin. If the phones do not work, we will leave a note on the door of our house.';
const KISA = 'A photo of the water filter we keep in the kitchen.';
(async () => {
  const diller = Object.keys(H.DIL_ADI).filter((d) => !['nb', 'nn', 'ku', 'az'].includes(d));
  let dU = 0, dK = 0;
  const yanlis = [];
  for (const d of diller) {
    for (const [tur, metin] of [['uzun', UZUN], ['kisa', KISA]]) {
      const k = `${d}:${tur}`;
      if (!onb[k]) { onb[k] = d === 'en' ? metin : await H.cevir(metin, 'en', d); fs.writeFileSync(ONB, JSON.stringify(onb)); }
      const t = dilTahmin(onb[k]);
      if (t === d) { if (tur === 'uzun') dU++; else dK++; }
      else yanlis.push(`${tur} ${d}→${t}`);
    }
  }
  console.log(`dil: ${diller.length} · uzun not doğru ${dU} · kısa açıklama doğru ${dK}`);
  console.log('yanlış/boş: ' + yanlis.join(', '));
})();
