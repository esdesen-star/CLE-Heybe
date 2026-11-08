// Dil köprüsü ölçümü (06.11.2026 — K17, Özet §29). Türkçe soru, dört yol:
//   tr          : yalnız Türkçe Vikipedi (bugünkü Heybe)
//   en          : yalnız İngilizce MDWiki; soru İngilizceye çevrilip aranır, sıralama özgün Türkçe soruyla
//   en_ceviri   : aynı, ama sıralama çevrilmiş İngilizce soruyla
//   tr_en       : iki kitap birlikte
//   en_tg, tr_en_tg : aynıları, soru TranslateGemma ile çevrilir
//   en_v1, kopru_v1 : köprü v1 — cevap İngilizce yazılıp TranslateGemma ile çevrilir; kopru_v1 önce Türkçe dener
// Kullanım: node olcum/kopru/olc_kopru.cjs [yollar, virgülle] [soru dosyası]
//   → olcum/sonuc/olcum_kopru_<yol>.jsonl
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
H.AYAR.sohbet = process.env.SOHBET || 'http://127.0.0.1:18080';
H.AYAR.gomme = process.env.GOMME || 'http://127.0.0.1:18081';
const kok = path.join(__dirname, '..');
const YOLLAR = {
  tr: {},
  en: { kaynakDilleri: ['en'] },
  en_ceviri: { kaynakDilleri: ['en'], sorgu: 'ceviri' },
  tr_en: { kaynakDilleri: ['tr', 'en'] },
  en_tg: { kaynakDilleri: ['en'], cevirmen: true },          // soru TranslateGemma ile çevrilir
  tr_en_tg: { kaynakDilleri: ['tr', 'en'], cevirmen: true },
  // köprü v1 (çevirmen yarışının kazananı): soru ve cevap TranslateGemma ile çevrilir, cevap önce İngilizce yazılır
  en_v1: { kaynakDilleri: ['en'], cevirmen: true, cevap: 'cevirerek' },
  kopru_v1: { yedekDiller: ['en'], cevirmen: true, cevap: 'cevirerek' },   // önce Türkçe, bilgi yoksa köprü
};
const secilen = (process.argv[2] || 'tr,en,en_ceviri,tr_en').split(',');
const sorular = JSON.parse(fs.readFileSync(path.join(kok, 'betik', process.argv[3] || 'sorular.json'), 'utf8'));

(async () => {
  for (const ad of secilen) {
    // AD=etiket verilirse dosya adına eklenir (aynı yol başka kitaplıkla: AD=trtop → olcum_kopru_tr_trtop.jsonl)
    const cikti = path.join(kok, 'sonuc', `olcum_kopru_${ad}${process.env.AD ? '_' + process.env.AD : ''}.jsonl`);
    fs.writeFileSync(cikti, '');
    console.log(`=== ${ad}`);
    for (const s of sorular) {
      H.AYAR.cevirmen = YOLLAR[ad].cevirmen ? (process.env.CEVIRMEN || 'http://127.0.0.1:18082') : '';
      const r = await H.sor(s.soru, () => {}, 'tr', YOLLAR[ad]);
      const kayit = { ...s, yol: ad, model: 'gemma3-4b (llamafile)', gruplar: r.gruplar || null, basliklar: r.basliklar,
        parcalar: r.parcalar, kaynakli: r.cevap, ozgun: r.ozgun || null, ilkDeneme: r.ilkDeneme || null, eksik: r.eksik, durdur: r.durdur, bilgiYok: r.bilgiYok,
        arama_sn: r.arama_sn, toplam_sn: r.toplam_sn };
      fs.appendFileSync(cikti, JSON.stringify(kayit) + '\n');
      const ceviri = r.gruplar ? (r.gruplar.find((g) => g.dil === 'en') || {}).soru || '' : '';
      const ingilizce = r.parcalar.filter((p) => p.dil === 'en').length;
      console.log(`${String(s.no).padStart(2)} ${s.soru.slice(0, 40).padEnd(40)} | EN ${ingilizce}/${r.parcalar.length} | ` +
        `${r.toplam_sn}s${r.durdur ? ' DURDUR ' + r.eksik.join(',') : ''}${r.bilgiYok ? ' BİLGİ YOK' : ''}${ceviri ? ' | ' + ceviri.slice(0, 60) : ''}`);
    }
  }
})();
