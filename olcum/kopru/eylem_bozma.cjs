// Eylem bekçisinin bozma denemesi (Ö25, 07.11 — Özet §46; "Testin Dişi"): her kural tek tek körleştirilir, izinler/istisnalar silinir, olumsuzluk sayacı susturulur;
// her bozmada dis_denetim'in eylem bloğundan en az bir örnek düşmeli.
// Kullanım: node olcum/kopru/eylem_bozma.cjs   (modelsiz.sh her koşuda çalıştırır)
const path = require('path');
const fs = require('fs');
const kok = path.join(__dirname, '..', '..');
const H = require(path.join(kok, 'tasinabilir/usb_kok/heybe/arkadas.js'));
const kaynak = fs.readFileSync(path.join(kok, 'olcum/kopru/dis_denetim.cjs'), 'utf8');
const ornek = eval(kaynak.slice(kaynak.indexOf('const EYLEM_ORNEK = ['), kaynak.indexOf('];', kaynak.indexOf('const EYLEM_ORNEK = [')) + 2).replace('const EYLEM_ORNEK =', '(').replace(/;\s*$/, ')'));
const say = () => ornek.filter(([ad, dil, soru, cevap]) => { const r = H.eylemDenetle(soru, cevap, dil); return ad ? r.includes(`eylem: ${ad}`) : r.length === 0; }).length;
const ASLA = /(?!)/, HEP = /.?/;
const bozmalar = [];
H.EYLEM.forEach((k, i) => {
  for (const d of ['tr', 'en']) bozmalar.push([`${k.ad} ${d} eylemi kör`, () => { const e = k[d]; k[d] = ASLA; return () => { k[d] = e; }; }]);
  if (k.izin) bozmalar.push([`${k.ad} izni sil`, () => { const e = k.izin; k.izin = { tr: ASLA, en: ASLA }; return () => { k.izin = e; }; }]);
  if (k.soru) bozmalar.push([`${k.ad} soru sınırı sil`, () => { const e = k.soru; k.soru = { tr: HEP, en: HEP }; return () => { k.soru = e; }; }]);
  if (k.sonraSerbest) bozmalar.push([`${k.ad} sonraSerbest sil`, () => { k.sonraSerbest = false; return () => { k.sonraSerbest = true; }; }]);
  if (k.kisiYok) bozmalar.push([`${k.ad} kisiYok sil`, () => { const e = k.kisiYok; delete k.kisiYok; return () => { k.kisiYok = e; }; }]);
  if (k.haric) bozmalar.push([`${k.ad} hariç sil`, () => { const e = k.haric; delete k.haric; return () => { k.haric = e; }; }]);
});
for (const d of ['tr', 'en']) bozmalar.push([`olumsuzluk sayacı ${d} sustur`, () => { const e = H.OLUMSUZ_SAY[d]; H.OLUMSUZ_SAY[d] = () => 0; return () => { H.OLUMSUZ_SAY[d] = e; }; }]);
const taban = say();
let yakalanan = 0; const kacan = [];
for (const [ad, boz] of bozmalar) { const geri = boz(); const n = say(); geri(); if (n < taban) yakalanan++; else kacan.push(ad); }
console.log(`taban ${taban}/${ornek.length} · ${bozmalar.length} bozma, ${yakalanan} yakalandı`);
for (const k of kacan) console.log('  KAÇAN: ' + k);
