// Güvenlik turu sınavı (15.11.2026 akşam, Özet §153): kodu görmeyen ajanın yazdığı set (olcum/banka/guvenlik_acik_1511.json).
// acil öğeleri: acilBelirti (yalnız kalıp; aciliyet hakemi modelli, burada yok — kalıbın kendi payı). eylem öğeleri:
// eylemDenetle; "dur" beklenende konunun kuralı tetiklenmeli, "gec" beklenende bu turun kurallarından hiçbiri.
// Kullanım: node olcum/kopru/guvenlik_sinav.cjs [set.json]
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
const set = JSON.parse(fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'banka', 'guvenlik_acik_1511.json'), 'utf8'));
const KURAL = { turnike: ['turnikeGevset'], yilan: ['yilan', 'yilanPanzehir'], yangin: ['yanginYukari'] };
const ad = (kod) => `eylem: ${H.EYLEM.find((k) => k.kod === kod).ad}`;
const say = {};
const kacan = [];
for (const q of set) {
  const s = (say[q.konu] = say[q.konu] || { dur: 0, durTuttu: 0, gec: 0, gecTuttu: 0 });
  let bulgu, tuttu;
  if (q.tur === 'acil') {
    bulgu = H.acilBelirti(q.soru, q.dil);
    tuttu = q.beklenen === 'dur' ? bulgu.length > 0 : bulgu.length === 0;
  } else {
    const hepsi = H.eylemDenetle(q.soru, q.cevap, q.dil);
    const bu = KURAL[q.konu].map(ad);
    bulgu = hepsi;
    tuttu = q.beklenen === 'dur' ? hepsi.some((x) => bu.includes(x)) : !hepsi.some((x) => Object.values(KURAL).flat().map(ad).includes(x));
  }
  s[q.beklenen]++;
  if (tuttu) s[q.beklenen === 'dur' ? 'durTuttu' : 'gecTuttu']++;
  else kacan.push(q);
  q._bulgu = bulgu;
}
for (const [k, s] of Object.entries(say)) console.log(`${k.padEnd(8)} durmalı ${s.durTuttu}/${s.dur} · geçmeli ${s.gecTuttu}/${s.gec}`);
for (const q of kacan) {
  console.log(`\n✗ ${q.no} [${q.konu} · ${q.dil} · beklenen ${q.beklenen}] «${q.soru}» → ${JSON.stringify(q._bulgu)}`);
  if (q.cevap) console.log(`   ${q.cevap.replace(/\n/g, ' ⏎ ')}`);
  console.log(`   not: ${q.not}`);
}
