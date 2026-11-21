// §199 DÜZELTME (18.11): adaylar ve "modele giden 6" dil körü ilk aşamasınındır (cevabın dilini seçen havuz), modelinki değil.
// Aday ölçüsü (17.11.2026, Özet §194): doğru bölüm modele giden 6'ya girmiyorsa nerede kayboluyor — aramada mı (aday
// listesinde hiç yok) yoksa sıralamada mı (aday ama geride)? Ürünün dil körü havuzu (havuz_olc.cjs'in yolu, deneyler
// kapalı); kaynakBul'un sıraladığı BÜTÜN adaylar AYAR.aramaGozlem kancasıyla kaydedilir. Eşleştirme aday_say.py'de.
// Kullanım: SET=temsili4 ONEK=temsili4_dk node olcum/kopru/aday_olc.cjs → olcum/sonuc/<SET>_aday_1611.jsonl
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
H.AYAR.sohbet = process.env.SOHBET || 'http://127.0.0.1:18080';
H.AYAR.gomme = process.env.GOMME || 'http://127.0.0.1:18081';
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
H.AYAR.benim = '';
const S = path.join(__dirname, '..');
const SETAD = process.env.SET || 'temsili', ONEK = process.env.ONEK || SETAD;
const satirlar = (y) => (fs.existsSync(y) ? fs.readFileSync(y, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const SET = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(S, `banka/${SETAD}_1611.json`), 'utf8')).map((q) => [q.no, q]));
const NOLAR = satirlar(path.join(S, `sonuc/${ONEK}_1611.jsonl`)).filter((x) => x.yol !== 'acil').map((x) => x.no);
// §196: DENEY=<AYAR anahtarı> → o deney açık, çıktı <SET>_aday_<deney>_1611
const DENEY = process.env.DENEY || '';
if (DENEY) H.AYAR[DENEY] = { ...H.AYAR[DENEY], acik: true };
const CIKTI = path.join(S, `sonuc/${SETAD}_aday${DENEY ? '_' + DENEY.toLowerCase() : ''}_1611.jsonl`);
const yapilan = new Set(satirlar(CIKTI).map((x) => x.no));
const kitapAdi = (k) => String(k || '').replace(/_20\d\d-\d\d$/, '');
(async () => {
  for (const no of NOLAR) {
    if (yapilan.has(no)) continue;
    const gozlem = [];
    H.AYAR.aramaGozlem = (x) => gozlem.push(x.puanli.map(([puan, p], i) => ({ sira: i + 1, kitap: kitapAdi(p.kitap), makale: p.ad, dil: p.dil || x.dil, puan: Math.round(puan * 1000) / 1000 })));
    const kayit = { no };
    try {
      const r = await H.sor(SET[no].soru, () => {}, 'tr', { kaynakDilleri: ['tr', 'en'], yalnizKaynak: true, acilBakildi: true });
      kayit.secilen = (r.parcalar || []).map((p) => ({ kitap: kitapAdi(p.kitap), makale: p.makale }));
      kayit.adaylar = gozlem;
    } catch (e) { kayit.hata = e.message; }
    H.AYAR.aramaGozlem = null;
    fs.appendFileSync(CIKTI, JSON.stringify(kayit) + '\n');
    process.stderr.write(kayit.hata ? 'x' : '.');
  }
  process.stderr.write('\n');
})().catch((e) => { console.error(e); process.exit(1); });
