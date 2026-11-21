// Sorgu ölçüsü (18.11.2026, Özet §195): doğru bölüm aramada hiç yoksa Heybe ne aradı? Verilen sorularda ürünün dil körü
// havuzu (aday_olc.cjs'in yolu, deneyler kapalı) koşar; her kütüphane araması (sorgu, kitaplar, dönen maddeler —
// AYAR.sorguGozlem) ve kaynakBul'un gördüğü başlıklar ile gruplar (soru çevirileri — AYAR.aramaGozlem) kaydedilir.
// Kullanım: SET=temsili4 SORULAR=TD007,TD011 node olcum/kopru/sorgu_olc.cjs → olcum/sonuc/<SET>_sorgu_1611.jsonl
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
H.AYAR.sohbet = process.env.SOHBET || 'http://127.0.0.1:18080';
H.AYAR.gomme = process.env.GOMME || 'http://127.0.0.1:18081';
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
H.AYAR.benim = '';
const S = path.join(__dirname, '..');
const SETAD = process.env.SET || 'temsili';
const SET = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(S, `banka/${SETAD}_1611.json`), 'utf8')).map((q) => [q.no, q]));
const CIKTI = path.join(S, `sonuc/${SETAD}_sorgu_1611.jsonl`);
const kitapAdi = (k) => String(k || '').replace(/_20\d\d-\d\d$/, '');
(async () => {
  for (const no of String(process.env.SORULAR || '').split(',').filter(Boolean)) {
    const sorgular = [], gorulen = [];
    H.AYAR.sorguGozlem = (x) => sorgular.push({ sorgu: x.sorgu, kitaplar: x.kitaplar.map(kitapAdi), adet: x.adet, maddeler: x.yollar.map((y) => y.yol) });
    H.AYAR.aramaGozlem = (x) => gorulen.push({ dil: x.dil, soru: x.soru, basliklar: x.basliklar, gruplar: (x.gruplar || []).map((g) => ({ dil: g.dil, soru: g.soru, basliklar: g.basliklar })) });
    const kayit = { no, soru: SET[no].soru };
    try {
      await H.sor(SET[no].soru, () => {}, 'tr', { kaynakDilleri: ['tr', 'en'], yalnizKaynak: true, acilBakildi: true });
      Object.assign(kayit, { sorgular, gorulen });
    } catch (e) { kayit.hata = e.message; }
    H.AYAR.sorguGozlem = null; H.AYAR.aramaGozlem = null;
    fs.appendFileSync(CIKTI, JSON.stringify(kayit) + '\n');
    process.stderr.write(kayit.hata ? 'x' : '.');
  }
  process.stderr.write('\n');
})().catch((e) => { console.error(e); process.exit(1); });
