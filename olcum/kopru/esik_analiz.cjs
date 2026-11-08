// Zayıf havuz eşiği (07.11 öğleden sonra, Özet §47): kendi dilindeki havuzun en iyi paragrafı soruya çok uzaksa model
// o paragraflardan cevap yazmasın mı? Her eşik için: notlu kendi-dili cevaplarından kaçı eşiğin altında kalır —
// doğrular (kayıp) ve yanlış/tehlikeliler (kazanç). Havuz: olcum/sonuc/arama_havuz.json (arama_olc.cjs DENEME=kendi).
// Kullanım: node olcum/kopru/esik_analiz.cjs
const fs = require('fs');
const path = require('path');
const B = require('../banka/banka.cjs');
const S = path.join(__dirname, '..', 'sonuc');
const havuz = JSON.parse(fs.readFileSync(path.join(S, 'arama_havuz.json'), 'utf8'));
const n = B.notlar();
// bugünkü ürünün kendi-dili cevapları: her setin en son ölçümü
const DOSYA = { U: 'banka_0.9.0_UK_koprusuz.jsonl', K: 'banka_0.9.0_UK_koprusuz.jsonl', Y: 'banka_0.9.0_Y.jsonl', Z: 'banka_0.10.0_Z.jsonl', X: 'banka_0.11.0_X.jsonl' };
const satir = [];
const okunan = {};
for (const [set, d] of Object.entries(DOSYA)) {
  okunan[d] = okunan[d] || fs.readFileSync(path.join(S, d), 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x));
  for (const r of okunan[d]) {
    if (r.kimlik[0] !== set || r.dil !== 'tr') continue;
    const h = havuz[`${r.kimlik}|kendi`];
    if (!h || !h.aday.length) continue;
    const kendi = (r.kaynakDilleri || ['tr']).every((x) => x === 'tr');
    const nt = B.notBul(n, r.kimlik, r.iz);
    if (!nt) continue;
    satir.push({ kimlik: r.kimlik, ust: h.aday[0].puan, ust3: h.aday.slice(0, 3).reduce((t, a) => t + a.puan, 0) / Math.min(3, h.aday.length),
      hukum: nt.hukum, sonuc: r.sonuc, kendi, makale: `${h.aday[0].makale}${h.aday[0].bolum ? ' — ' + h.aday[0].bolum : ''}` });
  }
}
const kotu = (s) => ['yanlış', 'tehlikeli'].includes(s.hukum);
console.log(`— ${satir.length} notlu Türkçe soru (kendi dili cevap ${satir.filter((s) => s.kendi).length}) —`);
for (const s of [...satir].sort((a, b) => a.ust - b.ust).slice(0, 30)) {
  console.log(`${s.kimlik.padEnd(5)} ${s.ust.toFixed(3)} ${s.ust3.toFixed(3)} ${s.hukum.padEnd(9)} ${s.kendi ? 'kendi' : 'köprü'} ${s.makale.slice(0, 60)}`);
}
for (const olcu of ['ust', 'ust3']) {
  for (const e of [0.38, 0.40, 0.42, 0.44, 0.46, 0.48, 0.50]) {
    const alt = satir.filter((s) => s[olcu] < e && s.kendi);
    const say = (f) => alt.filter(f).map((s) => s.kimlik);
    console.log(`${olcu.padEnd(4)} < ${e.toFixed(2)}: ${alt.length} soru · doğru ${say((s) => s.hukum === 'doğru').join(' ') || '-'} · kısmen ${say((s) => s.hukum === 'kısmen').length} · kötü ${say(kotu).join(' ') || '-'} · bilgi yok ${say((s) => s.hukum === 'bilgi yok').length} · durdu ${say((s) => s.hukum === 'durdu').length}`);
  }
}
