// Sorunun konusu — cevap düzeyi ölçüsü (15.11.2026 akşam, Özet §151). §150 aramayı ölçtü (cevap yazılmadan); burada
// ürünün bütün yolu, sayfanın verdiği seçeneklerle (sayfa.html cevapla):
//   U0 — konusuz (0.35.0 davranışı): { yedekDiller: 'hepsi', cevap: 'cevirerek' }
//   U1 — konulu (0.36.0 ürünü): aynısı + { konu }
// Kendi dilindeki ilk deneme konuyu kullanmaz (AYAR.konuBaslik / konuSorgu kapalı): U1 köprüye hiç uğramadıysa U0 aynı
// yoldur ve koşulmaz (ayniYol: true). U1 köprüye uğradıysa U0 baştan koşar (ilk denemenin aynı çıktığı da görülür).
// Köprü cevabı başka bekçiye takılmadıysa ikinci göze üç biçimde sorulur — ürün yalnız G0'ı kullanır, öbürleri deney:
//   G0 — ürün: özgün Türkçe soru + Türkçe cevap
//   G1 — konu önekli Türkçe soru ("Tıbbi: …") + Türkçe cevap
//   G2 — kaynağın dilindeki (konulu çevrilmiş) soru + özgün İngilizce cevap
// Hüküm sonra, kodu ve kipi görmeyen hakemle (cevap metinleri karışık sırayla). Tehlike yalnız geçen cevapta sayılır.
// Kullanım: KUTUPHANE=… SOHBET=… GOMME=… CEVIRMEN=… node olcum/kopru/konu_cevap_olc.cjs set.json cikti.jsonl
const fs = require('fs');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
H.AYAR.sohbet = process.env.SOHBET || 'http://127.0.0.1:18080';
H.AYAR.gomme = process.env.GOMME || 'http://127.0.0.1:18081';
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
H.AYAR.benim = '';
H.AYAR.konuBaslik = false; H.AYAR.konuSorgu = false;   // ürün ayarı (§150 deneyleri kapalı)
const [girdi, cikti] = process.argv.slice(2);
const set = JSON.parse(fs.readFileSync(girdi, 'utf8'));
const yapilan = new Set(fs.existsSync(cikti) ? fs.readFileSync(cikti, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).no) : []);
const ilkUc = (parcalar) => {
  const g = [], gor = new Set();
  for (const p of parcalar || []) {
    const k = `${p.kitap}|${p.makale}`;
    if (gor.has(k)) continue;
    gor.add(k);
    g.push({ makale: p.makale, kitap: String(p.kitap || '').replace(/_20\d\d-\d\d$/, ''), dil: p.dil || '' });
    if (g.length === 3) break;
  }
  return g;
};
const URUN = { yedekDiller: 'hepsi', cevap: 'cevirerek' };
function ozetle(r, konu, soru) {
  const yol = r.acil ? 'acil' : r.secenekler ? 'sik' : r.bilgiYok ? 'bilgiYok' : r.durdur ? 'durdu' : 'cevap';
  const g = (r.gruplar || []).find((x) => x.dil !== 'tr');
  const kopru = Boolean(r.ilkDeneme) || Boolean((r.parcalar || []).length && r.parcalar.every((p) => p.dil && p.dil !== 'tr'));
  return { yol, kopru, ...(r.kopruDenendi ? { kopruDenendi: r.kopruDenendi } : {}), ...(r.ilkDeneme ? { ilkDeneme: r.ilkDeneme } : {}),
    ...(g ? { ceviri: g.soru, ...(g.konu ? { konuKullanildi: !g.konuDustu } : {}), ...(g.konuDustu ? { konuDustu: g.konuDustu } : {}) } : {}),
    ilk: ilkUc(r.parcalar), cevap: r.cevap || '', ...(r.ozgun ? { ozgun: r.ozgun.cevap } : {}), eksik: r.eksik || [],
    ...(r.secenekler ? { secenekler: r.secenekler.map((s) => s.etiket) } : {}), ...(r.acil ? { acil: r.acil.belirti } : {}),
    sn: r.toplam_sn };
}
async function gozler(r, kayit, konu, soru) {
  // köprü cevabı, ikinci gözden başka bekçiye takılmadıysa (ikinci göz yalnız o zaman sorulur — Ö22)
  if (!r.denetim || kayit.yol === 'bilgiYok' || !r.cevap) return;
  const d = r.denetim;
  const oteki = ['eylem', 'ozgun', 'ceviri', 'terim', 'yazi', 'kip', 'olumsuzluk', 'gidisDonus', 'ortam', 'konu'].flatMap((k) => d[k] || []);
  if (oteki.length) { kayit.otekiBekci = [...new Set(oteki)]; return; }
  const g = (r.gruplar || []).find((x) => x.dil !== 'tr');
  kayit.goz = {
    G0: (d.ikinciGoz || []).length ? 'durdu' : 'gecti',
    G1: konu ? ((await H.ikinciGoz(`${konu}: ${soru}`, r.cevap)).length ? 'durdu' : 'gecti') : '-',
    G2: g && r.ozgun ? ((await H.ikinciGoz(g.soru, r.ozgun.cevap)).length ? 'durdu' : 'gecti') : '-',
  };
}
(async () => {
  for (const q of set) {
    if (yapilan.has(q.no)) continue;
    const kayit = { no: q.no, tur: q.tur || (q.anahtar ? 'iki_anlam' : 'kontrol'), soru: q.soru, konu: q.konu, anahtar: q.anahtar || '', cift: q.cift || '' };
    try {
      const r1 = await H.sor(q.soru, () => {}, 'tr', { ...URUN, konu: q.konu });
      kayit.U1 = ozetle(r1, q.konu, q.soru);
      await gozler(r1, kayit.U1, q.konu, q.soru);
      if (!r1.ilkDeneme && !r1.kopruDenendi) kayit.U0 = { ayniYol: true };
      else {
        const r0 = await H.sor(q.soru, () => {}, 'tr', { ...URUN });
        kayit.U0 = ozetle(r0, '', q.soru);
        await gozler(r0, kayit.U0, q.konu, q.soru);
      }
    } catch (e) { kayit.hata = e.message; }
    fs.appendFileSync(cikti, JSON.stringify(kayit) + '\n');
    process.stderr.write(kayit.hata ? 'x' : '.');
  }
  process.stderr.write('\n');
})().catch((e) => { console.error(e); process.exit(1); });
