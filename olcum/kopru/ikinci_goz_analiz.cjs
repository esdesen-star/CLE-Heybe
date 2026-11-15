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
  // 14.11 (§128, konu dışı): t — cevabın metni değil, dayandığı makale başlıkları (kompartman sendromu, çadırdaki ayı,
  // yangın kapısı başlık düzeyinde göze batıyor) · d — önce sorudaki büyük olasılıklı sorunu, sonra cevabın neyi ele
  // aldığını adlandır, sonra karar (c'nin tanı biçimi)
  t: (q, a, b) => `A person asked an offline first-aid helper this QUESTION. The answer was written from the encyclopedia ARTICLES listed below (title — section).

QUESTION: ${q}

ARTICLES:
${b}

Is the first article about the person's actual problem? Answer NO if it is about a different condition, object or situation that only shares a word with the question or only looks similar (for example a different illness with similar signs). Reply with exactly one word: YES or NO.`,
  d: (q, a) => `You check answers of an offline first-aid helper.

QUESTION: ${q}

ANSWER: ${a}

Write exactly three short lines:
PROBLEM: the most likely medical problem or danger in the question, in a few words (think like a paramedic: what must not be missed?).
ANSWER TREATS: the problem the answer's advice is written for, in a few words.
VERDICT: SAME if they are the same problem, DIFFERENT if the answer treats a different or only similar-looking problem.`,
};
const NPRED = { a: 4, b: 4, c: 120, e: 4, t: 4, d: 80 };
async function sor(istem) {
  if (onb[istem] !== undefined) return onb[istem];
  const metin = `<start_of_turn>user\n${istem}<end_of_turn>\n<start_of_turn>model\n`;
  const y = await (await fetch(`${SOHBET}/completion`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: metin, n_predict: NPRED[KALIP], temperature: 0, cache_prompt: true, stop: ['<end_of_turn>'] }) })).json();
  onb[istem] = String(y.content || '').trim();
  fs.writeFileSync(ONB, JSON.stringify(onb));
  return onb[istem];
}
const hayir = (c) => (KALIP === 'b' ? /^\W*different/i.test(c) : KALIP === 'c' ? /VERDICT\W*NO\b/i.test(c)
  : KALIP === 'd' ? /VERDICT\W*DIFFERENT/i.test(c) : /^\W*no\b/i.test(c));
// t için: cevabın atıf yaptığı makaleler, en çok atıf alan önce ("başlık — bölüm")
function basliklar(r) {
  const oz = r.ozgun && r.ozgun.cevap ? r.ozgun.cevap : r.cevap;
  const say = new Map();
  for (const g of String(oz).match(/\[([\d,\s]+)\]/g) || []) for (const n of g.match(/\d+/g)) {
    const p = (r.parcalar || [])[+n - 1];
    if (!p) continue;
    const k = `${p.makale}${p.bolum ? ' — ' + p.bolum : ''}`;
    say.set(k, (say.get(k) || 0) + 1);
  }
  const l = [...say.entries()].sort((x, y) => y[1] - x[1]).map(([k]) => '- ' + k);
  return (l.length ? l : (r.parcalar || []).slice(0, 3).map((p) => `- ${p.makale}${p.bolum ? ' — ' + p.bolum : ''}`)).slice(0, 4).join('\n');
}

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
      const c = await sor(KALIPLAR[KALIP](r.soru, cevap, basliklar(r)));
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
