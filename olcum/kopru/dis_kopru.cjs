// Köprü denetçisinin dişi (06.11.2026): köprü v1 cevaplarını BİLEREK bozar, iki dilli denetçi yakalıyor mu?
// Her bozma önce metni gerçekten değiştirdiğini kanıtlar (dişsiz test olmasın — Özet §27).
// Kullanım: node olcum/kopru/dis_kopru.cjs   (olcum/sonuc/olcum_kopru_en_v1.jsonl gerekir)
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
const kayit = fs.readFileSync(path.join(__dirname, '..', 'sonuc', 'olcum_kopru_en_v1.jsonl'), 'utf8')
  .trim().split('\n').map(JSON.parse);

// [soru no, çeviride aranan, yerine konan]
const BOZMALAR = [
  [2, /1 dakika|bir dakika/, '5 dakika'],
  [2, /3 dakika|üç dakika/, '30 dakika'],
  [8, /4 gram|dört gram/, '8 gram'],
  [15, /100/, '60'],
  [15, /5 cm|beş cm|5 santimetre/, '2 cm'],
];

function denetim(r, ceviri) {
  return [...new Set([...H.denetle(r.parcalar, r.ozgun.cevap, r.ozgun.dil),
    ...H.denetle([{ metin: r.ozgun.cevap, dil: r.ozgun.dil }], ceviri, 'tr')])];
}

let kacan = 0, bos = 0;
for (const [no, aranan, yeni] of BOZMALAR) {
  const r = kayit.find((k) => k.no === no);
  if (!r || !r.ozgun) { console.log(`${no}: köprü cevabı yok`); bos++; continue; }
  if (!aranan.test(r.kaynakli)) { console.log(`${no} ${aranan}: BOZMA BOŞA DÜŞÜYOR (çeviride yok)`); bos++; continue; }
  const bozuk = r.kaynakli.replace(aranan, yeni);
  const temiz = denetim(r, r.kaynakli), sonuc = denetim(r, bozuk);
  const yakaladi = sonuc.length > temiz.length;
  if (!yakaladi) kacan++;
  console.log(`${no} ${aranan} → '${yeni}': ${yakaladi ? 'YAKALADI ' + JSON.stringify(sonuc) : 'KAÇIRDI'}`);
}
console.log(`dişler: ${BOZMALAR.length - kacan - bos}/${BOZMALAR.length} yakalandı` + (bos ? ` · ${bos} boşa düştü` : ''));
process.exitCode = kacan || bos ? 1 : 0;
