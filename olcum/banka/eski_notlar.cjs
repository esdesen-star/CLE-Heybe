// Eski notları bankaya taşır (bir kez, 07.11.2026): sonuc/puanlar.json'daki hükümler, ait oldukları cevap
// dosyasındaki cevabın iziyle banka/notlar.json'a girer. Sonra o cevap yeniden çıkarsa not kendiliğinden geçer.
// Eşleşme 07.11'de denetlendi: "1_llamafile_kalibi" ↔ olcum_heybe_js.jsonl ("duyularınla anla"),
// "2_ollama_kalibi" ↔ olcum_heybe_js_kalip.jsonl ("sodyum hidroksit"), "kisa_bicim" ↔ olcum_heybe_js_kisa.jsonl.
const fs = require('fs');
const path = require('path');
const B = require('./banka.cjs');
const SONUC = path.join(__dirname, '..', 'sonuc');
const puan = JSON.parse(fs.readFileSync(path.join(SONUC, 'puanlar.json'), 'utf8'));
const ESLES = [
  ['heybe_js_1_llamafile_kalibi', 'olcum_heybe_js.jsonl', 'U', '0.2.0'],
  ['heybe_js_2_ollama_kalibi', 'olcum_heybe_js_kalip.jsonl', 'U', '0.2.0'],
  ['heybe_js_kisa_bicim', 'olcum_heybe_js_kisa.jsonl', 'K', '0.3.0'],
];
const YOK = 'Kaynaklarımda bu bilgi yok.';
const n = B.notlar();
let eklenen = 0;
for (const [anahtar, dosya, on, surum] of ESLES) {
  for (const satir of fs.readFileSync(path.join(SONUC, dosya), 'utf8').split('\n').filter((x) => x.trim())) {
    const r = JSON.parse(satir);
    const p = (puan[anahtar] || {})[String(r.no)];
    if (!p || !p.kaynakli) continue;
    const kimlik = on === 'U' ? `U${String(r.no).padStart(2, '0')}` : `K${r.no}`;
    const cevap = r.kaynakli || '';
    const izi = B.iz({ durdur: r.durdur, bilgiYok: !r.durdur && cevap.trim() === YOK, cevap });
    const hukum = { durduruldu: 'durdu' }[p.kaynakli] || p.kaynakli;
    if (!B.HUKUMLER.includes(hukum)) { console.log(`  atlandı ${kimlik}: ${p.kaynakli}`); continue; }
    n[kimlik] = (n[kimlik] || []).filter((x) => x.iz !== izi);
    n[kimlik].push({ iz: izi, hukum, not: p.not || '', surum, sonuc: r.durdur ? 'durdu' : cevap.trim() === YOK ? 'bilgiYok' : 'cevap',
      cevap: B.sade(cevap).slice(0, 160), tarih: '2026-11-07', kaynak: `puanlar.json/${anahtar}` });
    eklenen++;
  }
}
B.notlariYaz(n);
console.log(`${eklenen} eski hüküm bankaya girdi (${Object.keys(n).length} soru)`);
// 0.8.0 cevapları (paragraf düzeltmesi sonrası) hangi izle eşleşiyor: eşleşmeyen = notlanacak
for (const [dosya, on] of [['olcum_heybe_js_paragraf.jsonl', 'U'], ['olcum_heybe_js_kisa_paragraf.jsonl', 'K']]) {
  let es = 0, yok = [];
  for (const satir of fs.readFileSync(path.join(SONUC, dosya), 'utf8').split('\n').filter((x) => x.trim())) {
    const r = JSON.parse(satir);
    const kimlik = on === 'U' ? `U${String(r.no).padStart(2, '0')}` : `K${r.no}`;
    const cevap = r.kaynakli || '';
    const izi = B.iz({ durdur: r.durdur, bilgiYok: !r.durdur && cevap.trim() === YOK, cevap });
    if (B.notBul(n, kimlik, izi)) es++; else yok.push(kimlik);
  }
  console.log(`  ${dosya}: notu hazır ${es}, notlanacak ${yok.length} (${yok.join(' ')})`);
}
