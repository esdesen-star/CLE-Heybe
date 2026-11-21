// §207 (19.11.2026) İKİNCİ AŞAMA ölçüsü — §199 dersi: havuz ölçüsü dil körünün ilk aşamasını (dili seçen havuzu) ölçüyordu,
// modele giden bölümleri değil. Bu betik her soru için iki listeyi yan yana kaydeder (yalnız arama, cevap yazılmaz):
//   kip 'kapali' = bugünkü ürün: havuzun en iyi bölümünün dili seçilir, o dilde (ya da yalnız öbür dillerde) YENİ arama → modele giden 6
//   kip 'acik'   = çok dilli havuz (Ercan'ın yolu): havuzun kendisi → modele gidecek 6 (çeviri bekçisinin düşürdükleri hariç; o ayrı sayılır)
// Her iki kipte şık adayları (ilk 4) da kaydedilir. İsabet havuz_say.py ile (HAVUZ_DOSYA=…, aynı eşleştirme).
// Kullanım: KUTUPHANE=… SET=temsili4 ONEK=temsili4_dk [CIKTI=ad] node olcum/kopru/ikinci_asama_olc.cjs
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
const SETAD = process.env.SET || 'temsili4', ONEK = process.env.ONEK || SETAD;
const SET = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(S, `banka/${SETAD}_1611.json`), 'utf8')).map((q) => [q.no, q]));
// NOLAR: ONEK koşusunda acil kartı açılmayanlar; NOLAR_DOSYA verilirse oradaki "no"lar (ör. etiketli acil soruları)
const NOLAR = process.env.NOLAR_DOSYA
  ? JSON.parse(fs.readFileSync(path.join(S, process.env.NOLAR_DOSYA), 'utf8')).map((x) => x.no)
  : satirlar(path.join(S, `sonuc/${ONEK}_1611.jsonl`)).filter((x) => x.yol !== 'acil').map((x) => x.no);
const CIKTI = path.join(S, `sonuc/${process.env.CIKTI || SETAD + '_ikinci'}_1611.jsonl`);
const yapilan = new Set(satirlar(CIKTI).map((x) => `${x.no}|${x.kip}`));
const kitapAdi = (k) => String(k || '').replace(/_20\d\d-\d\d$/, '');
const liste = (parcalar) => (parcalar || []).map((p) => ({ kitap: kitapAdi(p.kitap), makale: p.makale, dil: p.dil || 'tr', puan: p.puan }));
const aday = (parcalar) => ((parcalar && parcalar.adaylar) || []).slice(0, 4).map((a) => ({ kitap: kitapAdi(a.kitap), makale: a.ad, dil: a.dil || 'tr', puan: a.puan }));
(async () => {
  const diller = ['tr', ...(await H.mevcutDiller('tr'))];
  process.stderr.write(`diller: ${diller.join(',')} · ${NOLAR.length} soru\n`);
  for (const no of NOLAR) {
    if (yapilan.has(`${no}|kapali`) && yapilan.has(`${no}|acik`)) continue;
    const t0 = Date.now();
    let havuz;
    try {
      // bütün diller tek havuz (ürünün dil körü ilk aşaması = deneyin modele vereceği)
      havuz = await H.sor(SET[no].soru, () => {}, 'tr', { kaynakDilleri: diller, yalnizKaynak: true, acilBakildi: true });
      const sn1 = Math.round((Date.now() - t0) / 100) / 10;
      fs.appendFileSync(CIKTI, JSON.stringify({ no, kip: 'acik', bolumler: liste(havuz.parcalar), adaylar: aday(havuz.parcalar), sn: sn1 }) + '\n');
      // ürün: havuzun en iyi bölümünün dili → o dilin (ya da yalnız öbür dillerin) yeni araması
      const enIyi = H.enIyiDil(havuz.parcalar, 'tr');
      const t1 = Date.now();
      const r = enIyi !== 'tr'
        ? await H.sor(SET[no].soru, () => {}, 'tr', { kaynakDilleri: diller.filter((d) => d !== 'tr'), yalnizKaynak: true, acilBakildi: true })
        : await H.sor(SET[no].soru, () => {}, 'tr', { yalnizKaynak: true, acilBakildi: true });
      fs.appendFileSync(CIKTI, JSON.stringify({ no, kip: 'kapali', enIyi, bolumler: liste(r.parcalar), adaylar: aday(r.parcalar), sn: Math.round((Date.now() - t1) / 100) / 10 + sn1 }) + '\n');
      process.stderr.write('.');
    } catch (e) {
      fs.appendFileSync(CIKTI, JSON.stringify({ no, kip: 'hata', hata: e.message }) + '\n');
      process.stderr.write('x');
    }
  }
  process.stderr.write('\n');
})().catch((e) => { console.error(e); process.exit(1); });
