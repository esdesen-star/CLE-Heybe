// Köprü havuzu eşiği (07.11, Özet §47): köprüden gelen notlu cevaplarda köprü havuzunun en iyi puanı hükümle nasıl dağılıyor?
// Puanlar dil aşırı (Türkçe soru ↔ İngilizce paragraf), kendi dilindekinden düşüktür — eşik ayrı ölçülür.
// Kullanım: node olcum/kopru/esik_kopru.cjs
const fs = require('fs');
const path = require('path');
const B = require('../banka/banka.cjs');
const S = path.join(__dirname, '..', 'sonuc');
const havuz = JSON.parse(fs.readFileSync(path.join(S, 'arama_havuz.json'), 'utf8'));
const n = B.notlar();
const son = {};
for (const f of ['banka_0.9.0_Y.jsonl', 'banka_0.10.0_Z.jsonl', 'banka_0.11.0_X.jsonl', 'banka_0.12.0_zayif_gorulmus.jsonl']) {
  for (const r of fs.readFileSync(path.join(S, f), 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x))) {
    if (r.dil === 'tr' && !r.kaynakDilleri.every((d) => d === r.dil)) son[r.kimlik] = r;
    else if (f.includes('zayif')) delete son[r.kimlik];
  }
}
const satir = [];
for (const [k, r] of Object.entries(son)) {
  const h = havuz[`${k}|kopru`];
  const nt = B.notBul(n, k, r.iz);
  if (!h || !h.aday.length || !nt) continue;
  satir.push({ k, ust: h.aday[0].puan, hukum: nt.hukum, makale: `${h.aday[0].makale}${h.aday[0].bolum ? ' — ' + h.aday[0].bolum : ''}`, soru: r.soru });
}
for (const s of satir.sort((a, b) => a.ust - b.ust)) console.log(`${s.k.padEnd(5)} ${s.ust.toFixed(3)} ${s.hukum.padEnd(9)} ${s.makale.slice(0, 50).padEnd(50)} ${s.soru.slice(0, 45)}`);
const kotu = (s) => ['yanlış', 'tehlikeli'].includes(s.hukum);
for (const e of [0.34, 0.36, 0.38, 0.40, 0.42]) {
  const alt = satir.filter((s) => s.ust < e);
  console.log(`< ${e.toFixed(2)}: ${alt.length} · doğru ${alt.filter((s) => s.hukum === 'doğru').map((s) => s.k).join(' ') || '-'} · kısmen ${alt.filter((s) => s.hukum === 'kısmen').map((s) => s.k).join(' ') || '-'} · kötü ${alt.filter(kotu).map((s) => s.k).join(' ') || '-'} · durdu ${alt.filter((s) => s.hukum === 'durdu').length} · bilgi yok ${alt.filter((s) => s.hukum === 'bilgi yok').length}`);
}
