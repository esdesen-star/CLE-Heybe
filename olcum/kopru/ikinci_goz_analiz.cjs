// İkinci göz (Ö22) denemesi — kayıtlı, notlu cevaplarla (07.11, Özet §45). Sohbet modeline soru + cevap (+ istenirse
// cevabın dayandığı kaynak başlıkları) gösterilip "bu cevap sorulan duruma mı ait?" diye sorulur. Kötüleri (yanlış/
// tehlikeli geçen) yakalıyor mu, doğrulara boş alarm veriyor mu? Model hakem olarak güvenilmez olabilir: ölçülür.
// Kullanım: SOHBET=http://127.0.0.1:18080 KALIP=a node olcum/kopru/ikinci_goz_analiz.cjs sonuc1.jsonl [sonuc2.jsonl]
const fs = require('fs');
const path = require('path');
const B = require('../banka/banka.cjs');
const SOHBET = process.env.SOHBET || 'http://127.0.0.1:18080';
const KALIP = process.env.KALIP || 'a';
const ONB = path.join(__dirname, '..', 'sonuc', 'ikinci_goz_onbellek.json');
const onb = fs.existsSync(ONB) ? JSON.parse(fs.readFileSync(ONB, 'utf8')) : {};

const KALIPLAR = {
  a: (q, a) => `You check answers of an offline first-aid helper. Read the QUESTION and the ANSWER.
Does the ANSWER talk about the same situation as the QUESTION — the same person (for example baby vs adult), the same event (for example dog bite vs snake bite, smoke vs choking), and the same need?
Reply with exactly one word: YES or NO.

QUESTION: ${q}

ANSWER: ${a}`,
  b: (q, a) => `QUESTION: ${q}

ANSWER: ${a}

Is this ANSWER actually an answer to this QUESTION, or does it describe a different situation, a different person or an unrelated topic? Reply with exactly one word: ANSWERS or DIFFERENT.`,
  // c: önce yaz sonra karar ver (07.11 öğleden sonra, yakın durum turu)
  c: (q, a) => `You check answers of an offline first-aid helper.

QUESTION: ${q}

ANSWER: ${a}

Write exactly three short lines:
ASKS: the situation in the question and what the person wants (what to do, a number, signs, yes or no …).
GIVES: the situation the answer is about and what it gives.
VERDICT: YES if the answer gives what the question asks, for the same situation. NO if it is about a neighbouring situation, gives background instead of what was asked, or does not answer.`,
  // e: ihtiyaç odaklı tek kelime
  e: (q, a) => `QUESTION: ${q}

ANSWER: ${a}

Does the ANSWER give the person what the QUESTION asks for? Answer NO if the ANSWER is about a different but related situation, or gives background (history, how something works, general facts) instead of what was asked. Reply with exactly one word: YES or NO.`,
};
const NPRED = { a: 4, b: 4, c: 120, e: 4 };
async function sor(istem) {
  if (onb[istem] !== undefined) return onb[istem];
  const metin = `<start_of_turn>user\n${istem}<end_of_turn>\n<start_of_turn>model\n`;
  const y = await (await fetch(`${SOHBET}/completion`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: metin, n_predict: NPRED[KALIP], temperature: 0, cache_prompt: true, stop: ['<end_of_turn>'] }) })).json();
  onb[istem] = String(y.content || '').trim();
  fs.writeFileSync(ONB, JSON.stringify(onb));
  return onb[istem];
}
const hayir = (c) => (KALIP === 'b' ? /^\W*different/i.test(c) : KALIP === 'c' ? /VERDICT\W*NO\b/i.test(c) : /^\W*no\b/i.test(c));

(async () => {
  const n = B.notlar();
  const sonuc = [];
  for (const dosya of process.argv.slice(2)) {
    for (const r of fs.readFileSync(dosya, 'utf8').split('\n').filter((x) => x.trim()).map((x) => JSON.parse(x))) {
      if (r.sonuc !== 'cevap') continue;
      const nt = B.notBul(n, r.kimlik, r.iz);
      if (!nt) continue;
      if (sonuc.some((x) => x.kimlik === r.kimlik && x.iz === r.iz)) continue;
      const cevap = B.sade(r.cevap).replace(/\[[\d,\s]+\]/g, '').slice(0, 1200);
      const c = await sor(KALIPLAR[KALIP](r.soru, cevap));
      sonuc.push({ iz: r.iz, kimlik: r.kimlik, hukum: nt.hukum, karar: c, alarm: hayir(c) });
    }
  }
  const kotu = (s) => ['yanlış', 'tehlikeli'].includes(s.hukum);
  const yak = sonuc.filter((s) => s.alarm && kotu(s)).map((s) => s.kimlik);
  const bos = sonuc.filter((s) => s.alarm && s.hukum === 'doğru').map((s) => s.kimlik);
  const kis = sonuc.filter((s) => s.alarm && s.hukum === 'kısmen').map((s) => s.kimlik);
  console.log(`kalıp ${KALIP}: ${sonuc.length} geçen cevap · kötü yakalanan ${yak.length}/${sonuc.filter(kotu).length} (${yak.join(' ')}) · doğruya boş alarm ${bos.length}/${sonuc.filter((s) => s.hukum === 'doğru').length} (${bos.join(' ')}) · kısmen ${kis.length} (${kis.join(' ')})`);
  const kacan = sonuc.filter((s) => kotu(s) && !s.alarm).map((s) => `${s.kimlik}:${s.karar}`);
  console.log(`  kaçan kötüler: ${kacan.join(' ')}`);
})();
