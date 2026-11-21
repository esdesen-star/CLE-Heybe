// Temsilî ölçü (16.11.2026, Özet §164; Ercan: "Bana göre %70 ve üzeri bile oldukça başarılı" · LM: payda bütün sorular,
// zarar için görülmemiş sette 0/100). Sıradan 100 soru (olcum/banka/temsili_1611.json, kodu görmeyen yazar), ürünün
// varsayılan yolu: konu seçilmemiş (kullanıcı çoğu zaman seçmez), köprü açık — sayfa.html'in seçenekleriyle aynı.
//   ilk: her soru bir kez → olcum/sonuc/temsili_1611.jsonl
//        { yedekDiller: 'hepsi', cevap: 'cevirerek' } (sayfa: kopru) · acil kartı ürünün kendi yolunda (kalıp + hakem)
//   sik: kör hakemin "doğru şık" dediği şık seçilmiş sayılır (hep doğru seçen kullanıcı — üst sınır; §142'de insan 15'te 12)
//        sayfanın yolu: { cevap: 'cevirerek', secilen, kaynakDilleri: r.diller (yalnız Türkçe değilse) }
//        → olcum/sonuc/temsili_sik_1611.jsonl
// Kullanım: KUTUPHANE=… SOHBET=… GOMME=… CEVIRMEN=… node olcum/kopru/temsili_olc.cjs ilk|sik
const fs = require('fs');
const path = require('path');
const H = require('../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
H.AYAR.sohbet = process.env.SOHBET || 'http://127.0.0.1:18080';
H.AYAR.gomme = process.env.GOMME || 'http://127.0.0.1:18081';
H.AYAR.cevirmen = process.env.CEVIRMEN || 'http://127.0.0.1:18082';
H.AYAR.benim = '';
const S = path.join(__dirname, '..');
const kip = process.argv[2];
// §173: SET=temsili2 → yeni görülmemiş set (banka/temsili2_1611.json); çıktılar <SET>[_dk]_*
const SETAD = process.env.SET || 'temsili';
const set = JSON.parse(fs.readFileSync(path.join(S, `banka/${SETAD}_1611.json`), 'utf8'));
// §172: DILKORU=1 → dil körü arama deneyi açık (AYAR.dilKoru), çıktılar temsili_dk_* (taban temsili_* aynen kalır)
// §190: HUKUMSUZ=1 → hükümsüz cevap kuralı açık (çıktı …_hk_*). UYARI=1 → uyarı kanalı açık; uyarılar kayda yazılır, cevap
// değişmez (aynı çıktı adı). ACIL_KOPYA=<önek>: o koşunun acil kartları aynen alınır (acil kararı cevap kuralından önce).
// §193: CESITLI=1 → çeşitli arama deneyi açık (kitap başına arama, aday 30, makale başına 2, dil başına sıralama), çıktı …_ca_*
// §193: ONEK verilirse dosya adı odur (ayarlar yine DILKORU/HUKUMSUZ/CESITLI'den; ör. aynı yolun yeni hakemli kopyası temsili4_dk2)
// §199: DILSIRALA=1 → dil başına sıralama deneyi açık (tek başına), çıktı …_ds_*
const ONEK = process.env.ONEK || ((process.env.DILKORU === '1' ? `${SETAD}_dk` : SETAD) + (process.env.HUKUMSUZ === '1' ? '_hk' : '') + (process.env.CESITLI === '1' ? '_ca' : '') + (process.env.DILSIRALA === '1' ? '_ds' : ''));
H.AYAR.dilSirala = { ...H.AYAR.dilSirala, acik: process.env.DILSIRALA === '1' };
H.AYAR.cesitliArama = { ...H.AYAR.cesitliArama, acik: process.env.CESITLI === '1' };
H.AYAR.hukumsuz = process.env.HUKUMSUZ === '1';
H.AYAR.uyariKanali = { ...H.AYAR.uyariKanali, acik: process.env.UYARI === '1' };
H.AYAR.dilKoru = process.env.DILKORU === '1';
// §207: COKDILLI=1 → çok dilli havuz deneyi açık (havuz dil seçmek için değil, doğrudan; başka dildeki bölümler çevrilip bekçiden geçer)
H.AYAR.cokDilli = process.env.COKDILLI === '1';   // §178: üründe varsayılan açık; taban ölçüsü için açıkça kapatılır
H.AYAR.forumGeri = { ...H.AYAR.forumGeri, acik: process.env.FORUMGERI === '1' };   // §211: başka kaynak varken forum havuzdan çıkar
// §222: MAKALELER=<json> → küçük kitabın makale listesi (konu uyumu bekçisi §122; üründe sayfa bunu yardımcının /api/makaleler'inden
// alır, ölçüm yardımcısız koştuğu için dosyadan — olc_banka.cjs ile aynı yol). Verilmezse bekçi eskisi gibi çalışmaz.
if (process.env.MAKALELER) { const m = JSON.parse(fs.readFileSync(process.env.MAKALELER, 'utf8')); H.AYAR.makaleler = async (kitap) => m[kitap] || m[String(kitap).replace(/_20\d\d-\d\d$/, '')] || null; }
// §235: CUMLEBASI=1 → özel adlarda cümle başı kelimesi atlanır (bağlam bekçisinin "başka yer için" hatası; AYAR.cumleBasiAtla)
if (process.env.CUMLEBASI === '1') H.AYAR.cumleBasiAtla = true;
if (process.env.KALIP) H.AYAR.kalip = process.env.KALIP;   // §242: 'sablon' → başka sohbet modeli kendi şablonuyla (SOHBET_MODELI ile başlatılan sunucu)
// §180: dayanak denetimi eski ölçülerde yoktu → varsayılan kapalı. DAYANAK_OLC=1: denetim durdurmaz, bulgusu kayda yazılır
// (kapalı yol = kayıt; açık yol = bulgusu olan cevap durmuş sayılır — temsili_hakem.py DAYANAK_UYGULA=1).
const DAYANAK_OLC = process.env.DAYANAK_OLC === '1';
if (!DAYANAK_OLC) H.AYAR.dayanak = { ...H.AYAR.dayanak, esik: 0 };
const olcAc = () => { if (DAYANAK_OLC) H.AYAR.dayanakOlc = []; };
const olcAl = () => (DAYANAK_OLC ? { dayanak: [...new Set(H.AYAR.dayanakOlc)] } : {});
const ILK = path.join(S, `sonuc/${ONEK}_1611.jsonl`);
const SIK = path.join(S, `sonuc/${ONEK}_sik_1611.jsonl`);
const satirlar = (y) => (fs.existsSync(y) ? fs.readFileSync(y, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const ilkUc = (parcalar) => {
  const g = [], gor = new Set();
  for (const p of parcalar || []) {
    const k = `${p.kitap}|${p.makale}`;
    if (gor.has(k)) continue;
    gor.add(k);
    g.push({ makale: p.makale, kitap: String(p.kitap || '').replace(/_20\d\d-\d\d$/, ''), dil: p.dil || (p.ceviri && p.ceviri.dil) || '', ...(p.ceviri ? { cevrildi: true } : {}) });   // §207
    if (g.length === 3) break;
  }
  return g;
};
const yolu = (r) => (r.acil ? 'acil' : r.secenekler ? 'sik' : r.bilgiYok ? 'bilgiYok' : r.durdur ? 'durdu' : 'cevap');
const ozet = (r) => ({
  yol: yolu(r), kopru: Boolean(r.denetim) || Boolean(r.ilkDeneme), ...(r.kopruDenendi ? { kopruDenendi: r.kopruDenendi } : {}),
  cevap: r.cevap || '', ...(r.ozgun ? { ozgun: r.ozgun.cevap } : {}), eksik: r.eksik || [],
  ...(r.acil ? { acil: r.acil.belirti } : {}), ...(r.dilKoru ? { dilKoru: r.dilKoru } : {}),
  ...(r.acilNumara ? { acilNumara: r.acilNumara } : {}), ...(r.cokDilli ? { cokDilli: r.cokDilli } : {}),   // §207
  ...(r.havuzCeviri ? { havuzDusen: r.havuzCeviri.dusen.map((d) => ({ makale: d.makale, dil: d.dil, sorun: d.sorun })) } : {}),
  ...(r.secenekler ? { secenekler: r.secenekler.map((s) => ({ etiket: s.etiket, ad: s.ad, kitap: s.kitap, dil: s.dil })), diller: r.diller || ['tr'] } : {}),
  ilk: ilkUc(r.parcalar), sn: r.toplam_sn, ...(r.parcalar && r.parcalar.forumDusen ? { forumDusen: r.parcalar.forumDusen } : {}),   // §211
  ...(r.uyarilar ? { uyarilar: r.uyarilar.map((u) => ({ dil: u.dil, makale: u.makale, kitap: String(u.kitap || '').replace(/_20\d\d-\d\d$/, ''), cumle: u.cumle, puan: u.puan, benzer: u.benzer })) } : {}),
});
const yaz = (y, x) => { fs.appendFileSync(y, JSON.stringify(x) + '\n'); process.stderr.write(x.hata ? 'x' : '.'); };

(async () => {
  if (kip === 'ilk') {
    const yapilan = new Set(satirlar(ILK).map((x) => x.no));
    const acilKopya = process.env.ACIL_KOPYA ? new Map(satirlar(path.join(S, `sonuc/${process.env.ACIL_KOPYA}_1611.jsonl`)).filter((x) => x.yol === 'acil').map((x) => [x.no, x])) : new Map();
    for (const q of set) {
      if (yapilan.has(q.no)) continue;
      // §190: kütüphane düştüyse dur (metinAra hatayı yutar; çökmüş sunucuyla her soru sessizce "bilgi yok" kaydediliyordu)
      try { if ((await fetch(`${H.AYAR.kutuphane}/catalog/v2/entries`)).status !== 200) throw new Error('durum'); }
      catch (e) { console.error(`\nKÜTÜPHANE YANIT VERMİYOR (${q.no} öncesi) — koşu durdu`); process.exit(3); }
      if (acilKopya.has(q.no)) { yaz(ILK, { ...acilKopya.get(q.no), kopya: process.env.ACIL_KOPYA }); continue; }
      const kayit = { no: q.no, soru: q.soru };
      // §201: ACILGEC=1 → kullanıcı acil kartında "Hayır, bilgi istiyorum" demiş gibi (karta bakılmaz)
      // §203: DIL=<kod> → soru o dilde sorulur (sayfanın dili; varsayılan tr)
      try { olcAc(); Object.assign(kayit, ozet(await H.sor(q.soru, () => {}, process.env.DIL || 'tr', { yedekDiller: 'hepsi', cevap: 'cevirerek', ...(process.env.ACILGEC === '1' ? { acilBakildi: true } : {}) })), olcAl()); }
      catch (e) { kayit.hata = e.message; }
      yaz(ILK, kayit);
    }
  } else if (kip === 'sik') {
    // hakemin hükmü: olcum/sonuc/temsili_hakem_hukum_1611.json (şık öğelerinde dogru_sik: 1'den başlayan sıra, 0 = yok)
    const anahtar = JSON.parse(fs.readFileSync(path.join(S, `sonuc/${ONEK}_hakem_anahtar_1611.json`), 'utf8'));
    const hukum = new Map(JSON.parse(fs.readFileSync(path.join(S, `sonuc/${ONEK}_hakem_hukum_1611.json`), 'utf8')).map((h) => [h.id, h]));
    const kayitlar = new Map(satirlar(ILK).map((x) => [x.no, x]));
    const yapilan = new Set(satirlar(SIK).map((x) => x.no));
    for (const [id, a] of Object.entries(anahtar)) {
      const h = hukum.get(id), k = kayitlar.get(a.no);
      if (a.tur !== 'secenekler' || !h || !h.dogru_sik || !k || yapilan.has(a.no)) continue;
      const s = k.secenekler[h.dogru_sik - 1];
      const kayit = { no: a.no, soru: k.soru, id, secilen: { ad: s.ad, kitap: String(s.kitap).replace(/_20\d\d-\d\d$/, ''), dil: s.dil, etiket: s.etiket } };
      try {
        const d = k.diller || ['tr'];
        olcAc();
        const sd = process.env.DIL || 'tr';   // §203
        const r = await H.sor(k.soru, () => {}, sd, { cevap: 'cevirerek', secilen: { kitap: s.kitap, ad: s.ad, dil: s.dil },
          ...(!(d.length === 1 && d[0] === sd) ? { kaynakDilleri: d } : {}) });
        Object.assign(kayit, ozet(r), olcAl());
      } catch (e) { kayit.hata = e.message; }
      yaz(SIK, kayit);
    }
  } else { console.error('kip: ilk | sik'); process.exit(2); }
  process.stderr.write('\n');
})().catch((e) => { console.error(e); process.exit(1); });
