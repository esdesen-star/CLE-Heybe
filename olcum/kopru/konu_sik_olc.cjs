// Sorunun konusu — şıktan sonraki cevap (15.11.2026 akşam, Özet §152). konu_cevap_olc.cjs'in kaydında köprü soruları
// çoğunlukla şıkla bitti (A setinde konulu üründe 50 sorunun 22'si); ikinci göz ancak şık seçildikten sonra yazılan cevaba
// bakar (§150 canlı deneme: "kemik kaynar"). Burada kör hakemin "kastedilen anlama ait" dediği şık seçilmiş sayılır
// (insan doğru şıkkı seçti — §142'de 15'te 12; burada hep doğru seçen kullanıcı, üst sınır) ve sayfanın yolu izlenir:
// sor(soru, { cevap: 'cevirerek', secilen: { kitap, ad, dil }, konu, kaynakDilleri: r.diller }). Şık listesi aynı seçenekle
// yeniden üretilir; etiketler kayıttakiyle tutmazsa kaydedilir. İkinci göz üç biçimde (konu_cevap_olc.cjs ile aynı):
//   G0 ürün · G1 konu önekli Türkçe soru · G2 kaynağın dilindeki soru + özgün cevap (yalnız köprüde).
// İkinci geçiş: ilk ölçüde kendi dilinde yazılan ve öbür bekçilerden geçen cevaplara G1 sorulur (konu orada hiç kullanılmıyor).
// Kullanım: … node olcum/kopru/konu_sik_olc.cjs A|B   (hakem hükmünde şık öğeleri için dogru_sik: 1'den başlayan sıra)
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
H.AYAR.sohbet = process.env.SOHBET || 'http://127.0.0.1:18080';
H.AYAR.gomme = process.env.GOMME || 'http://127.0.0.1:18081';
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
H.AYAR.benim = '';
H.AYAR.konuBaslik = false; H.AYAR.konuSorgu = false;
const ad = process.argv[2];
const S = path.join(__dirname, '..');
const BANKA = { A: 'banka/konu_baslik_1511.json', B: 'banka/konu_baslik_B_1511.json' }[ad];
const oku = (y) => JSON.parse(fs.readFileSync(path.join(S, y), 'utf8'));
const sorular = new Map(oku(BANKA).map((q) => [q.no, q]));
const kayitlar = fs.readFileSync(path.join(S, `sonuc/konu_cevap_${ad}_1511.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const girdi = new Map(oku(`sonuc/konu_cevap_hakem_girdi_${ad}_1511.json`).map((g) => [g.id, g]));
const anahtar = oku(`sonuc/konu_cevap_hakem_anahtar_${ad}_1511.json`);
const hukum = new Map(oku(`sonuc/konu_cevap_hakem_hukum_${ad}_1511.json`).map((h) => [h.id, h]));
const cikti = path.join(S, `sonuc/konu_sik_${ad}_1511.jsonl`);
const yapilan = new Set(fs.existsSync(cikti) ? fs.readFileSync(cikti, 'utf8').split('\n').filter(Boolean).map((l) => { const x = JSON.parse(l); return `${x.tip}|${x.no}|${x.kip}`; }) : []);
const IKINCI = 'durum: cevap sorulan duruma ait görünmüyor';
const URUN = { yedekDiller: 'hepsi', cevap: 'cevirerek' };
const gecer = async (soru, cevap) => ((await H.ikinciGoz(soru, cevap)).length ? 'durdu' : 'gecti');

async function gozler(r, konu, soru) {
  if (r.bilgiYok || !r.cevap) return {};
  if (r.denetim) {   // köprü (cevirerek yolu)
    const d = r.denetim;
    const oteki = ['eylem', 'ozgun', 'ceviri', 'terim', 'yazi', 'kip', 'olumsuzluk', 'gidisDonus', 'ortam', 'konu'].flatMap((k) => d[k] || []);
    if (oteki.length) return { otekiBekci: [...new Set(oteki)] };
    const g = (r.gruplar || []).find((x) => x.dil !== 'tr');
    return { goz: { G0: (d.ikinciGoz || []).length ? 'durdu' : 'gecti', G1: await gecer(`${konu}: ${soru}`, r.cevap),
      G2: g && r.ozgun ? await gecer(g.soru, r.ozgun.cevap) : '-' } };
  }
  const oteki = (r.eksik || []).filter((e) => e !== IKINCI);   // kendi dili
  if (oteki.length) return { otekiBekci: oteki };
  return { goz: { G0: (r.eksik || []).includes(IKINCI) ? 'durdu' : 'gecti', G1: await gecer(`${konu}: ${soru}`, r.cevap), G2: '-' } };
}
const yaz = (x) => { fs.appendFileSync(cikti, JSON.stringify(x) + '\n'); process.stderr.write(x.hata ? 'x' : '.'); };

(async () => {
  // 1) doğru şık seçilmiş sayılır
  for (const [id, h] of Object.entries(anahtar)) {
    const g = girdi.get(id), hk = hukum.get(id);
    if (!g || !g.secenekler || !hk || hk.anlam !== 'VAR' || !hk.dogru_sik) continue;
    const q = sorular.get(h.no);
    const istenen = g.secenekler[hk.dogru_sik - 1];
    const asil = kayitlar.find((k) => k.no === h.no);
    for (const kip of h.kipler) {
      if (yapilan.has(`sik|${h.no}|${kip}`)) continue;
      if (kip === 'U0' && asil && (asil.U0 || {}).ayniYol) continue;   // aynı yol: U1'in seçimi onun da seçimi
      const konu = kip === 'U1' ? { konu: q.konu } : {};
      const kayit = { tip: 'sik', no: h.no, kip, id, soru: q.soru, konu: q.konu, secilen_etiket: istenen };
      try {
        const r = await H.sor(q.soru, () => {}, 'tr', { ...URUN, ...konu });
        const s = (r.secenekler || []).find((x) => x.etiket === istenen);
        if (!s) { kayit.hata = 'şık yeniden üretilemedi'; kayit.yeni = (r.secenekler || []).map((x) => x.etiket); yaz(kayit); continue; }
        const diller = r.diller || ['tr'];
        const r2 = await H.sor(q.soru, () => {}, 'tr', { cevap: 'cevirerek', secilen: { kitap: s.kitap, ad: s.ad, dil: s.dil }, ...konu,
          ...(!(diller.length === 1 && diller[0] === 'tr') ? { kaynakDilleri: diller } : {}) });
        Object.assign(kayit, { secilen: { kitap: String(s.kitap).replace(/_20\d\d-\d\d$/, ''), ad: s.ad, dil: s.dil }, kopru: Boolean(r2.denetim),
          yol: r2.bilgiYok ? 'bilgiYok' : r2.durdur ? 'durdu' : 'cevap', cevap: r2.cevap || '', ...(r2.ozgun ? { ozgun: r2.ozgun.cevap } : {}),
          eksik: r2.eksik || [], ...(await gozler(r2, q.konu, q.soru)), sn: r2.toplam_sn });
      } catch (e) { kayit.hata = e.message; }
      yaz(kayit);
    }
  }
  // 2) kendi dilinde yazılmış cevaplara G1 (konu ikinci göze verilseydi)
  for (const k of kayitlar) {
    const q = sorular.get(k.no);
    const r = k.U1 || {};
    if (yapilan.has(`goz1|${k.no}|U1`) || r.kopru || !['cevap', 'durdu'].includes(r.yol) || !r.cevap) continue;
    const oteki = (r.eksik || []).filter((e) => e !== IKINCI);
    if (oteki.length) continue;
    yaz({ tip: 'goz1', no: k.no, kip: 'U1', soru: q.soru, konu: q.konu, goz: { G0: (r.eksik || []).includes(IKINCI) ? 'durdu' : 'gecti',
      G1: await gecer(`${q.konu}: ${q.soru}`, r.cevap), G2: '-' } });
  }
  process.stderr.write('\n');
})().catch((e) => { console.error(e); process.exit(1); });
