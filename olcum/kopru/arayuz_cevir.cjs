// Sayfa metinlerini çevirmenin 48 diline çevirir (06.11.2026 — Ercan: "55 dil yüklü olsun … açılış sayfasında
// seçilebilir"). Kaynak: sayfa.html içindeki METIN.en. Kalıplı metinler ("Done (${sn} s).") {0}, {1} yer tutucularıyla
// çevrilir; yer tutucu çeviride kaybolursa o metin İngilizce kalır. Çıktı: usb_kok/heybe/metin_ek.js (makine çevirisi,
// insan denetimi yok — sayfada "denenmedi" diye işaretli).
// Kullanım: CEVIRMEN=http://127.0.0.1:18082 node olcum/kopru/arayuz_cevir.cjs [dil,dil,…]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
const HEYBE = path.join(__dirname, '..', '..', 'tasinabilir', 'usb_kok', 'heybe');
const kaynak = fs.readFileSync(path.join(HEYBE, 'sayfa.html'), 'utf8');
const a = kaynak.indexOf('const METIN = {'), b = kaynak.indexOf('\n  };\n', a);
const c = { METIN: null, SATIR: '\n' };
vm.createContext(c);
vm.runInContext(kaynak.slice(a, b + 5).replace('const METIN =', 'METIN ='), c);
const EN = c.METIN.en;
// İngilizce "bosDil" İngilizceye özgü ("no English book") — öbür diller için dil adı içermeyen metin (06.11)
EN.bosDil = 'There are no books in this language on this stick yet. Heybe looks in books in other languages and translates; you can also download books in the "Library".';
const OLCULMUS = ['tr', 'en', 'cs'];
const DILLER = process.argv[2] ? process.argv[2].split(',')
  : Object.keys(H.DIL_ADI).filter((d) => !OLCULMUS.includes(d) && !['nb', 'nn', 'ku', 'az', 'pa', 'zu'].includes(d));   // pa, zu: çevirmen yazamıyor (07.11)
const cikti = path.join(__dirname, '..', 'sonuc', 'arayuz_ceviri.json');
const sonuc = fs.existsSync(cikti) ? JSON.parse(fs.readFileSync(cikti, 'utf8')) : {};

function kaliba(v) {   // işlevi yer tutuculu metne çevir: (sn) => `Done (${sn} s).` → "Done ({0} s)."
  return v(...Array.from({ length: Math.max(v.length, 1) }, (_, i) => `{${i}}`));
}
// 06.11 (Ercan'ın Bulgarca testi): "stick" çevirmende "çubuk / asa / kalem" oluyordu → çeviriye "USB drive" gider
const bellekli = (m) => m.replace(/\b(the|this) stick\b/gi, '$1 USB drive').replace(/\bstick\b/gi, 'USB drive');
// YENIDEN=anahtar,anahtar → yalnız bu metinler bütün dillerde yeniden çevrilir
const YENIDEN = (process.env.YENIDEN || '').split(',').filter(Boolean);
const { dilBetigi, yabanciKelimeler, KORUNAN, eksikAdlar } = require('./alfabe.cjs');
const { yerTutucu, temizCevir, srKiril, srNesne } = require('./cevir_ortak.cjs');   // ortak kurallar (07.11 gece)

async function nesne(taban, dil, yol, eski) {
  const o = {};
  for (const [k, v] of Object.entries(taban)) {
    if (v && typeof v === 'object') { o[k] = await nesne(v, dil, yol + k + '.', (eski || {})[k]); continue; }
    // YENIDEN'de üst anahtar ('kilavuz') yazılınca bütün alt metinleri de yeniden çevrilir (07.11)
    if (YENIDEN.length && !YENIDEN.some((x) => (yol + k) === x || (yol + k).startsWith(x + '.')) && !(v && typeof v === 'object')) { o[k] = (eski || {})[k]; continue; }
    const metin = bellekli(typeof v === 'function' ? kaliba(v) : String(v));
    if (!metin.trim() || /^[\d\s.,:%·—-]*$/.test(metin)) { o[k] = metin; continue; }
    o[k] = await temizCevir(metin, dil);
  }
  return o;
}


// ONARIM=1: var olan çevirilerden yalnız bozuk olanlar (alfabe karışması) yeniden çevrilir
async function onar(taban, dil, eski, yol = '') {
  const o = {};
  let onarilan = 0, ingilizce = 0;
  for (const [k, v] of Object.entries(taban)) {
    const e = (eski || {})[k];
    if (v && typeof v === 'object') { const r = await onar(v, dil, e, yol + k + '.'); o[k] = r.o; onarilan += r.onarilan; ingilizce += r.ingilizce; continue; }
    const deger = typeof e === 'string' && dil === 'sr' ? srKiril(e) : e;
    const metin = bellekli(typeof v === 'function' ? kaliba(v) : String(v));
    if (typeof deger !== 'string' || (!yabanciKelimeler(deger, dilBetigi(dil)).length && !eksikAdlar(deger, metin).length)) { o[k] = e; continue; }
    o[k] = await temizCevir(metin, dil);
    if (o[k]) onarilan++; else ingilizce++;
    console.log(`  ${dil} ${yol + k}: ${o[k] ? 'onarıldı' : 'İngilizce kalacak'}`);
  }
  return { o, onarilan, ingilizce };
}

// Sırpça (07.11, Özet §43): çevirmen Kiril ve Latin harfleri karıştırıyor ("Одговори koje ste označili", "пониšteno").
// İki alfabe harf harf eşleşir → Latin kısımlar Kiril'e çevrilir. Dokunulmayanlar: q/w/x/y içeren yabancı ad
// (Heybe, Kiwix, exFAT), büyük harf kısaltma (USB, PDF), dosya adı/yol parçası (_ / . yanında), klasör adları, {0}.

(async () => {
  for (const dil of DILLER) {
    if (process.env.ONARIM) {
      if (!sonuc[dil]) continue;
      const r = await onar(EN, dil, sonuc[dil]);
      sonuc[dil] = r.o;
      fs.writeFileSync(cikti, JSON.stringify(sonuc, null, 1));
      if (r.onarilan + r.ingilizce) console.log(`${dil}: onarılan ${r.onarilan}, İngilizce kalan ${r.ingilizce}`);
      continue;
    }
    if (sonuc[dil] && !YENIDEN.length) { console.log(`${dil}: zaten var`); continue; }
    const t0 = Date.now();
    sonuc[dil] = await nesne(EN, dil, '', sonuc[dil]);
    const say = JSON.stringify(sonuc[dil]).match(/null/g)?.length || 0;
    fs.writeFileSync(cikti, JSON.stringify(sonuc, null, 1));
    console.log(`${dil} (${H.DIL_ADI[dil]}): ${((Date.now() - t0) / 1000).toFixed(0)} sn · İngilizce kalan ${say}`);
  }
  if (sonuc.sr) sonuc.sr = srNesne(sonuc.sr);
  fs.writeFileSync(cikti, JSON.stringify(sonuc, null, 1));
  const js = '// Sayfa metinlerinin makine çevirisi (TranslateGemma 4B, ' + new Date().toISOString().slice(0, 10) +
    ') — insan denetimi YOK; olcum/kopru/arayuz_cevir.cjs üretir.\nwindow.HEYBE_METIN_EK = ' + JSON.stringify(sonuc) + ';\n';
  fs.writeFileSync(path.join(HEYBE, 'metin_ek.js'), js);
  console.log(`metin_ek.js: ${js.length} bayt, ${Object.keys(sonuc).length} dil`);
})();
