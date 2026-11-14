// Sayfa metinlerini çevirmenin 48 diline çevirir (06.11.2026 — Ercan: "55 dil yüklü olsun … açılış sayfasında
// seçilebilir"). Kaynak: sayfa.html içindeki METIN.en. Kalıplı metinler ("Done (${sn} s).") {0}, {1} yer tutucularıyla
// çevrilir; yer tutucu çeviride kaybolursa o metin İngilizce kalır. Çıktı: usb_kok/heybe/metin_ek.js (makine çevirisi,
// insan denetimi yok — sayfada "denenmedi" diye işaretli).
// Kullanım: CEVIRMEN=http://127.0.0.1:18082 node olcum/kopru/arayuz_cevir.cjs [dil,dil,…]
// 13.11 (§123): SAYFA=harita → harita.html'in METIN'i; çıktı harita_metin_ek.js (window.HEYBE_HARITA_EK), önbellek
// sonuc/harita_ceviri.json. CEVIRI_DOSYA=… önbelleği değiştirir (iki çevirmen aynı anda ayrı dillerle koşabilsin).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
const HEYBE = path.join(__dirname, '..', '..', 'tasinabilir', 'usb_kok', 'heybe');
const HARITA = process.env.SAYFA === 'harita';
const kaynak = fs.readFileSync(path.join(HEYBE, HARITA ? 'harita.html' : 'sayfa.html'), 'utf8');
const a = kaynak.indexOf('const METIN = {'), b = kaynak.indexOf(HARITA ? '\n};\n' : '\n  };\n', a);
const c = { METIN: null, SATIR: '\n' };
vm.createContext(c);
vm.runInContext(kaynak.slice(a, b + (HARITA ? 3 : 5)).replace('const METIN =', 'METIN ='), c);
const EN = c.METIN.en;
const OLCULMUS = ['tr', 'en', 'cs'];
const DILLER = process.argv[2] ? process.argv[2].split(',')
  : Object.keys(H.DIL_ADI).filter((d) => !OLCULMUS.includes(d) && !['nb', 'nn', 'ku', 'az', 'pa', 'zu'].includes(d));   // pa, zu: çevirmen yazamıyor (07.11)
const cikti = process.env.CEVIRI_DOSYA ? path.resolve(process.env.CEVIRI_DOSYA) : path.join(__dirname, '..', 'sonuc', HARITA ? 'harita_ceviri.json' : 'arayuz_ceviri.json');
const sonuc = fs.existsSync(cikti) ? JSON.parse(fs.readFileSync(cikti, 'utf8')) : {};

function kaliba(v) {   // işlevi yer tutuculu metne çevir: (sn) => `Done (${sn} s).` → "Done ({0} s)."
  return v(...Array.from({ length: Math.max(v.length, 1) }, (_, i) => `{${i}}`));
}
// YENIDEN=anahtar,anahtar → yalnız bu metinler bütün dillerde yeniden çevrilir
const YENIDEN = (process.env.YENIDEN || '').split(',').filter(Boolean);
const { dilBetigi, yabanciKelimeler, KORUNAN, eksikAdlar } = require('./alfabe.cjs');
const { yerTutucu, temizCevir, srKiril, srNesne, bellekli } = require('./cevir_ortak.cjs');   // ortak kurallar (07.11 gece)

// 13.11 (§123): bağlamsız kısa İngilizce iki anlamlı — "Assembly point" 46 dilin yarısında "montaj yeri" oldu (deprem
// toplanma alanı yerine). Ekranda İngilizce aynı kalır; çevirmene giden metin anlamı açık yazılır.
// Model İngilizceyi kendisi yanlış okuyordu — çevirmen için açıklamalar anlam_kapi.cjs'te (denetçi de oradan okur)
const { KAPI: KAPI_HARITA, KAPI_SAYFA, kapiGecer, enGerekir, CEVIRI_ICIN_HARITA, CEVIRI_ICIN_SAYFA } = require('./anlam_kapi.cjs');
const CEVIRI_ICIN = HARITA ? CEVIRI_ICIN_HARITA : CEVIRI_ICIN_SAYFA;
// harita.html'in makineDuzelt'i bunları sayfada kurar (birim: Intl; özet: parçalardan) — çevrilmez
const SAYFADA_KURULAN = HARITA ? ['m', 'km', 'dk', 'sa', 'ozetYaya', 'ozetArac'] : [];
// Anlam kapısı (13.11, §123; kural anlam_kapi.cjs'te): yön ve "buradan/buraya" çevirisi Türkçeye geri çevrilir, sol/sağ
// tutmazsa bir kez başka cümleyle, yine tutmazsa null (İngilizce). Kanıt <önbellek>_kapi.json'a, son yazımda
// olcum/kopru/harita_kapi.json'a (modelsiz denetim gönderilen her yön çevirisini bu kanıtla karşılaştırır).

const KAPI = HARITA ? KAPI_HARITA : KAPI_SAYFA;
const kapiDosya = cikti.replace(/\.json$/, '_kapi.json');
const kanit = fs.existsSync(kapiDosya) ? JSON.parse(fs.readFileSync(kapiDosya, 'utf8')) : {};
async function kapidan(anahtar, dil, c) {
  const kural = KAPI[anahtar];
  if (!kural || !c) return c;
  const geriAl = async (x, hedef = 'tr') => { try { return (await H.cevir(x, dil, hedef, 120)).trim(); } catch (e) { return ''; } };
  // Türkçe geri çeviri; yalnız kendi içinde çelişirse (hem sol hem sağ) İngilizce ikinci görüş
  const dene = async (x) => { const g = await geriAl(x); const ge = enGerekir(g, kural) ? await geriAl(x, 'en') : undefined; return { g, ge, ok: kapiGecer(g, kural, ge) }; };
  const d1 = await dene(c);
  if (d1.ok) { (kanit[dil] ||= {})[anahtar] = { ceviri: c, geri: d1.g, ...(d1.ge !== undefined && { geriEn: d1.ge }), deneme: 1 }; return c; }
  const c2 = await temizCevir(bellekli(kural.ikinci), dil);
  const d2 = c2 ? await dene(c2) : { g: '', ok: false };
  if (d2.ok) { (kanit[dil] ||= {})[anahtar] = { ceviri: c2, geri: d2.g, ...(d2.ge !== undefined && { geriEn: d2.ge }), deneme: 2, ilk: c, ilkGeri: d1.g }; return c2; }
  (kanit[dil] ||= {})[anahtar] = { ceviri: null, ilk: c, ilkGeri: d1.g, ikinci: c2, ikinciGeri: d2.g };
  console.log(`  ${dil} ${anahtar}: kapıdan geçmedi → İngilizce ("${c}" → "${d1.g}"; ikinci "${c2}" → "${d2.g}")`);
  return null;
}

async function nesne(taban, dil, yol, eski) {
  const o = {};
  for (const [k, v] of Object.entries(taban)) {
    if (v && typeof v === 'object') { o[k] = await nesne(v, dil, yol + k + '.', (eski || {})[k]); continue; }
    if (SAYFADA_KURULAN.includes(yol + k)) { o[k] = null; continue; }
    // YENIDEN'de üst anahtar ('kilavuz') yazılınca bütün alt metinleri de yeniden çevrilir (07.11)
    if (YENIDEN.length && !YENIDEN.some((x) => (yol + k) === x || (yol + k).startsWith(x + '.')) && !(v && typeof v === 'object')) { o[k] = (eski || {})[k]; continue; }
    const metin = bellekli(CEVIRI_ICIN[yol + k] || (typeof v === 'function' ? kaliba(v) : String(v)));
    if (!metin.trim() || /^[\d\s.,:%·—-]*$/.test(metin)) { o[k] = metin; continue; }
    o[k] = await temizCevir(metin, dil);
    if (KAPI[yol + k]) o[k] = await kapidan(yol + k, dil, o[k]);
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
    if (SAYFADA_KURULAN.includes(yol + k)) { o[k] = null; continue; }
    const deger = typeof e === 'string' && dil === 'sr' ? srKiril(e) : e;
    const metin = bellekli(CEVIRI_ICIN[yol + k] || (typeof v === 'function' ? kaliba(v) : String(v)));
    if (typeof deger !== 'string' || (!yabanciKelimeler(deger, dilBetigi(dil)).length && !eksikAdlar(deger, metin).length)) { o[k] = e; continue; }
    o[k] = await temizCevir(metin, dil);
    if (KAPI[yol + k]) o[k] = await kapidan(yol + k, dil, o[k]);
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
    if (process.env.KAPI_TEKRAR) {   // kural değişince yalnız kapıdan dönenler yeniden denenir (13.11, §123)
      if (!sonuc[dil]) continue;
      for (const a of Object.keys(KAPI)) {
        if (!kanit[dil] || !kanit[dil][a] || kanit[dil][a].ceviri !== null) continue;
        const v = a.split('.').reduce((x, k) => x[k], EN);
        const c = await temizCevir(bellekli(CEVIRI_ICIN[a] || (typeof v === 'function' ? kaliba(v) : String(v))), dil);
        const yeni = await kapidan(a, dil, c);
        const yol = a.split('.'), son = yol.pop();
        yol.reduce((x, k) => (x[k] ||= {}), sonuc[dil])[son] = yeni;
        console.log(`  ${dil} ${a}: ${yeni ? 'geçti' : 'yine İngilizce'}`);
      }
      fs.writeFileSync(cikti, JSON.stringify(sonuc, null, 1));
      fs.writeFileSync(kapiDosya, JSON.stringify(kanit, null, 1));
      continue;
    }
    if (sonuc[dil] && !YENIDEN.length) { console.log(`${dil}: zaten var`); continue; }
    const t0 = Date.now();
    sonuc[dil] = await nesne(EN, dil, '', sonuc[dil]);
    const say = (JSON.stringify(sonuc[dil]).match(/null/g)?.length || 0) - SAYFADA_KURULAN.length;
    fs.writeFileSync(cikti, JSON.stringify(sonuc, null, 1));
    fs.writeFileSync(kapiDosya, JSON.stringify(kanit, null, 1));
    console.log(`${dil} (${H.DIL_ADI[dil]}): ${((Date.now() - t0) / 1000).toFixed(0)} sn · İngilizce kalan ${say}`);
  }
  if (sonuc.sr) sonuc.sr = srNesne(sonuc.sr);
  fs.writeFileSync(cikti, JSON.stringify(sonuc, null, 1));
  if (process.env.CEVIRI_DOSYA) return;   // ara önbellek: birleştirilince sayfa dosyası yazılır
  const js = '// ' + (HARITA ? 'Harita sayfası' : 'Sayfa') + ' metinlerinin makine çevirisi (TranslateGemma 4B, ' + new Date().toISOString().slice(0, 10) +
    ') — insan denetimi YOK; olcum/kopru/arayuz_cevir.cjs' + (HARITA ? ' (SAYFA=harita)' : '') + ' üretir.\nwindow.' + (HARITA ? 'HEYBE_HARITA_EK' : 'HEYBE_METIN_EK') + ' = ' + JSON.stringify(sonuc) + ';\n';
  const dosya = HARITA ? 'harita_metin_ek.js' : 'metin_ek.js';
  fs.writeFileSync(path.join(HEYBE, dosya), js);
  console.log(`${dosya}: ${js.length} bayt, ${Object.keys(sonuc).length} dil`);
  {   // yayımlanan kanıt: yalnız sayfaya giden dillerin kapı anahtarları (13.11 harita, 14.11 ana sayfa)
    const yayin = {};
    for (const dil of Object.keys(sonuc)) for (const a of Object.keys(KAPI)) if (kanit[dil] && kanit[dil][a]) (yayin[dil] ||= {})[a] = kanit[dil][a];
    const ad = HARITA ? 'harita_kapi.json' : 'sayfa_kapi.json';
    fs.writeFileSync(path.join(__dirname, ad), JSON.stringify(yayin, null, 1) + '\n');
    console.log(`${ad}: ${Object.keys(yayin).length} dil`);
  }
})();
