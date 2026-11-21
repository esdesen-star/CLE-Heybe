// §212 seçim incelemesi (19.11.2026, Ercan: "Heybe neye göre bunları seçtiğini analiz edelim"): bir sorunun ürün yolunda
// (dil körü açık) hangi bölümlerin hangi puanla sıralandığını, forum kuralı açık ve kapalıyken yazar. Cevap yazılmaz.
// Kullanım: node olcum/kopru/secim_incele.cjs "<soru>" [<soru> …]   → olcum/sonuc/secim_incele_1911.json
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
H.AYAR.sohbet = 'http://127.0.0.1:18080';
H.AYAR.gomme = 'http://127.0.0.1:18081';
H.AYAR.cevirmen = 'http://127.0.0.1:18082';
H.AYAR.benim = '';
H.AYAR.dilKoru = true;
H.AYAR.cokDilli = false;
H.AYAR.dayanak = { ...H.AYAR.dayanak, esik: 0 };
const kisa = (s, n = 220) => String(s || '').replace(/\s+/g, ' ').slice(0, n);
const satir = ([pu, p]) => ({ puan: Math.round(pu * 1000) / 1000, kitap: String(p.kitap).replace(/_20\d\d-\d\d$/, ''), makale: p.ad, tur: H.kaynakTuru(p.kitap), dil: p.dil || 'tr', metin: kisa(p.metin) });
(async () => {
  const cikti = [];
  for (const soru of process.argv.slice(2)) {
    for (const acik of [false, true]) {
      H.AYAR.forumGeri = { ...H.AYAR.forumGeri, acik };
      const gozlem = [];
      H.AYAR.aramaGozlem = (g) => gozlem.push({ diller: g.gruplar ? g.gruplar.map((x) => x.dil) : [g.dil], sorgular: g.gruplar ? g.gruplar.map((x) => x.soru) : [g.sorguMetni], ilk12: g.puanli.slice(0, 12).map(satir) });
      const havuz = await H.sor(soru, () => {}, 'tr', { cevap: 'cevirerek', acilBakildi: true, kaynakDilleri: ['tr', 'en'], yalnizKaynak: true });
      const enIyi = H.enIyiDil(havuz.parcalar, 'tr');
      const son = await H.sor(soru, () => {}, 'tr', { cevap: 'cevirerek', acilBakildi: true, yalnizKaynak: true, ...(enIyi !== 'tr' ? { kaynakDilleri: ['en'] } : {}) });
      const ad = son.parcalar.adaylar || [];
      cikti.push({ soru, forumKurali: acik, havuzEnIyi: (havuz.parcalar[0] || {}).makale, havuzForumDusen: havuz.parcalar.forumDusen || 0, secilenDil: enIyi,
        sonForumDusen: son.parcalar.forumDusen || 0,
        adaylar: ad.map((a) => ({ puan: a.puan, kitap: String(a.kitap).replace(/_20\d\d-\d\d$/, ''), makale: a.ad })),
        sikSorulur: ad.length >= 2 && ad[0].puan - ad[1].puan < H.AYAR.secenek.esik,
        modeleGiden: son.parcalar.map((p) => ({ puan: p.puan, kitap: String(p.kitap).replace(/_20\d\d-\d\d$/, ''), makale: p.makale, metin: kisa(p.metin, 400) })),
        gozlem });
      process.stderr.write('.');
    }
  }
  fs.writeFileSync(path.join(__dirname, '../sonuc/secim_incele_1911.json'), JSON.stringify(cikti, null, 1));
  process.stderr.write('\n');
})().catch((e) => { console.error(e); process.exit(1); });
