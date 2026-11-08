// Çevirmen yarışı (06.11.2026 — K17, Özet §29). Aynı İngilizce paragraflar (olcum_kopru_en.jsonl), üç yol:
//   Y1 dogrudan   : Gemma 3 4B İngilizce kaynağı okur, cevabı doğrudan Türkçe yazar (köprünün ilk hâli)
//   Y2 gemma      : Gemma 3 4B önce İngilizce cevap yazar, sonra aynı model Türkçeye çevirir
//   Y3 translate  : Gemma 3 4B önce İngilizce cevap yazar, TranslateGemma 4B Türkçeye çevirir
// Her Türkçe cevap İngilizce kaynağa karşı iki dilli sayı denetçisinden geçer.
// Kullanım: node olcum/kopru/cevirmen_yarisi.cjs  → olcum/sonuc/olcum_kopru_yaris.jsonl
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
const SOHBET = process.env.SOHBET || 'http://127.0.0.1:18080';
const CEVIRMEN = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
const kok = path.join(__dirname, '..');

async function tamamla(adres, istem, uzunluk = 450) {
  const y = await fetch(`${adres}/completion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: istem, n_predict: uzunluk, temperature: 0, seed: 1, stop: ['<end_of_turn>'] }),
  });
  if (!y.ok) throw new Error(`${y.status} ${adres}`);
  return (await y.json()).content.trim();
}

// arkadas.js'deki gemmaIstemi ile aynı kalıp (Ollama'nın gemma3 kalıbı)
const gemma = (sistem, mesaj) =>
  `<start_of_turn>user\n${sistem}<end_of_turn>\n<start_of_turn>user\n${mesaj}<end_of_turn>\n<start_of_turn>model\n`;

const GEMMA_CEVIR = `Translate the following text from English into Turkish.
Keep every number, unit and source mark like [1] exactly as it is. Keep "do not" / "never" meanings exactly.
Write only the Turkish translation, nothing else.`;

// TranslateGemma'nın kalıbı arkadas.js'den gelir (kural tek yerde: H.translateGemmaIstemi)
const translateGemma = (metin) => H.translateGemmaIstemi(metin, 'en', 'tr');

(async () => {
  const kayitlar = fs.readFileSync(path.join(kok, 'sonuc', 'olcum_kopru_en.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const cikti = path.join(kok, 'sonuc', 'olcum_kopru_yaris.jsonl');
  fs.writeFileSync(cikti, '');
  const D = H.DIL.en;
  for (const k of kayitlar) {
    const satir = { no: k.no, soru: k.soru, beklenen: k.beklenen, parcalar: k.parcalar, y1: k.kaynakli };
    if (!k.parcalar.length) { fs.appendFileSync(cikti, JSON.stringify({ ...satir, bos: true }) + '\n'); console.log(k.no, 'kaynak yok'); continue; }
    const ingilizceSoru = (k.gruplar || []).find((g) => g.dil === 'en')?.soru || k.soru;
    const t0 = Date.now();
    satir.ingilizce = await tamamla(SOHBET, gemma(D.sistem, `${D.kaynaklar}:\n${H.kaynakMetni(k.parcalar, 'en')}\n\n${D.soru}: ${ingilizceSoru}`));
    satir.ingilizce_sn = (Date.now() - t0) / 1000;
    let t = Date.now();
    satir.y2 = await tamamla(SOHBET, gemma(GEMMA_CEVIR, satir.ingilizce));
    satir.y2_sn = (Date.now() - t) / 1000;
    t = Date.now();
    satir.y3 = await tamamla(CEVIRMEN, translateGemma(satir.ingilizce));
    satir.y3_sn = (Date.now() - t) / 1000;
    for (const y of ['y1', 'y2', 'y3']) satir[y + '_eksik'] = H.denetle(k.parcalar, satir[y], 'tr');
    satir.en_eksik = H.denetle(k.parcalar.map(({ dil, ...p }) => p), satir.ingilizce, 'en');
    fs.appendFileSync(cikti, JSON.stringify(satir) + '\n');
    console.log(`${String(k.no).padStart(2)} en ${satir.ingilizce_sn}s · y2 ${satir.y2_sn}s · y3 ${satir.y3_sn}s · eksik y1 ${satir.y1_eksik} y2 ${satir.y2_eksik} y3 ${satir.y3_eksik} en ${satir.en_eksik}`);
  }
})();
