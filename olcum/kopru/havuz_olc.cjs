// §199 DÜZELTME (18.11): bu ölçü ürünün DİL KÖRÜ İLK AŞAMASINI ölçer (yalnızKaynak, bütün diller — cevabın dilini seçen havuz).
// Modele giden 6 bölüm ikinci aşamadan (seçilen dilde yeni arama) gelir; aşağıdaki "modele gidecek 6" ifadesi yanlıştır.
// Çeşitli arama deneyinin havuz ölçüsü (16.11.2026, Özet §185; Ercan: "aramada sanki bir boşluk yada öncelik sıralamasında katı
// bir durum var"). TM'nin acil kartı açılmayan 66 sorusu, dil körü havuzu (Türkçe + İngilizce, yalnız arama — ürünün §172 yolunun
// ilk adımı) deney KAPALI ve AÇIK: modele gidecek 6 bölüm kaydedilir. İsabet (kör arama ajanlarının "doğru" dediği bölüm havuzda
// mı) havuz_say.py'de, temsili_bicim_say.py'nin eşleştirmesiyle. Hakemsiz, mekanik.
// Kullanım: KUTUPHANE=… node olcum/kopru/havuz_olc.cjs → olcum/sonuc/havuz_1611.jsonl
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
H.AYAR.sohbet = process.env.SOHBET || 'http://127.0.0.1:18080';
H.AYAR.gomme = process.env.GOMME || 'http://127.0.0.1:18081';
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
H.AYAR.benim = '';
const S = path.join(__dirname, '..');
const satirlar = (y) => (fs.existsSync(y) ? fs.readFileSync(y, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
// §193: SET (soru bankası) ve ONEK (acil kartı açılmayanları veren ilk koşu); varsayılan TM — çıktı TM'de havuz_1611, öbürlerinde <SET>_havuz_1611
const SETAD = process.env.SET || 'temsili', ONEK = process.env.ONEK || SETAD;
const SET = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(S, `banka/${SETAD}_1611.json`), 'utf8')).map((q) => [q.no, q]));
const NOLAR = satirlar(path.join(S, `sonuc/${ONEK}_1611.jsonl`)).filter((x) => x.yol !== 'acil').map((x) => x.no);
// §194: DENEY=anaDal → ana dal ağırlığı kapalı/açık (çıktı <SET>_havuz_anadal_1611); varsayılan çeşitli arama
const DENEY = process.env.DENEY || 'cesitliArama';
const CIKTI = path.join(S, DENEY !== 'cesitliArama' ? `sonuc/${SETAD}_havuz_${DENEY.toLowerCase()}_1611.jsonl` : SETAD === 'temsili' ? 'sonuc/havuz_1611.jsonl' : `sonuc/${SETAD}_havuz_1611.jsonl`);
const yapilan = new Set(satirlar(CIKTI).map((x) => `${x.no}|${x.kip}`));
const kitapAdi = (k) => String(k || '').replace(/_20\d\d-\d\d$/, '');
const ACIK = H.AYAR[DENEY];
(async () => {
  for (const no of NOLAR) {
    for (const kip of ['kapali', 'acik']) {
      if (yapilan.has(`${no}|${kip}`)) continue;
      H.AYAR[DENEY] = { ...ACIK, acik: kip === 'acik' };
      const t0 = Date.now();
      const kayit = { no, kip };
      try {
        const r = await H.sor(SET[no].soru, () => {}, 'tr', { kaynakDilleri: ['tr', 'en'], yalnizKaynak: true, acilBakildi: true });
        kayit.bolumler = (r.parcalar || []).map((p) => ({ kitap: kitapAdi(p.kitap), makale: p.makale, dil: p.dil || 'tr', puan: p.puan }));
        kayit.sn = Math.round((Date.now() - t0) / 100) / 10;
      } catch (e) { kayit.hata = e.message; }
      fs.appendFileSync(CIKTI, JSON.stringify(kayit) + '\n');
      process.stderr.write(kayit.hata ? 'x' : '.');
    }
  }
  H.AYAR[DENEY] = ACIK;
  process.stderr.write('\n');
})().catch((e) => { console.error(e); process.exit(1); });
