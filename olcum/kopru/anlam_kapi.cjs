// Anlam kapısı (13.11.2026, Özet §123): haritanın yön ve "nereden/nereye" metinleri. Alfabe ve yer tutucu denetimi doğru
// alfabede yazılmış yanlış YÖNÜ göremez. Eski çeviride (anlam_denetle.cjs, Türkçeye geri çeviri) sol/sağ karışmıştı:
// Slovence "Turn left" → "Desno" (sağ), Sırpça üç sol talimatı "sağa çekilin", Korece/Tayca/Estonca/Yunanca/Guceratça
// "Turn sharp right" → "sola dön", İbranice "Turn sharp left" → "keskin sağa". Haritada bundan tehlikeli hata yok.
// Kural: çeviri Türkçeye geri çevrilir; beklenen kök yoksa ya da karşıtı varsa kapıdan geçmez. Çevirmen (arayuz_cevir.cjs)
// bir kez başka İngilizce cümleyle dener, yine geçmezse metin İngilizce kalır (sayfa her adımda ok da gösterir).
// Geri çeviri yanılırsa doğru çeviri de İngilizceye düşer — güvenli yön bu.
// Kural tek yerde: çevirmen ve modelsiz denetim (kapi_denetle.cjs; 13.11 adı harita_kapi_denetle.cjs) bu dosyayı okur.
// en: Türkçe geri çeviri kendi içinde çelişirse (hem "sol" hem "sağ" — Norveççe doğru "Ta til venstre" → "Sol sağa")
// ikinci görüş İngilizce geri çeviriden. Yalnız çelişkide: Türkçe "Doğru yöne" gibi hiç yön demeyen geri çeviride
// İngilizce "right direction" (doğru yön) sağ sanılırdı (Urduca, 13.11).
const SOL = { ister: ['sol'], yasak: ['sağ'], en: { ister: ['left'], yasak: ['right'] } };
const SAG = { ister: ['sağ'], yasak: ['sol'], en: { ister: ['right'], yasak: ['left'] } };
const KAPI = {
  'yon.sol': { ...SOL, ikinci: 'Turn to the left' },
  'yon.hafifsol': { ...SOL, ikinci: 'Keep slightly to the left' },
  'yon.keskinsol': { ...SOL, ikinci: 'Make a sharp turn to the left' },
  'yon.sag': { ...SAG, ikinci: 'Turn to the right' },
  'yon.hafifsag': { ...SAG, ikinci: 'Keep slightly to the right' },
  'yon.keskinsag': { ...SAG, ikinci: 'Make a sharp turn to the right' },
  // "İlerlemeye devam edin" doğru bir "düz devam" (Arapça, ilk koşuda kapıdan dönmüştü)
  'yon.duz': { ister: ['düz', 'ileri', 'ilerle', 'doğru', 'devam'], yasak: ['sol', 'sağ', 'geri'], ikinci: 'Keep going straight ahead' },
  // "Ters yöne git" doğru bir "geri dön" (Marathi)
  'yon.geri': { ister: ['geri', 'ters yön'], yasak: ['sol', 'sağ'], ikinci: 'Turn around and go back' },
  // "Bu kısma nasıl ulaşılır?" doğru bir "buraya" (Litvanca, ilk koşuda dönmüştü): kök geniş, karşıtı yasak yakalar
  buradanBasla: { ister: ['buradan', 'bu noktadan', 'bu yerden', 'bu kısımdan', 'bu konumdan'], yasak: ['buraya', 'bu noktaya', 'bu yere', 'bu kısma', 'bu konuma'], ikinci: 'Start the route from this point' },
  // "Bu hedefe ulaşmak" doğru bir "buraya" (Fince)
  burayaGit: { ister: ['bura', 'bu nokta', 'bu yer', 'bu kısm', 'bu konum', 'bu hedef'], yasak: ['buradan', 'bu noktadan', 'bu yerden', 'bu kısımdan', 'bu konumdan', 'bu hedeften'], ikinci: 'Get directions to this point' },
};
// kelime başında eşleşir ("sağ" → "sağa", "sağdan"; "sağlık" da eşleşir ama yön metninde geçmez)
const kucuk = (s) => String(s || '').toLocaleLowerCase('tr');
const var_ = (metin, kok) => new RegExp(`(^|[^\\p{L}])${kok}`, 'u').test(kucuk(metin));
const tutar = (g, k) => k.ister.some((x) => var_(g, x)) && !k.yasak.some((x) => var_(g, x));
const celisir = (g, k) => k.ister.some((x) => var_(g, x)) && k.yasak.some((x) => var_(g, x));
// geri: Türkçe geri çeviri · geriEn: İngilizce geri çeviri (yalnız Türkçe çelişince bakılır)
function kapiGecer(geri, kural, geriEn) {
  if (!geri) return false;
  if (tutar(geri, kural)) return true;
  return Boolean(kural.en && celisir(geri, kural) && geriEn && tutar(geriEn, kural.en));
}
// çevirmen İngilizce görüşü yalnız gerektiğinde ister
const enGerekir = (geri, kural) => Boolean(kural.en && geri && !tutar(geri, kural) && celisir(geri, kural));
// Çevirmen için açıklama (13.11, §123): bağlamsız kısa İngilizceyi model kendisi yanlış okuyordu (İngilizce → Türkçe taban
// ölçüsü, anlam_denetle.cjs): Assembly point → "montaj noktası" (46 dilin en az 26'sında "montaj yeri"), Square → "kare",
// Hamlet → Shakespeare, steps → "adımlar", dirt road → "çöl yolu", tek başına From/To → "içinden"/"ile",
// "{0} closed roads" → "{0} tarafından kapatılan yollar". Ekranda İngilizce aynı kalır; çevirmene giden metin anlamı açık.
const CEVIRI_ICIN_HARITA = {
  'tur.toplanma': 'Emergency gathering point', 'tur.meydan': 'Town square', 'tur.mezra': 'Small village',
  'sinif.20': 'stairs', 'sinif.16': 'unpaved road', nereden: 'Starting point', nereye: 'Destination',
  kapaliNot: 'Closed roads taken into account: {0}.',
};
// Ana sayfa (sayfa.html). bosDil: İngilizcesi İngilizceye özgü ("no English book") — öbür diller için dil adı içermeyen
// metin (06.11; 13.11'de arayuz_cevir.cjs'ten buraya)
// 13.11 (§124) kaynak taraması: Resume → "özgeçmiş/özet", "({0} s)" → "adet", "comes from: {0}" → "{0} tarafından",
// "tilting the head back for a nosebleed" → "yüzünü burnuyla ovmak", saplanan cismin parantezi cümleyi ters bağladı.
const CEVIRI_ICIN_SAYFA = {
  bosDil: 'There are no books in this language on this stick yet. Heybe looks in books in other languages and translates; you can also download books in the "Library".',
  devam: 'Continue the download', durdurDugme: 'Pause the download', bitti: 'Done ({0} seconds).',
  bolumKaynak: 'This answer comes from this section of the books: {0}',
  'eylemAdlari.burun': 'leaning the head backwards when the nose is bleeding',
  'eylemAdlari.saplanan': 'pulling out an object stuck in a wound, or pressing on the object (the right way: press around it)',
  // güvenlik taraması (anlam_denetle ANAHTAR=…, 48 dil): "its source forbids" 46 dilin 23'ünde düştü — model kendi
  // Türkçesinde "kaynağının önerdiği şeyi öneriyor" (ters); "icing a snake bite" 20 dilde pasta kreması/sinek ısırığı;
  // "a baby's head far back" Dancada "öne"
  aktarmaDur: 'The answer seems to recommend something that its source says must not be done. For safety I am not showing it. Please read the sources below.',
  kipDur: 'The translation turned something that the source only says "may be considered" into something that must be done. For safety I am not showing it. Please read the original answer and the sources.',
  // ilk açıklama ("cutting a snake bite wound") Almanca/İspanyolca/Romencede "yarayı temizlemek" oldu — temizlik tehlikeli
  // değil, uyarı yanıltırdı; üç cümle altı dilde denendi, en sağlamı bu (Slovakçada üçü de "yarayı çıkarmak")
  'eylemAdlari.yilan': 'making cuts in the skin at a snake bite, sucking out the venom, or putting ice on the bite',
  'eylemAdlari.yanik': 'putting butter, oil, toothpaste or ice on a burn wound; bursting the blisters',
  'eylemAdlari.bebekbas': "bending a baby's head far backwards (a baby's head should stay straight, in a neutral position)",
};
// 14.11 ilk koşu: doğru çeviriler eş anlamlıyla döndü ("uygulanmaması gerektiğini", "izin verilmemesi gereken", "kaynağının
// uyardığı", Rusça "нельзя" → "mümkün olmadığını") — kökler yasaklamanın bu biçimleriyle genişledi; "kaynaklara göre
// öneriyor" (Letonca) yine döner.
// Ana sayfanın anlam kapısı: Heybe'nin dürüstlük cümlesi ve "kaynağının yasakladığı" uyarısı. Eski çeviride "My sources
// do not contain this information" Slovakçada "bu durum söz konusu değil" (güvenli mi sorusuna "değil" okunur),
// Malayalamda "bilgilerimle çelişiyor", Svahilicede "kişisel bilgim değil" olmuştu.
const KAPI_SAYFA = {
  // kökler: kelime başından eşleşir, ekler serbest ("desteklem" → desteklemiyor / desteklemediği)
  bilgiYok: { ister: ['yok', 'içerm', 'bulunm', 'yer alm', 'bulamad', 'bulunamad', 'bulamıy', 'söylemiyor', 'sağlamıyor', 'mevcut değil', 'mümkün değil', 'kapsamında değil'], yasak: [], ikinci: 'The information you asked about is not in my sources.' },
  aktarmaDur: { ister: ['yasak', 'aykırı', 'yapılmama', 'yapmama', 'izin verm', 'önermed', 'önermiy', 'önerilmey', 'tavsiye etmed', 'tavsiye etmiy', 'tavsiye edilmey', 'reddet', 'desteklem', 'kabul etmed', 'kabul etmiy', 'karşı çık', 'engelle', 'uygulanmama', 'uygulamama', 'ters düş', 'çeliş', 'izin verilm', 'uyardığı', 'kaçınılma', 'mümkün olmad'], yasak: [], ikinci: 'This answer was stopped: it recommends something that its source forbids. Please read the sources below.' },
};
module.exports = { KAPI, KAPI_SAYFA, kapiGecer, enGerekir, CEVIRI_ICIN_HARITA, CEVIRI_ICIN_SAYFA };
