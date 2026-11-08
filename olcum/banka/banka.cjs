// Sınav bankası (Ö21, 07.11.2026 — Özet §44). Bütün soru setleri tek kimlikle; her cevabın notu cevabın İZİNE bağlı:
// yeni sürümde cevap aynıysa not kendiliğinden geçer, yalnız değişen cevabı insan okur. Setlerin kendisi yerinde kalır
// (eski betikler onları okur); banka yalnız dizindir.
//   U = 20 uzun soru (betik/sorular.json, 01.11) · K = 40 kısa biçim (betik/sorular_kisa.json, 06.11)
//   D = 24 bekçi sorusu (betik/sorular_denetim.json, 06.11) · S = 12 sınav kitabı köprü sorusu (kopru/sinav_sorulari.json)
//   L = 7 dil duman sorusu (kopru/dil_duman.json) · Y = görülmemiş yeni sorular (banka/yeni_*.json)
// "gorulme": ayar | goruldu | yeni — ayar: Heybe o sette ayarlandı; goruldu: bir kez ölçüldü, sonra ayar yapıldı;
// yeni: hiç sorulmadı (ilk ölçüm dürüst ölçümdür, sonra "goruldu" olur).
// Kullanım: node olcum/banka/banka.cjs   → bankayı denetler, set başına sayar
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OLCUM = path.join(__dirname, '..');
const NOTLAR = path.join(__dirname, 'notlar.json');
const oku = (p) => JSON.parse(fs.readFileSync(path.join(OLCUM, p), 'utf8'));

const SETLER = [
  { on: 'U', dosya: 'betik/sorular.json', gorulme: 'ayar', kitaplik: 'gelistirme' },
  { on: 'K', dosya: 'betik/sorular_kisa.json', gorulme: 'ayar', kitaplik: 'gelistirme' },
  { on: 'D', dosya: 'betik/sorular_denetim.json', gorulme: 'ayar', kitaplik: 'gelistirme' },
  { on: 'S', dosya: 'kopru/sinav_sorulari.json', gorulme: 'ayar', kitaplik: 'sinav' },
  { on: 'L', dosya: 'kopru/dil_duman.json', gorulme: 'goruldu', kitaplik: 'sinav' },
];
// yeni setler: banka/yeni_*.json; ilk ölçümü yapılan sürüm banka/olculen.json'da (o andan sonra "goruldu")
function yeniSetler() {
  return fs.readdirSync(__dirname).filter((f) => /^yeni_.*\.json$/.test(f)).sort()
    .map((f) => ({ on: '', dosya: path.join('banka', f), gorulme: 'yeni', kitaplik: 'gelistirme' }));
}

function sorular() {
  const olculen = fs.existsSync(path.join(__dirname, 'olculen.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'olculen.json'), 'utf8')) : {};
  const liste = [];
  for (const s of [...SETLER, ...yeniSetler()]) {
    for (const q of oku(s.dosya)) {
      const kimlik = s.on ? `${s.on}${String(q.no).padStart(s.on === 'D' ? 0 : 2, '0')}` : String(q.no);
      const gorulme = s.gorulme === 'yeni' && olculen[path.basename(s.dosya)] ? 'goruldu' : s.gorulme;
      liste.push({ kimlik, set: s.on || kimlik[0], dosya: s.dosya, kitaplik: s.kitaplik, gorulme, dil: q.dil || 'tr',
        tur: q.tur || q.konu || '', soru: q.soru, beklenen: q.beklenen || '', tuzak: q.tuzak || '' });
    }
  }
  return liste;
}

// iz: cevabın ne gösterdiği — sonuç türü + boşlukları sadeleşmiş cevap metni (kaynak numaraları dahil)
const sade = (m) => String(m || '').split(/\s+/).join(' ').trim();
function sonucTuru(r) { return r.durdur ? 'durdu' : r.bilgiYok ? 'bilgiYok' : 'cevap'; }
function iz(r) { return crypto.createHash('sha256').update(sonucTuru(r) + '\n' + sade(r.cevap)).digest('hex').slice(0, 16); }

function notlar() { return fs.existsSync(NOTLAR) ? JSON.parse(fs.readFileSync(NOTLAR, 'utf8')) : {}; }
function notlariYaz(n) { fs.writeFileSync(NOTLAR, JSON.stringify(n, null, 1) + '\n'); }
// hüküm: doğru · kısmen · bilgi yok · durdu · yanlış · tehlikeli  (karne: durmadan geçen yanlış ve tehlikeli)
const HUKUMLER = ['doğru', 'kısmen', 'bilgi yok', 'durdu', 'yanlış', 'tehlikeli'];
function notBul(n, kimlik, izi) { return (n[kimlik] || []).find((x) => x.iz === izi) || null; }

module.exports = { sorular, iz, sonucTuru, sade, notlar, notlariYaz, notBul, HUKUMLER, NOTLAR };

if (require.main === module) {
  const l = sorular();
  const sayac = {};
  const gorulen = new Set();
  let hata = 0;
  for (const q of l) {
    if (gorulen.has(q.kimlik)) { console.log(`  ÇİFT KİMLİK: ${q.kimlik}`); hata++; }
    gorulen.add(q.kimlik);
    if (!q.soru || !q.dil) { console.log(`  EKSİK: ${q.kimlik}`); hata++; }
    const k = `${q.set} (${q.gorulme})`;
    sayac[k] = (sayac[k] || 0) + 1;
  }
  const n = notlar();
  const notlu = Object.keys(n).length;
  console.log(`— banka: ${l.length} soru · ${Object.entries(sayac).map(([k, v]) => `${k} ${v}`).join(' · ')} · notu olan ${notlu} —`);
  for (const [k, v] of Object.entries(n)) for (const x of v) if (!HUKUMLER.includes(x.hukum)) { console.log(`  GEÇERSİZ HÜKÜM: ${k} ${x.hukum}`); hata++; }
  if (hata) { console.log(`HATA ${hata}`); process.exit(1); }
}
