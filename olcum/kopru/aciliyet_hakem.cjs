// Aciliyet hakemi denemesi (14.11.2026, Özet §133): acil belirti kartının kelime kalıpları her yeni sette yeni bir kuyruk
// verdi (T'de 7/13, V'de 9/15 ve 4 boş alarm). Değişmez arayışı: sohbet modeline yalnız SORUYU gösterip "bu kişi şu anda
// acil yardım mı istiyor?" diye sormak. Etiketli setlerde (T, V: yazarın "acil" alanı) kalıp, hakem ve ikisinin birleşimi
// karşılaştırılır; eski bankada (etiketsiz) yalnız kaç kez kart çıkacağı sayılır.
// Kullanım: SOHBET=http://127.0.0.1:18080 node olcum/kopru/aciliyet_hakem.cjs [KALIP=a|b]
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
const B = require('../banka/banka.cjs');
const SOHBET = process.env.SOHBET || 'http://127.0.0.1:18080';
const KALIP = process.env.KALIP || 'a';
const KALIPLAR = {
  a: (q) => `You are triaging a message sent to an offline first-aid helper. Does the person described need emergency medical help RIGHT NOW (call the emergency number or go to the emergency department immediately)?
Answer NO if the message only asks for information or preparation, describes something in the past that is over, is hypothetical ("if ..."), uses a figure of speech, or describes a minor or expected problem.
Reply with exactly one word: YES or NO.

MESSAGE: ${q}`,
  b: (q) => `MESSAGE: ${q}

A first-aid helper must decide one thing about this message: is someone in danger right now, so that the emergency number must be called immediately? Information questions, past events that are over, "what if" questions and minor problems are not emergencies.
Reply with exactly one word: EMERGENCY or NOT.`,
  // c (§135): ayrıntılı ama acil olmayan sağlık anlatımında (gebelik ödemi, bebeğin süt getirmesi, isilik) a "evet" diyordu
  c: (q) => `You are triaging a message sent to an offline first-aid helper. Most health questions are NOT emergencies. Answer YES only if someone's life or a limb may be in danger RIGHT NOW, so the emergency number must be called or the person taken to the emergency department immediately (for example trouble breathing, unconsciousness or confusion, chest pain, stroke signs, heavy bleeding, severe allergic reaction, poisoning with symptoms, signs of shock).
Answer NO for worries that can be checked by a doctor later, for normal or expected changes, for information or preparation questions, for past events that are over, for hypothetical ("if ...") questions and for figures of speech.
Reply with exactly one word: YES or NO.

MESSAGE: ${q}`,
  // d (§200, 18.11): beş temsilî sette hakem 406 acil olmayan sorunun 70'inde kart açtı (küçük yanık, burkulma, genel bilgi).
  // Kızılay/IFRC "acil yardımı hemen çağır" ölçütleri tek tek sayılır; afette o anki tehlike (yangın dumanı, enkaz, sel, gaz/CO)
  // de sayılır; küçük sorunlar örneklenir.
  d: (q) => `You are triaging a message sent to an offline first-aid helper. Most messages are NOT emergencies.
Answer YES only if the message says that RIGHT NOW a person has one of these: not breathing or not breathing normally; unconscious, collapsed, or very hard to wake or confused; chest pain; signs of a stroke; heavy bleeding that does not stop; a seizure; a severe allergic reaction; signs of poisoning or overdose; a suspected neck or spine injury (neck pain with numbness or weakness after a fall or crash); a large or deep burn, or a burn on a small child; a venomous snake bite or a sting with fast swelling; heat stroke, severe hypothermia or drowning; or the person is trapped or in immediate danger from fire, smoke, rising flood water, a collapsed building, gas or carbon monoxide.
Answer NO for questions that ask for information, advice or preparation, for "what should I do if ..." questions, for past events that are over, and for minor or common problems such as a small burn or scald, a sprain, a small cut, a nosebleed, a mild fever, a minor bite, a tooth problem, or a rash.
Reply with exactly one word: YES or NO.

MESSAGE: ${q}`,
};
// URUN=1: ürünün kendi hakemi (arkadas.js acilHakem — kural tek yerde); yoksa buradaki istem kalıpları (KALIP=a|b)
H.AYAR.sohbet = SOHBET;
async function hakem(soru) {
  if (process.env.URUN === '1') return H.acilHakem(soru);
  const r = await fetch(`${SOHBET}/completion`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: `<start_of_turn>user\n${KALIPLAR[KALIP](soru)}<end_of_turn>\n<start_of_turn>model\n`, n_predict: 4, temperature: 0, cache_prompt: true, stop: ['<end_of_turn>'] }) });
  const t = String((await r.json()).content || '').trim();
  return KALIP === 'b' ? /^\W*emergency/i.test(t) : /^\W*yes/i.test(t);
}
(async () => {
  for (const [ad, dosya] of (process.env.SETLER || 'T:yeni_1411d.json,V:yeni_1411e.json').split(',').map((x) => x.split(':'))) {
    const ham = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'banka', dosya), 'utf8'));
    const say = { kalip: [0, 0], hakem: [0, 0], veya: [0, 0], ve: [0, 0] };   // [acilde kart, acil olmayanda kart]
    const satir = [];
    for (const q of ham) {
      const k = H.acilBelirti(q.soru, q.dil).length > 0, h = await hakem(q.soru);
      for (const [a, v] of [['kalip', k], ['hakem', h], ['veya', k || h], ['ve', k && h]]) if (v) say[a][q.acil ? 0 : 1]++;
      satir.push(`${q.no} acil=${q.acil ? 1 : 0} kalıp=${k ? 1 : 0} hakem=${h ? 1 : 0}`);
    }
    const acil = ham.filter((q) => q.acil).length, degil = ham.length - acil;
    console.log(satir.join('\n'));
    for (const a of Object.keys(say)) console.log(`${ad} ${a.padEnd(6)} acil ${say[a][0]}/${acil} · boş alarm ${say[a][1]}/${degil}`);
  }
  if (process.env.ESKI === '1') {
    let n = 0, h = 0, k = 0;
    for (const q of B.sorular().filter((x) => !['T', 'V'].includes(x.set) && (x.dil === 'tr' || x.dil === 'en'))) {
      n++; const hh = await hakem(q.soru), kk = H.acilBelirti(q.soru, q.dil).length > 0; if (hh) h++; if (kk) k++;
      // vekil etiket: beklenen cevapta acil yönlendirme var mı (görülmüş bankada yazarın "acil" alanı yok)
      const vekil = /112|911|acil (servis|yardım|numara|sağlık)|acile|emergency|EMS|ambulans|hemen (hastane|doktor)|immediately/i.test(q.beklenen);
      console.log(`ESKI ${q.kimlik} vekil=${vekil ? 1 : 0} kalıp=${kk ? 1 : 0} hakem=${hh ? 1 : 0}`);
    }
    console.log(`eski banka ${n} soru: kalıp ${k} · hakem ${h}`);
  }
})();
