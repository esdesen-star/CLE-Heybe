// "41 hata Heybe'nin mi?" (16.11.2026, Özet §171; Ercan: "aynı soruyu farklı şekilde sorulan … asıl soruyu soru ile
// doğrulamak lazım"). §170'te hakemin "Heybe'nin seçimi" dediği 41 soru, kodu görmeyen yazarın üç biçimiyle
// (olcum/sonuc/temsili_bicim_1611.json: kisa · uzun · baska_kelime) iki yoldan sorulur:
//   urun  — ürünün yolu (sayfa.html: yedekDiller 'hepsi', cevirerek); özgün soru için temsili_parca_1611.jsonl'deki kayıt
//   korsuz — DENEY, ürün değil: dil körü arama yaklaşığı — Türkçe ve İngilizce kitaplar tek havuzda
//           ({ kaynakDilleri: ['tr','en'], yalnizKaynak: true }); yalnız arama, cevap yazılmaz, acil kartına bakılmaz
// Kayıt: kullanılan bölümlerin adı ve kitabı (ürün: cevabın paragrafları ya da şıklar). İsabet sayımı temsili_bicim_say.py'de.
// Kullanım: KUTUPHANE=… node olcum/kopru/temsili_bicim.cjs → olcum/sonuc/temsili_bicim_sonuc_1611.jsonl
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
const BICIM = JSON.parse(fs.readFileSync(path.join(S, 'sonuc/temsili_bicim_1611.json'), 'utf8'));
// Ercan'ın eki (§171): beşinci biçim "net" — durumu bilinen adıyla, açıkça (olcum/sonuc/temsili_net_1611.json, ayrı yazar)
const NET_Y = path.join(S, 'sonuc/temsili_net_1611.json');
if (fs.existsSync(NET_Y)) { const n = new Map(JSON.parse(fs.readFileSync(NET_Y, 'utf8')).map((x) => [x.no, x.net])); for (const q of BICIM) if (n.get(q.no)) q.net = n.get(q.no); }
const PARCA = new Map(satirlar(path.join(S, 'sonuc/temsili_parca_1611.jsonl')).map((x) => [x.no, x]));
const CIKTI = path.join(S, 'sonuc/temsili_bicim_sonuc_1611.jsonl');
const yapilan = new Set(satirlar(CIKTI).map((x) => `${x.no}|${x.bicim}|${x.yolu}`));
const kitapAdi = (k) => String(k || '').replace(/_20\d\d-\d\d$/, '');
const bolumler = (parcalar) => {
  const g = [], gor = new Set();
  for (const p of parcalar || []) {
    const k = `${kitapAdi(p.kitap)}|${p.makale}`;
    if (gor.has(k)) continue;
    gor.add(k);
    g.push({ kitap: kitapAdi(p.kitap), makale: p.makale });
    if (g.length === 6) break;
  }
  return g;
};
const yolu = (r) => (r.acil ? 'acil' : r.secenekler ? 'sik' : r.bilgiYok ? 'bilgiYok' : r.durdur ? 'durdu' : 'cevap');
const urunOzet = (r) => ({ yol: yolu(r), bolumler: r.secenekler ? r.secenekler.map((s) => ({ kitap: kitapAdi(s.kitap), makale: s.ad })) : bolumler(r.parcalar) });
const yaz = (x) => { fs.appendFileSync(CIKTI, JSON.stringify(x) + '\n'); process.stderr.write(x.hata ? 'x' : '.'); };

(async () => {
  for (const q of BICIM) {
    for (const bicim of ['soru', 'kisa', 'uzun', 'baska_kelime', 'net'].filter((x) => q[x])) {
      const metin = q[bicim];
      if (!yapilan.has(`${q.no}|${bicim}|urun`)) {
        const kayit = { no: q.no, bicim, yolu: 'urun', metin };
        try {
          if (bicim === 'soru') {   // özgün soru: deterministik, temsili_parca'daki kayıt (66/66 aynı çıktı)
            const p = PARCA.get(q.no).ilk;
            Object.assign(kayit, { yol: p.yol, bolumler: p.secenekler ? p.secenekler.map((s) => ({ kitap: s.kitap, makale: s.ad })) : bolumler(p.parcalar) });
          } else Object.assign(kayit, urunOzet(await H.sor(metin, () => {}, 'tr', { yedekDiller: 'hepsi', cevap: 'cevirerek' })));
        } catch (e) { kayit.hata = e.message; }
        yaz(kayit);
      }
      if (!yapilan.has(`${q.no}|${bicim}|korsuz`)) {
        const kayit = { no: q.no, bicim, yolu: 'korsuz', metin };
        try {
          const r = await H.sor(metin, () => {}, 'tr', { kaynakDilleri: ['tr', 'en'], yalnizKaynak: true, acilBakildi: true });
          Object.assign(kayit, { yol: 'arama', bolumler: bolumler(r.parcalar), ceviri: ((r.gruplar || []).find((g) => g.dil === 'en') || {}).soru || '' });
        } catch (e) { kayit.hata = e.message; }
        yaz(kayit);
      }
    }
  }
  process.stderr.write('\n');
})().catch((e) => { console.error(e); process.exit(1); });
