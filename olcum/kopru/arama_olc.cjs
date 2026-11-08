// Arama ölçümü (07.11 öğleden sonra, Özet §47): cevap yazılmadan yalnız kaynak bulma koşulur, aday havuzunun ilk 40'ı
// (başlık, bölüm, metin, puan, anlam vektörü) önbelleğe yazılır; sıralama biçimleri sonra modelsiz yeniden puanlanır.
// İki deneme: kendi dili (ilk deneme) ve köprü (bütün diller, ikinci deneme) — ürün ikinciyi ilki "bilgi yok" derse yapar.
// Kullanım: SET=X,Z [DENEME=kendi] node olcum/kopru/arama_olc.cjs  (sunucular + çevirmen) → olcum/sonuc/arama_havuz.json (büyük, git dışı)
const fs = require('fs');
const path = require('path');
const B = require('../banka/banka.cjs');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
H.AYAR.sohbet = process.env.SOHBET || 'http://127.0.0.1:18080';
H.AYAR.gomme = process.env.GOMME || 'http://127.0.0.1:18081';
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
const CIKTI = process.env.CIKTI || path.join(__dirname, '..', 'sonuc', 'arama_havuz.json');
const havuz = fs.existsSync(CIKTI) ? JSON.parse(fs.readFileSync(CIKTI, 'utf8')) : {};
const SEC = (process.env.SET || 'X').split(',').filter(Boolean);
const secili = B.sorular().filter((q) => SEC.includes(q.set) || SEC.includes(q.kimlik));
let son = null;
H.AYAR.aramaGozlem = (g) => { son = g; };
(async () => {
  for (const q of secili) {
    for (const deneme of (process.env.DENEME || 'kendi,kopru').split(',')) {
      const anahtar = `${q.kimlik}|${deneme}`;
      if (havuz[anahtar] && !process.env.YENIDEN) continue;
      son = null;
      const secenek = { yalnizKaynak: true };
      if (deneme === 'kopru') secenek.kaynakDilleri = await H.mevcutDiller(q.dil);
      if (deneme === 'kopru' && !secenek.kaynakDilleri.length) continue;
      let r;
      try { r = await H.sor(q.soru, () => {}, q.dil, secenek); } catch (e) { console.log(`${anahtar} HATA ${e.message}`); continue; }
      if (!son) { havuz[anahtar] = { soru: q.soru, dil: q.dil, sorguMetni: q.soru, basliklar: r.basliklar, aday: [] }; continue; }
      // vektörleri yeniden almak için: gözlemde vektör yok, puanlı liste var → ilk 40'ın metni yeniden gömülür (önbellekli)
      const ilk = son.puanli.slice(0, 40);
      havuz[anahtar] = { soru: q.soru, dil: q.dil, sorguMetni: son.sorguMetni, basliklar: r.basliklar,
        gruplar: (r.gruplar || []).map((g) => ({ dil: g.dil, soru: g.soru })),
        aday: ilk.map(([puan, p]) => ({ puan: Math.round(puan * 1e4) / 1e4, makale: p.ad, bolum: p.bolum, dil: p.dil || q.dil, kitap: p.kitap, metin: p.metin.slice(0, 900) })) };
      fs.writeFileSync(CIKTI, JSON.stringify(havuz));
      console.log(`${anahtar.padEnd(10)} ${String(son.puanli.length).padStart(4)} aday · ilk: ${ilk.slice(0, 3).map(([s, p]) => `${p.ad}${p.bolum ? ' — ' + p.bolum : ''} (${s.toFixed(2)})`).join(' | ').slice(0, 200)}`);
    }
  }
})();
