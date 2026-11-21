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
// ister2 (14.11, §133): ikinci zorunlu anlam — acil kartında hem "ara" hem "hemen/beklemeden" geçmeli
// ister3 (14.11 gece, §145): üçüncü zorunlu anlam — defter uyarısında "acil durum" da düşmemeli (Letoncada "sızıntı" olmuştu)
const tutar = (g, k) => k.ister.some((x) => var_(g, x)) && (!k.ister2 || k.ister2.some((x) => var_(g, x))) && (!k.ister3 || k.ister3.some((x) => var_(g, x)))
  && !k.yasak.some((x) => var_(g, x));
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
  // §201 acil kartının sorusu: "şu anda" ve "tehlike" düşmemeli; evet ve hayır düğmeleri yer değiştirmemeli
  acilSoru: 'Is someone in danger right now?',
  acilEvet: 'Yes, someone is in danger right now',
  acilHayir: 'No, I only want information',
  // §191 kütüphane arızası: "bilgi yok" ile karışmamalı — olumsuzluk düşerse kullanıcı "kaynakta yok" sanır
  kutuphaneAriza: '⚠ Something went wrong while reaching the library. This result may be incomplete; it does NOT mean “my sources do not contain this”. Heybe tried to restart the library but could not. Please close Heybe and open it again.',
  // §189 kaynaktan uyarı kutusu (cevabın üstünde)
  uyariBaslik: 'Caution — warnings from the sources (the books)',
  uyariNot: 'Warnings about the subject of your question found in the books, quoted in the books’ own words. Read them before the answer.',
  // §180: "kaynakta yok" tersine dönerse ("kaynaklarımda var") cevap gizlenmiş ama sebebi yanlış söylenmiş olur
  dayanakDur: 'Part of the answer cannot be found in my sources; it may have been added without a source. For safety I am not showing it. Please read the sources below.',
  kipDur: 'The translation turned something that the source only says "may be considered" into something that must be done. For safety I am not showing it. Please read the original answer and the sources.',
  // ilk açıklama ("cutting a snake bite wound") Almanca/İspanyolca/Romencede "yarayı temizlemek" oldu — temizlik tehlikeli
  // değil, uyarı yanıltırdı; üç cümle altı dilde denendi, en sağlamı bu (Slovakçada üçü de "yarayı çıkarmak")
  'eylemAdlari.yilan': 'making cuts in the skin at a snake bite, sucking out the venom, or putting ice on the bite',
  'eylemAdlari.yanik': 'putting butter, oil, toothpaste or ice on a burn wound; bursting the blisters',
  'eylemAdlari.bebekbas': "bending a baby's head far backwards (a baby's head should stay straight, in a neutral position)",
  // §133 acil belirti adları: kısa ve bağlamsız — çevirmen için açılır (ekranda İngilizce aynı)
  'acilBelirtiAdlari.nobet': 'a seizure (convulsions, an epileptic fit)',
  'acilBelirtiAdlari.zehir': 'possible poisoning (something harmful was swallowed or breathed in)',
  'acilBelirtiAdlari.bogulma': 'a blocked airway (choking on food or an object) or drowning in water',
  'acilBelirtiAdlari.sicak': 'signs of heatstroke (dangerous overheating of the body)',
  'acilBelirtiAdlari.soguk': 'signs of hypothermia (the body has become dangerously cold)',
  'acilBelirtiAdlari.sok': 'signs of medical shock (cold sweat, pale skin, weak pulse)',
  'acilBelirtiAdlari.kafa': 'a danger sign after a blow or injury to the head',
  // §145 defter: kısa düğme adları bağlamsız iki anlamlı ("Close" = yakın, "Move" = taşınmak/hamle) — kayıt bağlamı yazılır
  defterKapat: 'Close the entry', defterSil: 'Delete the entry', defterTasi: 'Move the entry to the group:', defterGrup: 'Notebook group',
  defterGruplanmamis: 'Not in any group', defterUstYok: 'At the top level (not inside another group)', defterGrupAdlandir: 'Rename the group',
  defterAd: 'Name (title of the entry)',
  // §148 defter kilidi: "Open" (açık mı, aç mı), "Lock" (kilit mi, kilitle mi), "Back", "Continue" kısa ve iki anlamlı — eylem yazılır
  // 15.11 ilk koşu: parantezli açıklama düğmenin kendisine girdi ("Öffnen Sie das Notizbuch (entsperren Sie es).") → kısa eylem;
  // kurtarma metninde "only" kaydı (Almanca "öffnet dieser Code nur Ihr Notizbuch" = bu kod yalnız defteri açar) → "the only way"
  defterAcDugme: 'Unlock the notebook', defterKilitleDugme: '🔒 Lock the notebook', defterGeri: 'Go back', defterDevam: 'Continue to the notebook',
  defterKodYazdir: '🖨 Print the code', defterKilitKurDugme: 'Lock the notebook and open it', defterKayipOnay: 'Open a new, empty notebook',
  // "unopened" Almancada "ohne Inhalt" (içeriksiz) oldu — eski defter boş sanılır → "still locked, with all its notes"
  defterKayipAciklama: 'A new, empty notebook is opened. The old notebook is not deleted: it is kept on the stick as a separate file, still locked, with all its notes. If you find the code later, the old notebook can be brought back.',
  defterKodAciklama: 'If you forget your password, this code is the only way to open your notebook. Write it on paper or print it; keep it somewhere safe at home or with an older family member. The code is not stored on the stick and will not be shown again.',
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
  // §133 acil belirti kartı: "beklemeden hemen ara" anlamı düşmemeli; "bekle(yin)" ya da "sabah" girmemeli
  acilBelirtiDur: { ister: ['ara ', 'ara;', 'ara,', 'ara.', 'arayın', 'arayınız', 'aramak', 'arama', 'arayarak', 'telefon et', 'telefonla', 'çağır', 'ulaşın'],
    ister2: ['hemen', 'beklemeden', 'derhal', 'vakit kaybetmeden', 'şimdi', 'gecikmeden', 'beklemeyin', 'hiç beklemeden', 'acilen'],
    yasak: ['bekleyin', 'bekle ', 'sabah'], ikinci: 'Do not wait: call the emergency number {1} immediately. Sign: {0}. I am not writing an answer to this question.' },
  acilGenelDur: { ister: ['ara ', 'ara;', 'ara,', 'ara.', 'arayın', 'arayınız', 'aramak', 'arama', 'arayarak', 'telefon et', 'telefonla', 'çağır', 'ulaşın'],
    ister2: ['hemen', 'beklemeden', 'derhal', 'vakit kaybetmeden', 'şimdi', 'gecikmeden', 'beklemeyin', 'hiç beklemeden', 'acilen'],
    yasak: ['bekleyin', 'bekle ', 'sabah'], ikinci: 'This may be an emergency. Do not wait: call the emergency number {0} immediately. I am not writing an answer to this question.' },
  // §145 defter: açılan kayıt acil bir durumu anlatıyorsa — kartla aynı anlam ("beklemeden ara") düşmemeli
  // ilk koşu (46 dil): 26'sı döndü — geri çevirmen "ara" yerine "{0} numaralı telefona başvurun", "{0} ile iletişime geçin",
  // "telefon edin" diyordu (anlam doğru). İki dilde "acele etmeyin: hemen…" (ters anlam) — yasak.
  defterAcil: { ister: ['ara ', 'ara;', 'ara,', 'ara.', 'arayın', 'arayınız', 'aramak', 'arama', 'arayarak', 'telefon et', 'telefon ed', 'telefonla', 'çağır', 'ulaşın',
    'başvur', 'iletişime geç', 'numaralı telefon'],
    ister2: ['hemen', 'beklemeden', 'derhal', 'vakit kaybetmeden', 'şimdi', 'gecikmeden', 'beklemeyin', 'hiç beklemeden', 'acilen', 'tereddüt etmeden', 'vakit kaybetmeyin'],
    ister3: ['acil', 'tehlike', 'olağan dışı', 'olağandışı', 'kriz', 'hayati'],
    yasak: ['bekleyin', 'bekle ', 'sabah', 'acele etme', 'acele etmey'], ikinci: 'This entry may describe an emergency. If you are in such a situation now, do not wait: call {0} immediately.' },
  // §145 kişisel notta eylem bekçisi: "tehlikeli" anlamı düşmemeli
  defterNotUyari: { ister: ['tehlike', 'zararlı', 'riskli', 'güvenli değil', 'zarar ver'], yasak: [], ikinci: 'Warning: this note contains advice that may be dangerous: {0}. Think again before you follow it.' },
  // §150 sorunun konusu: kısa adlar hem düğmede görünür hem çevirmene önek olur ("Tıbbi: …") — anlamı düşmemeli
  // ("Barınak" → "barınak/sığınak", "Araç ve gereç" → "alet/ekipman"; "Shelter" vergi sığınağı, "Tools" yazılım aracı olmasın)
  konuTibbi: { ister: ['tıb', 'tıp', 'sağlık', 'medikal', 'hekim', 'doktor', 'ilk yardım'], yasak: [], ikinci: 'Health and medicine' },
  konuYangin: { ister: ['yangın', 'ateş'], ister2: ['güvenlik', 'emniyet', 'koruma'], yasak: [], ikinci: 'Fire and personal safety' },
  konuHarita: { ister: ['harita'], ister2: ['yol', 'rota', 'güzergah', 'güzergâh', 'yön'], yasak: [], ikinci: 'Maps and roads' },
  konuBarinak: { ister: ['barın', 'sığına', 'sığınak', 'konaklama', 'korunak', 'çadır'], yasak: ['vergi'], ikinci: 'Emergency shelter' },
  konuYiyecek: { ister: ['yiyecek', 'gıda', 'yemek', 'besin', 'erzak'], ister2: ['su', 'içecek', 'içme'], yasak: [], ikinci: 'Food and drinking water' },
  konuGiyim: { ister: ['giyim', 'giysi', 'kıyafet', 'elbise', 'giyecek', 'giyin'], yasak: [], ikinci: 'Clothes and shoes' },
  konuArac: { ister: ['alet', 'ekipman', 'gereç', 'malzeme', 'donanım', 'teçhizat', 'araç'], yasak: ['yazılım'], ikinci: 'Tools and gear' },
  // §153 (15.11 akşam, Ercan: "eğer ulaşabiliyorsanız profesyonel yardım talep edin"; "tüm durumlar için geçerli"): kartın hep
  // görünen satırı — "hemen ara" ve "ulaşamıyorsan yardım iste" anlamlarının ikisi de düşmemeli; "bekle" girmemeli
  acilSabit: { ister: ['ara ', 'ara;', 'ara,', 'ara.', 'arayın', 'arayınız', 'aramak', 'arama', 'arayarak', 'telefon et', 'telefon ed', 'telefonla', 'çağır', 'ulaşın', 'başvur', 'iletişime geç', 'numaralı telefon'], ister2: ['hemen', 'beklemeden', 'derhal', 'vakit kaybetmeden', 'şimdi', 'gecikmeden', 'beklemeyin', 'hiç beklemeden', 'acilen', 'tereddüt etmeden', 'vakit kaybetmeyin'], ister3: ['ulaşam', 'ulaşılam', 'ulaşamaz', 'bağlanam', 'bağlantı kuram', 'bağlantı kurulam', 'erişem', 'erişilem', 'arayamı', 'aranamı', 'yanıt alam', 'cevap alam', 'ulaşmak mümkün değil', 'ulaşmanın mümkün olmadığı', 'ulaşma imkânı', 'ulaşma imkanı', 'hat yok', 'şebeke yok', 'bağlantı yok', 'telefon çalışm', 'iletişim kuram', 'iletişim kurulam', 'iletişime geçem', 'iletişime geçil', 'bağlantı sağlayam', 'konuşam'], yasak: ['bekleyin', 'bekle ', 'sabah', 'geçerli olmay', 'geçersiz'],
    ikinci: 'In danger? Call {0} immediately. If you cannot reach them, ask the people around you for help; Heybe\'s information is only meant for the time until help comes.' },
  acilBelirtiKaynak: { ister: ['yardım'], ister2: ['ulaşam', 'ulaşılam', 'ulaşamaz', 'bağlanam', 'bağlantı kuram', 'bağlantı kurulam', 'erişem', 'erişilem', 'arayamı', 'aranamı', 'yanıt alam', 'cevap alam', 'ulaşmak mümkün değil', 'ulaşmanın mümkün olmadığı', 'ulaşma imkânı', 'ulaşma imkanı', 'hat yok', 'şebeke yok', 'bağlantı yok', 'telefon çalışm', 'iletişim kuram', 'iletişim kurulam', 'iletişime geçem', 'iletişime geçil', 'bağlantı sağlayam', 'konuşam'], yasak: [],
    ikinci: 'If you cannot reach the emergency number, ask the people around you for help. Below are passages you can read until help comes. The emergency numbers of other countries are on the card at the top of the page.' },
  // §155 (Ercan 15.11): kaynağın güveni — "güvenilir kaynak → doğru cevap" ilişkisi ve "kaynağı düzeltemez" düşmemeli
  'kilavuz.guven': { ister: ['güven', 'itimat', 'sağlam', 'doğru'], ister2: ['cevap', 'yanıt'], ister3: ['kaynak'], yasak: [],
    ikinci: 'If a source is reliable and accurate, the answer will be more accurate and helpful. Heybe writes answers only from the sources in its library and cannot fix a wrong source. Choose current guides from official agencies and first-aid organisations. Encyclopaedia articles, old books and open forums can contain outdated or wrong information.' },
  kurulumKaynak: { ister: ['güven', 'itimat', 'sağlam', 'doğru'], ister2: ['cevap', 'yanıt'], ister3: ['kitaplı', 'kütüphane', 'kaynak'], yasak: [],
    ikinci: 'Important: Heybe can only be as accurate as its library. If a source is reliable and accurate, the answer will be more accurate and helpful. Read the library guide below when you choose books.' },
  // §163 hiçbiri + en yakın: "hiçbiri", "en yakın" ve "karar senin" düşmemeli
  secenekHicbiriDugme: { ister: ['hiçbir', 'hiç biri', 'hiçbiri', 'hiçbirisi', 'hiç kimse'], ister2: ['durum', 'hal'], yasak: [], ikinci: 'None of these options describes my situation' },
  // ilk koşu: 31 dil döndü — geri çeviri "en uygun", "değerlendir", "size kalmış" diyordu (anlam doğru); "kendi kelimelerimle" (Heybe'nin sözleri) ters anlam, yasak
  secenekEnYakin: { ister: ['en yakın', 'yakın', 'benzer', 'en uygun', 'en ilgili'], ister2: ['karar', 'seç', 'değerlendir', 'size kalmış', 'takdir'], ister3: ['kitab', 'orijinal', 'kaynak metin', 'alıntı', 'kendi sözleriyle'], yasak: ['kendi kelimelerimle', 'kendi sözlerimle', 'kendi ifadelerimle'],
    ikinci: 'You said none of these fits your situation. Still, below are the closest chapters I found, quoted in the book\'s own words; it is your decision whether they are useful.' },
  secenekBolumAc: { ister: ['aç', 'göster', 'oku'], ister2: ['bölüm', 'kısım', 'tamam', 'tümü', 'tüm'], yasak: [], ikinci: 'Open the full chapter' },
  // §158 (K7) yanlış cevap kaydı: "şifreli" ve "parola" düşmemeli; düğme "aç"
  yanlisKilitli: { ister: ['şifre', 'kilit'], ister2: ['parola', 'şifre'], ister3: ['kişisel', 'özel', 'mahrem'], yasak: [],
    ikinci: 'This record holds your question and the answer. That is personal information, so it is kept encrypted with your notebook password. First open My notebook or create a password, then save again. Your note stays here.' },
  yanlisDefterAc: { ister: ['aç'], ister2: ['defter', 'not', 'ajanda'], yasak: [], ikinci: 'Open My notebook' },
  yanlisSifreli: { ister: ['şifre', 'kilit'], ister2: ['aç', 'gör'], yasak: [], ikinci: '🔒 encrypted record — open My notebook to read it' },
  // §157 kaynağın türü: "forum" ile "herkes yazabilir", "viki" ile "gönüllüler" düşmemeli
  'kaynakTuru.forum': { ister: ['forum', 'tartışma', 'soru-cevap', 'soru cevap', 'sohbet'], ister2: ['herkes', 'kimse', 'her kişi', 'kullanıcı', 'isteyen'], yasak: [],
    ikinci: 'online forum: anyone can write there; posts are personal experience' },
  'kaynakTuru.viki': { ister: ['viki', 'wiki'], ister2: ['gönüllü'], yasak: [], ikinci: 'wiki: written by volunteers' },
  // §153 yeni belirti ve eylem adları: konu ve eylem düşmemeli
  'acilBelirtiAdlari.kopma': { ister: ['kop', 'kesil', 'ayrıl', 'amput', 'koparıl', 'kesik'], ister2: ['parmak', 'el', 'kol', 'bacak', 'kulak', 'uzuv', 'vücut'], yasak: [],
    ikinci: 'a part of the body that has been cut off or torn off (a finger, hand, arm, leg or ear)' },
  'eylemAdlari.turnikeGevset': { ister: ['turnike', 'sıkı bağ', 'boğucu bağ', 'bağ'], ister2: ['gevşet', 'açmak', 'açılması', 'çözmek', 'çözülmesi', 'bırakmak', 'gevşek'], yasak: [],
    ikinci: 'loosening a tourniquet again and again after it has been put on (it must stay tight until medical staff take over)' },
  'eylemAdlari.yilanPanzehir': { ister: ['yılan'], ister2: ['panzehir', 'antivenin', 'antivenom', 'serum', 'hastane', 'sağlık', 'tıbbi', 'doktor'], yasak: [],
    ikinci: 'saying that a person bitten by a snake does not need antivenom or a hospital (every snake bite needs medical care)' },
  'eylemAdlari.yanginYukari': { ister: ['yangın', 'ateş', 'alev'], ister2: ['yokuş', 'yukarı', 'tepe', 'sırt', 'zirve', 'yamaç', 'yüksek'], yasak: [],
    ikinci: 'running away from a fire uphill, onto a ridge or to the top of a hill (fire spreads faster uphill)' },
  // §201: acil kartının sorusu ve düğmeleri
  acilSoru: { ister: ['tehlike'], ister2: ['şu an', 'şimdi', 'şu sıra', 'hâlihazırda', 'halihazırda', 'şu dakika'], yasak: [], ikinci: 'Right now, is anyone in danger?' },
  acilEvet: { ister: ['evet'], ister2: ['tehlike'], yasak: ['hayır'], ikinci: 'Yes, there is danger right now' },
  acilHayir: { ister: ['hayır'], ister2: ['bilgi'], yasak: ['evet', 'tehlike var'], ikinci: 'No, I just want information' },
  // §191: arıza olduğu, kütüphane, ve "bilgi yok demek değil" olumsuzluğu düşmemeli
  kutuphaneAriza: { ister: ['arıza', 'hata', 'sorun', 'problem', 'aksaklık', 'yanlış git'], ister2: ['kütüphane'], ister3: ['değil', 'gelmez', 'gelmiyor', 'demek olmaz'], yasak: [],
    ikinci: '⚠ There is a fault: Heybe cannot reach its library right now. This is NOT the same as “my sources do not contain this”. Please close Heybe and open it again.' },
  uyariBaslik: { ister: ['dikkat', 'uyarı', 'ikaz', 'tehlike'], ister2: ['kaynak', 'kitap'], yasak: [], ikinci: 'Warning from the sources' },
  uyariNot: { ister: ['uyarı', 'dikkat', 'ikaz'], ister2: ['kitap', 'kaynak'], ister3: ['önce', 'evvel'], yasak: ['kendi sözlerim', 'kendi kelimelerim', 'kendi ifadelerim', 'sonra oku', 'sonra okuyun'],
    ikinci: 'These are warnings from the books about your question, in the books’ own words. Read them first, before the answer.' },
  dayanakDur: { ister: ['kaynak'], ister2: ['geçmiyor', 'geçmemekte', 'bulunmuyor', 'bulunmamakta', 'bulunam', 'yer almıyor', 'yer almamakta', 'mevcut değil', 'yok', 'görünmüyor', 'eklenmiş', 'dayanmıyor', 'desteklenmiyor'],
    ister3: ['göstermiyorum', 'göstermeyeceğim', 'gösteremem', 'göstermem', 'sunmuyorum', 'sunmayacağım', 'paylaşmıyorum', 'gizl'], yasak: [],
    ikinci: 'This answer was stopped: part of it is not in my sources. For safety I am not showing it. Please read the sources below.' },
  aktarmaDur: { ister: ['yasak', 'aykırı', 'yapılmama', 'yapmama', 'izin verm', 'önermed', 'önermiy', 'önerilmey', 'tavsiye etmed', 'tavsiye etmiy', 'tavsiye edilmey', 'reddet', 'desteklem', 'kabul etmed', 'kabul etmiy', 'karşı çık', 'engelle', 'uygulanmama', 'uygulamama', 'ters düş', 'çeliş', 'izin verilm', 'uyardığı', 'kaçınılma', 'mümkün olmad'], yasak: [], ikinci: 'This answer was stopped: it recommends something that its source forbids. Please read the sources below.' },
};
module.exports = { KAPI, KAPI_SAYFA, kapiGecer, enGerekir, CEVIRI_ICIN_HARITA, CEVIRI_ICIN_SAYFA };
