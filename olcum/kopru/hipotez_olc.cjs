// Hipotez doğrulama ölçüsü (14.11.2026, Özet §137–§138 — Ercan: "insan bir fikir edinir ve beyan etmeden önce bu fikri
// doğru mu sorularla teyit eder"; "doktor aklındaki olasılıkları sorularla eler"). Çevrimdışı, kayıtlı notlu cevaplarla:
//   hipotez  — cevabın en çok atıf yaptığı bölüm (Heybe'nin "fikri")
//   sorular  — sohbet modeli o bölümün metninden, kullanıcının durumunun bu bölüm olup olmadığını gösterecek en çok 3
//              kısa evet/hayır sorusu yazar (kullanıcının açıkça söylediğini sormadan)
//   kullanıcı — taklit: sohbet modeli kullanıcının KENDİ sözleriyle (soru; A setinde yazarın "durum"u da) her soruya
//              EVET / HAYIR / BİLMİYORUM der — beklenen cevap gösterilmez (kullanıcı teşhisi bilmez, yaşadığını bilir)
// Ölçü: kötü cevaplarda (yanlış/tehlikeli) hipotez düşüyor mu, iyilerde (doğru/kısmen) ayakta kalıyor mu.
// Kullanım: SOHBET=http://127.0.0.1:18080 node olcum/kopru/hipotez_olc.cjs <ornekler.json> <cikti.jsonl>
const fs = require('fs');
const SOHBET = process.env.SOHBET || 'http://127.0.0.1:18080';
const [girdi, cikti] = process.argv.slice(2);
const ornekler = JSON.parse(fs.readFileSync(girdi, 'utf8'));
const yapilan = new Set(fs.existsSync(cikti) ? fs.readFileSync(cikti, 'utf8').split('\n').filter(Boolean).map((l) => { const o = JSON.parse(l); return o.kimlik + '|' + o.iz; }) : []);

async function model(istem, n = 160) {
  const r = await fetch(`${SOHBET}/completion`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: `<start_of_turn>user\n${istem}<end_of_turn>\n<start_of_turn>model\n`, n_predict: n, temperature: 0, cache_prompt: true, stop: ['<end_of_turn>'] }) });
  return String((await r.json()).content || '').trim();
}
// 14.11: üretici kullanıcının sorusunu GÖRMEZ — görünce onu onaylayan sorular yazıyordu ("susuzluğu enkaz kaldırmak mı
// tetikledi?" → evet). Sorular yalnız bölümün anlattığı durumdan (nedeni, kime olduğu, ayırt edici belirtisi) doğar.
const SORU_URET = (o) => `This is a section from a first-aid or reference book.
TITLE: ${o.makale}
TEXT: ${o.metin}
Write at most 3 short yes/no questions (each under 12 words) that a person could answer about their own situation, to check whether their situation is the one this section describes: its cause (what happened before it started), who it happens to, and its defining signs. Do not ask about treatment or medicines. Base each question on something this section says. Write the questions in ${o.dil === 'en' ? 'English' : 'Turkish'}. One question per line, nothing else.`;
// KIP=ozet (14.11): soru yerine bölümün DURUM özeti — "bu bölüm şu durumdaki biri için: …" — ve kullanıcıya tek soru
const DURUM_OZET = (o) => `This is a section from a first-aid or reference book.
TITLE: ${o.makale}
TEXT: ${o.metin}
In one short sentence (under 20 words), describe the situation of the person this section's information is meant for: what happened to them or what they notice. Do not give advice. Write it in ${o.dil === 'en' ? 'English' : 'Turkish'}, starting with "${o.dil === 'en' ? 'Someone who' : 'Şu durumdaki biri:'}".`;
// KIP=tanim (14.11): özet yerine bölümün KENDİ tanım cümlesi alıntılanır (özet genelleşiyordu: "su dengesi bozulmuş biri"
// hem az hem çok su içene uyuyor); kullanıcıya o cümle gösterilir
const TANIM = (o) => `This is a section from a first-aid or reference book.
TITLE: ${o.makale}
TEXT: ${o.metin}
Copy, word for word, the one sentence from TEXT that best says what this condition or situation IS (its definition or cause). If no sentence does that, copy the first sentence. Output only that sentence.`;
const OZET_KULLANICI = (o, ozet) => `You are this person. Your situation, in your own words: «${o.soru}${o.durum ? ' ' + o.durum : ''}»
A helper asks: does this describe your situation? «${ozet}»
Answer with exactly one word: YES, NO or PARTLY.`;
const KULLANICI = (o, sorular) => `You are this person. Your situation, in your own words: «${o.soru}${o.durum ? ' ' + o.durum : ''}»
Answer each question about YOUR situation with exactly one word: YES, NO or UNKNOWN — one answer per line, in the same order. If your situation does not say or clearly imply the answer, write UNKNOWN.
${sorular.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

(async () => {
  for (const o of ornekler) {
    if (yapilan.has(o.kimlik + '|' + o.iz)) continue;
    if (process.env.KIP === 'ozet' || process.env.KIP === 'tanim') {
      const ozet = process.env.KIP === 'tanim' ? `${o.makale}: ${(await model(TANIM(o), 80)).split(/\r?\n/)[0]}` : (await model(DURUM_OZET(o), 60)).split(/\r?\n/)[0];
      const c = await model(OZET_KULLANICI(o, ozet), 6);
      const cevap = /\byes\b/i.test(c) ? 'E' : /\bno\b/i.test(c) ? 'H' : 'B';
      fs.appendFileSync(cikti, JSON.stringify({ kimlik: o.kimlik, iz: o.iz, hukum: o.hukum, makale: o.makale, soru: o.soru, sorular: [ozet], cevaplar: [cevap] }) + '\n');
      process.stderr.write('.');
      continue;
    }
    const ham = await model(SORU_URET(o));
    const sorular = ham.split(/\r?\n/).map((x) => x.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim()).filter((x) => x.length > 3 && /\?\s*$/.test(x)).slice(0, 3);
    let cevaplar = [];
    if (sorular.length) {
      const c = await model(KULLANICI(o, sorular), 30);
      cevaplar = c.split(/\r?\n/).map((x) => (/\byes\b/i.test(x) ? 'E' : /\bno\b/i.test(x) ? 'H' : 'B')).slice(0, sorular.length);
    }
    fs.appendFileSync(cikti, JSON.stringify({ kimlik: o.kimlik, iz: o.iz, hukum: o.hukum, makale: o.makale, soru: o.soru, sorular, cevaplar }) + '\n');
    process.stderr.write('.');
  }
  process.stderr.write('\n');
  // özet
  const s = fs.readFileSync(cikti, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const kotu = (x) => x.hukum === 'yanlış' || x.hukum === 'tehlikeli';
  for (const [ad, karar] of [['herhangi bir HAYIR', (x) => x.cevaplar.includes('H')], ['HAYIR > EVET', (x) => x.cevaplar.filter((c) => c === 'H').length > x.cevaplar.filter((c) => c === 'E').length],
    ['hiç EVET yok', (x) => x.sorular.length > 0 && !x.cevaplar.includes('E')]]) {
    const k = s.filter(kotu), i = s.filter((x) => !kotu(x)), t = s.filter((x) => x.hukum === 'tehlikeli');
    console.log(`${ad.padEnd(20)} kötüde düşen ${k.filter(karar).length}/${k.length} (tehlikeli ${t.filter(karar).length}/${t.length}) · iyide düşen ${i.filter(karar).length}/${i.length}`);
  }
  console.log(`soru üretilemeyen: ${s.filter((x) => !x.sorular.length).length}`);
})();
