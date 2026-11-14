// Sınav bankasını bugünkü Heybe'ye sorar (Ö21, 07.11.2026). Ürünün yolu: çevirmen varsa köprülü (sayfadaki gibi).
// Her cevabın izi bankadaki notlarda varsa not kendiliğinden geçer; yoksa "notlanmadı" — notla.cjs ile insan notlar.
// Kullanım: SET=Y node olcum/banka/olc_banka.cjs        (SET: U,K,D,S,L,Y ya da kimlikler "Y01,Y05"; KOPRU=0 köprüsüz)
//   sunucular: olcum/kopru/sunucular.sh (kütüphane 18888, sohbet 18080, anlam 18081) + çevirmen 18082
//   çıktı: olcum/sonuc/banka_<sürüm>_<SET>.jsonl  · S ve L setleri sınav kitaplarını ister (KUTUPHANE=…)
const fs = require('fs');
const path = require('path');
const B = require('./banka.cjs');
// HEYBE_ARKADAS + SURUM: başka bir sürümün arkadas.js'i aynı sorularla (09.11, §86: 0.18.0 ↔ 0.19.0, G seti)
const H = require(process.env.HEYBE_ARKADAS ? path.resolve(process.env.HEYBE_ARKADAS) : '../../tasinabilir/usb_kok/heybe/arkadas.js');
H.AYAR.kutuphane = process.env.KUTUPHANE || 'http://127.0.0.1:18888';
H.AYAR.sohbet = process.env.SOHBET || 'http://127.0.0.1:18080';
H.AYAR.gomme = process.env.GOMME || 'http://127.0.0.1:18081';
H.AYAR.cevirmen = process.env.KOPRU === '0' ? '' : (process.env.CEVIRMEN || 'http://127.0.0.1:18082');
if (process.env.ZAYIF === '0') H.AYAR.zayifHavuz = {};
// §86: KUCUK=5000 küçük kitap araması · SORGU=ikisi (varsayılanlar kapalı — ölçüm için)
if (process.env.KUCUK && H.AYAR.kucukKitap) H.AYAR.kucukKitap.sinir = +process.env.KUCUK;
// §109: UYARI=2 en iyi makalenin uyarı kutuları (Key action · NOTE · CAUTION) makale sınırı dışında
if (process.env.UYARI) H.AYAR.uyariKutusu = +process.env.UYARI;
// §122 konu uyumu bekçisi: yardımcı yokken küçük kitabın makale listesi dosyadan (yardımcının -makaleler komutuyla yazılır).
// Varsayılan sınav kütüphanesinin listesi; MAKALELER=0 bekçiyi kapatır (eski sürümlerle karşılaştırma).
{
  const liste = process.env.MAKALELER || path.join(__dirname, '..', 'sadakat', 'kitap', 'makaleler.json');
  if (process.env.MAKALELER !== '0' && fs.existsSync(liste)) {
    const m = JSON.parse(fs.readFileSync(liste, 'utf8'));
    H.AYAR.makaleler = async (kitap) => m[kitap] || null;
  }
}
const SORGU = process.env.SORGU || '';   // §47 karşılaştırma: zayıf havuz eşiği kapalı
// §58 kardeş modeller: KALIP=sablon (Gemma 3 dışı model kendi şablonuyla) · TEKMODEL=1 (çevirmen yok, köprüde soruyu
// ve cevabı sohbet modeli çevirir — hafif kardeşin tek model düzeni)
if (process.env.KALIP) H.AYAR.kalip = process.env.KALIP;
const TEK = process.env.TEKMODEL === '1';
if (TEK) H.AYAR.cevirmen = '';
const SURUM = process.env.SURUM || JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'tasinabilir', 'usb_kok', 'heybe', 'surum.json'), 'utf8')).surum;
const SEC = (process.env.SET || 'Y').split(',').filter(Boolean);
const secili = B.sorular().filter((q) => SEC.includes(q.set) || SEC.includes(q.kimlik));
const etiket = (process.env.AD || SEC.join('')).replace(/[^\w-]/g, '');
const cikti = path.join(__dirname, '..', 'sonuc', `banka_${SURUM}_${etiket}${process.env.KOPRU === '0' ? '_koprusuz' : ''}.jsonl`);

(async () => {
  fs.writeFileSync(cikti, '');
  const n = B.notlar();
  let gecen = 0, yeni = 0;
  console.log(`— ${secili.length} soru · Heybe ${SURUM} · ${H.AYAR.cevirmen ? 'köprülü' : (TEK ? 'tek model köprü' : 'köprüsüz')}${H.AYAR.kalip !== 'gemma3' ? ' · kalıp ' + H.AYAR.kalip : ''} → ${path.basename(cikti)} —`);
  for (const q of secili) {
    let r;
    try {
      r = await H.sor(q.soru, () => {}, q.dil, H.AYAR.cevirmen ? { yedekDiller: 'hepsi', cevap: 'cevirerek', ...(SORGU ? { sorgu: SORGU } : {}) } : (TEK ? { yedekDiller: 'hepsi' } : {}));
    } catch (e) {
      console.log(`${q.kimlik} HATA ${e.message}`);
      continue;
    }
    const izi = B.iz(r);
    let onceki = B.notBul(n, q.kimlik, izi);
    if (!onceki && r.durdur) {   // durmuş cevabın hükmü kendiliğinden "durdu" (içerik kullanıcıya gösterilmez)
      onceki = { iz: izi, hukum: 'durdu', not: `otomatik: ${r.eksik.join('; ').slice(0, 120)}`, surum: SURUM, sonuc: 'durdu',
        cevap: B.sade(r.cevap).slice(0, 160), tarih: new Date().toISOString().slice(0, 10) };
      // 09.11 (§86): dosya yazmadan hemen önce yeniden okunur — başta okunan kopya, ölçüm sürerken notla.cjs ile yazılan
      // insan hükümlerini eziyordu (0.18.0 ve 0.19.0 G ölçümleri arka arkaya koşarken 0.19.0'ın 8 hükmü silindi)
      const taze = B.notlar();
      (taze[q.kimlik] = taze[q.kimlik] || []).push(onceki);
      B.notlariYaz(taze);
      (n[q.kimlik] = n[q.kimlik] || []).push(onceki);
    }
    if (onceki) gecen++; else yeni++;
    const kayit = { kimlik: q.kimlik, surum: SURUM, dil: q.dil, soru: q.soru, beklenen: q.beklenen, tuzak: q.tuzak,
      sonuc: B.sonucTuru(r), cevap: r.cevap, eksik: r.eksik, ozgun: r.ozgun ? { dil: r.ozgun.dil, cevap: r.ozgun.cevap } : null,
      kaynakDilleri: [...new Set(r.parcalar.map((p) => p.dil || q.dil))],
      parcalar: r.parcalar.map((p) => ({ makale: p.makale, bolum: p.bolum, kitap: p.kitap, dil: p.dil || q.dil, metin: String(p.metin || '').slice(0, 700) })),
      ilkDeneme: r.ilkDeneme || null, kopruDenendi: r.kopruDenendi || null, zayifHavuz: r.zayifHavuz || null,   // §47
      toplam_sn: r.toplam_sn, iz: izi, hukum: onceki ? onceki.hukum : null, hukumSurum: onceki ? onceki.surum : null };
    fs.appendFileSync(cikti, JSON.stringify(kayit) + '\n');
    console.log(`${q.kimlik.padEnd(5)} [${q.dil}] ${q.soru.slice(0, 48).padEnd(48)} | ${kayit.sonuc.padEnd(8)} ${String(r.toplam_sn).padStart(5)} sn | ${onceki ? onceki.hukum + ' (' + onceki.surum + ')' : 'NOTLANMADI'}` +
      `${r.eksik.length ? ' · ' + r.eksik.join('; ').slice(0, 80) : ''}\n      ${B.sade(r.cevap).slice(0, 240)}`);
  }
  console.log(`— notu geçen ${gecen} · notlanacak ${yeni} → node olcum/banka/notla.cjs ${path.relative(process.cwd(), cikti)} —`);
})();
