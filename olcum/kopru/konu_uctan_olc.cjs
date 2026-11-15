// Sorunun konusu — uçtan uca arama ölçüsü (15.11.2026, Özet §150). §149 yalnız çeviriyi ölçtü; burada aynı sorularla
// gerçek kütüphane düzeninde (Türkçe Vikipedi + İngilizce tıp vikisi + Wikivoyage + Outdoors) arama, cevap yazılmadan:
//   K0 — kendi dili, konusuz (bugünkü ilk deneme)
//   K1 — kendi dili, konu başlık önerisine önek (AYAR.konuBaslik deneyi; üründe kapalı)
//   B0 — köprü: İngilizce kitaplar, konusuz çeviri (bugün, ilk deneme "bilgi yok" deyince)
//   B1 — köprü, konulu çeviri (ürün: konuluCevir + karışma kapısı)
//   K2 — kendi dili, konu başlığa ve anlam sıralamasının sorgusuna önek (AYAR.konuBaslik + AYAR.konuSorgu deneyi)
//   B2 — köprü, konulu çeviri + sıralama sorgusuna önek (AYAR.konuSorgu deneyi)
// Her kipte ilk 3 makale adı (kitabıyla), köprüde çeviri ve konunun düşüp düşmediği kaydedilir. Ürün kendi dilinde havuz
// zayıfsa ya da boşsa köprüye geçer; bu da kaydedilir (cevap yazılmadığı için modelin "bilgi yok"u görülmez — alt sınır).
// Hüküm sonra okunarak verilir (makale doğru anlama mı ait).
// Kullanım: KUTUPHANE=… SOHBET=… GOMME=… CEVIRMEN=… node olcum/kopru/konu_uctan_olc.cjs set.json cikti.jsonl [kipler]
const fs = require('fs');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
H.AYAR.sohbet = process.env.SOHBET || 'http://127.0.0.1:18080';
H.AYAR.gomme = process.env.GOMME || 'http://127.0.0.1:18081';
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
H.AYAR.benim = '';
const [girdi, cikti] = process.argv.slice(2);
const KIPLER = (process.argv[4] || 'K0,K1,B0,B1').split(',');
const set = JSON.parse(fs.readFileSync(girdi, 'utf8'));
const yapilan = new Set(fs.existsSync(cikti) ? fs.readFileSync(cikti, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).no) : []);
const ilkUc = (parcalar) => {
  const g = [], gor = new Set();
  for (const p of parcalar || []) {
    const k = `${p.kitap}|${p.makale}`;
    if (gor.has(k)) continue;
    gor.add(k);
    g.push({ makale: p.makale, kitap: String(p.kitap || '').replace(/_20\d\d-\d\d$/, ''), puan: Math.round((p.puan || 0) * 1000) / 1000 });
    if (g.length === 3) break;
  }
  return g;
};
(async () => {
  for (const q of set) {
    if (yapilan.has(q.no)) continue;
    const kayit = { no: q.no, tur: q.tur || (q.anahtar ? 'iki_anlam' : 'kontrol'), soru: q.soru, konu: q.konu, anahtar: q.anahtar || '', cift: q.cift || '' };
    for (const kip of KIPLER) {
      const kopru = kip[0] === 'B', konulu = kip[1] === '1';
      const iki = kip[1] === '2';
      H.AYAR.konuBaslik = !kopru && (konulu || iki);
      H.AYAR.konuSorgu = iki;
      const secenek = { yalnizKaynak: true, ...(kopru ? { kaynakDilleri: ['en'] } : {}), ...(konulu || iki ? { konu: q.konu } : {}) };
      const t0 = Date.now();
      try {
        const r = await H.sor(q.soru, () => {}, 'tr', secenek);
        const g = (r.gruplar || []).find((x) => x.dil === 'en');
        const esik = (H.AYAR.zayifHavuz || {}).tr;
        kayit[kip] = { basliklar: r.basliklar, ilk: ilkUc(r.parcalar), sn: Math.round((Date.now() - t0) / 100) / 10,
          ...(g ? { ceviri: g.soru, ...(g.konu ? { konuKullanildi: !g.konuDustu } : {}), ...(g.konuDustu ? { konuDustu: g.konuDustu } : {}) } : {}),
          ...(!kopru ? { kopruyeGecer: !(r.parcalar || []).length || Boolean(esik && r.parcalar[0].puan < esik) } : {}) };
      } catch (e) { kayit[kip] = { hata: e.message }; }
    }
    H.AYAR.konuBaslik = false; H.AYAR.konuSorgu = false;
    fs.appendFileSync(cikti, JSON.stringify(kayit) + '\n');
    process.stderr.write('.');
  }
  process.stderr.write('\n');
})().catch((e) => { console.error(e); process.exit(1); });
