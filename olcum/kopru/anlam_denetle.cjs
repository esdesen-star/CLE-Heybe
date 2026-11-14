// Anlam denetçisi (13.11.2026, Özet §123): ekran çevirisinde "anlam kayması" sınıfını ölçer. Alfabe ve yer tutucu denetimi
// (arayuz_denetle.cjs) "Montagepunkt"u, "nur Fliesen"i, "Cliquez ici"yi geçirdi: yazı doğru alfabede, ama anlam başka.
// Geri çeviri İngilizceye yetmez (iki anlamlı kelime iki yönde de iki anlamlıdır: Montagepunkt → "assembly point").
// Bizim kaynağımız iki dilli: her metnin elle yazılmış Türkçesi de var. Çeviri Türkçeye geri çevrilir, kökleri bizim
// Türkçeyle karşılaştırılır — "montaj yeri" ile "toplanma alanı" ortak kök taşımaz → işaret.
// Ölçünün kendi gürültüsü: kaynağın İngilizcesi de Türkçeye çevrilir (taban); tabanı işaretli anahtarda ölçü güvenilmez
// (eş anlamlı kelime), sonuç ayrı yazılır. İşaret hüküm değildir: liste insan ya da Can gözüyle okunur.
// Kullanım: SAYFA=harita CEVIRMEN=http://127.0.0.1:18082[,http://127.0.0.1:18083] node olcum/kopru/anlam_denetle.cjs [dil,dil,…]
//   CEVIRI_DOSYA=…  çeviri önbelleği (varsayılan sonuc/harita_ceviri.json ya da arayuz_ceviri.json)
//   KISA=40         yalnız İngilizcesi bu kadar ya da daha kısa metinler (iki anlamlılık kısa metinde yaşar); TUM=1 hepsi
//   CIKTI=…         satır satır sonuç (varsayılan sonuc/anlam_<sayfa>.jsonl)
//   KAYNAK_YALNIZ=1 yalnız kaynak taraması (İngilizce → Türkçe taban; dil başına geri çeviri yapılmaz — ucuz)
//   ANAHTAR=a,b     dil başına geri çeviri yalnız bu anahtarlarda (ve altlarında)
//   ESIK=0.5        işaret: bizim Türkçenin köklerinden geri çeviride bulunanların payı bu değerin ALTINDA
//                   ("Montaj alanı" ile "Toplanma alanı" 1/2 paylaşır — tek kelimelik fark kısa metinde anlamın kendisidir)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
const ADRESLER = (process.env.CEVIRMEN || 'http://127.0.0.1:18082').split(',');
const HARITA = process.env.SAYFA === 'harita';
const HEYBE = path.join(__dirname, '..', '..', 'tasinabilir', 'usb_kok', 'heybe');
const SONUC = path.join(__dirname, '..', 'sonuc');
const kaynak = fs.readFileSync(path.join(HEYBE, HARITA ? 'harita.html' : 'sayfa.html'), 'utf8');
const a = kaynak.indexOf('const METIN = {'), b = kaynak.indexOf(HARITA ? '\n};\n' : '\n  };\n', a);
const c = { METIN: null, SATIR: '\n' };
vm.createContext(c);
vm.runInContext(kaynak.slice(a, b + (HARITA ? 3 : 5)).replace('const METIN =', 'METIN ='), c);
const { en: EN, tr: TR } = c.METIN;
const ceviriDosya = process.env.CEVIRI_DOSYA ? path.resolve(process.env.CEVIRI_DOSYA) : path.join(SONUC, HARITA ? 'harita_ceviri.json' : 'arayuz_ceviri.json');
const CEVIRI = JSON.parse(fs.readFileSync(ceviriDosya, 'utf8'));
const KISA = process.env.TUM ? Infinity : Number(process.env.KISA || 40);
const CIKTI = process.env.CIKTI || path.join(SONUC, `anlam_${HARITA ? 'harita' : 'sayfa'}.jsonl`);
const ONBELLEK = path.join(SONUC, `anlam_${HARITA ? 'harita' : 'sayfa'}_onbellek.json`);
const onbellek = fs.existsSync(ONBELLEK) ? JSON.parse(fs.readFileSync(ONBELLEK, 'utf8')) : {};

const kaliba = (v) => (typeof v === 'function' ? v(...Array.from({ length: Math.max(v.length, 1) }, (_, i) => `{${i}}`)) : String(v));
// Türkçe kökler: küçük harf, şapkasız, yer tutucusuz; 3+ harfli kelimelerin ilk 4 harfi (sondan eklemeli dil — "toplanma" ~ "toplama")
const DURAK = new Set(['bir', 've', 'ile', 'icin', 'bu', 'su', 'da', 'de', 'mi', 'ki', 'olarak', 'daha', 'cok', 'gibi', 'veya', 'ya', 'ne', 'her', 'sen', 'siz', 'ben']);
function kokler(m) {
  const s = String(m).replace(/\{\d\}/g, ' ').toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');
  return new Set((s.match(/\p{L}+/gu) || []).filter((w) => w.length >= 3 && !DURAK.has(w)).map((w) => w.slice(0, 4)));
}
function puan(trMetin, geri) {
  const k = kokler(trMetin);
  if (!k.size) return null;
  const g = kokler(geri);
  return [...k].filter((x) => g.has(x)).length / k.size;
}
// kapsam: [anahtar yolu, İngilizce, Türkçe] — Türkçesi olmayan ya da sayfanın kendi kurduğu metin dışarıda
function kapsam(en, tr, yol = '') {
  const o = [];
  for (const [k, v] of Object.entries(en)) {
    const t = tr ? tr[k] : undefined;
    if (v && typeof v === 'object') { o.push(...kapsam(v, t, yol + k + '.')); continue; }
    if (t === undefined || t === null) continue;
    const m = kaliba(v);
    if (m.length > KISA || !kokler(kaliba(t)).size) continue;
    o.push([yol + k, m, kaliba(t)]);
  }
  return o;
}
const al = (o, yol) => yol.split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);

async function geriCevir(metin, dil, adres) {
  const anahtar = `${dil}|${metin}`;
  if (onbellek[anahtar] !== undefined) return onbellek[anahtar];
  let g = '';
  try { g = (await H.cevir(metin.replace(/\{\d\}/g, 'X'), dil, 'tr', 200, adres)).trim(); } catch (e) { g = ''; }
  onbellek[anahtar] = g;
  return g;
}

(async () => {
  const liste = kapsam(EN, TR);
  const diller = process.argv[2] ? process.argv[2].split(',') : Object.keys(CEVIRI);
  // taban: İngilizce kaynak → Türkçe, bizim Türkçeyle aynı ölçü (ölçünün kendi gürültüsü)
  // çevirmene açıklamalı metin gidiyorsa (anlam_kapi.cjs CEVIRI_ICIN_HARITA) taban o metinle ölçülür
  const { CEVIRI_ICIN_HARITA, CEVIRI_ICIN_SAYFA } = require('./anlam_kapi.cjs');
  const { bellekli } = require('./cevir_ortak.cjs');
  const ICIN = HARITA ? CEVIRI_ICIN_HARITA : CEVIRI_ICIN_SAYFA;
  const taban = {}, tabanMetin = {};
  for (const [yol, en, tr] of liste) { tabanMetin[yol] = bellekli(ICIN[yol] || en); taban[yol] = puan(tr, await geriCevir(tabanMetin[yol], 'en', ADRESLER[0])); }
  const satirlar = [];
  let sira = process.env.KAYNAK_YALNIZ ? diller.length : 0;
  const ANAHTAR = (process.env.ANAHTAR || '').split(',').filter(Boolean);
  const secili = (yol) => !ANAHTAR.length || ANAHTAR.some((a) => yol === a || yol.startsWith(a + '.'));
  async function isci(adres) {
    while (sira < diller.length) {
      const dil = diller[sira++];
      for (const [yol, en, tr] of liste) {
        if (!secili(yol)) continue;
        const cev = al(CEVIRI[dil], yol);
        if (typeof cev !== 'string' || !cev.trim()) continue;
        const geri = await geriCevir(cev, dil, adres);
        satirlar.push({ dil, anahtar: yol, en, tr, ceviri: cev, geri, puan: geri ? puan(tr, geri) : null, taban: taban[yol] });
      }
      fs.writeFileSync(ONBELLEK, JSON.stringify(onbellek));
      process.stderr.write(`${dil} `);
    }
  }
  await Promise.all(ADRESLER.map(isci));
  fs.writeFileSync(ONBELLEK, JSON.stringify(onbellek));
  fs.writeFileSync(CIKTI, satirlar.map((s) => JSON.stringify(s)).join('\n') + '\n');
  // özet: anahtar başına kaç dilde işaret. Çok dilde işaret = kaynağın kendisi iki anlamlı; tek tük = nadir hata
  const ESIK = Number(process.env.ESIK || 0.5);
  const isaret = satirlar.filter((s) => s.puan !== null && s.puan < ESIK);
  const anahtarBasina = {};
  for (const s of isaret) (anahtarBasina[s.anahtar] ||= []).push(s.dil);
  const olculen = satirlar.filter((s) => s.puan !== null).length;
  console.log(`\n${liste.length} metin · ${diller.length} dil · ${olculen} çeviri ölçüldü · işaret ${isaret.length} (%${(100 * isaret.length / Math.max(1, olculen)).toFixed(1)})`);
  // 13.11 ilk koşunun dersi: dil başına işaret çok gürültülü (geri çeviri "vapur" yerine "feribot" der). En işe yarayan
  // işaret kaynağın kendisi: modelin İngilizceyi Türkçeye çevirişi bizim Türkçeyi tutmuyorsa metin iki anlamlı olabilir
  // (Assembly point → "montaj noktası", Square → "kare", steps → "adımlar"). Bu liste göz ile okunur; eş anlamlılar elenir.
  console.log(`\nKAYNAK — modelin İngilizce → Türkçesi bizim Türkçeyi tutmuyor (${liste.filter(([y]) => taban[y] !== null && taban[y] < ESIK).length} metin; iki anlamlı olabilir):`);
  for (const [y, en, tr] of liste) if (taban[y] !== null && taban[y] < ESIK) console.log(`  ${y.padEnd(28)} "${tabanMetin[y]}" · bizim: "${tr}" · model: "${onbellek[`en|${tabanMetin[y]}`]}"`);
  console.log('\nDİL BAŞINA (gürültülü — eş anlamlıyı da işaretler):');
  const sirali = Object.entries(anahtarBasina).sort((x, y) => y[1].length - x[1].length);
  for (const [k, d] of sirali) {
    const tb = taban[k] !== null && taban[k] < ESIK ? ' [taban da işaretli: ölçü güvenilmez]' : '';
    console.log(`  ${String(d.length).padStart(2)} dil  ${k}${tb}  — ${d.slice(0, 12).join(',')}${d.length > 12 ? '…' : ''}`);
  }
})();
