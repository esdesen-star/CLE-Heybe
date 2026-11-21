/* CLE Heybe — kaynaktan cevap veren arkadaş (05.11.2026).
 *
 * olcum/betik/arkadas.py (v3: anlam araması) ile denetci.py'nin taşınabilir hali.
 * Python ya da kurulum istemez: tarayıcıda da Node'da da çalışır. Üç yerel sunucuyla konuşur:
 *   kütüphane (kiwix-serve) · sohbet modeli (llamafile) · anlam modeli (llamafile --embedding)
 * Soru gelir → model bakılacak başlıkları önerir → kütüphanede aranır → paragraflar anlamca
 * sıralanır → model YALNIZ bu paragraflardan cevap verir → sayı denetçisi kaynakta olmayan
 * "sayı + birim" görürse cevabı durdurur.
 *
 * 06.11.2026 (Özet §27): Heybe bir klasör (K13) — kütüphane sunucusundaki BÜTÜN kitaplarda arar
 * (sorunun dilindeki, tam metin dizini olan kitaplar); kullanıcının kendi dosyalarında da arar
 * (yardımcı programın dizini); üç dil (tr · en · cs). Türkçe yol ölçülmüş haliyle aynen korunur.
 */
(function (kok) {
  'use strict';

  const AYAR = {
    kutuphane: 'http://127.0.0.1:8888',
    // §191: kütüphane düşerse yeniden açmasını isteyecek adres (sayfa: yardımcının /api/kutuphane-onar'ı; ölçü betiklerinde yok)
    onarim: null, onarimBekle: 30000, onarimAralik: 1000,
    kitap: 'wikipedia_tr_all_nopic_2026-09',   // kitaplık okunamazsa tek kitap (eski düzen)
    sohbet: 'http://127.0.0.1:8080',
    gomme: 'http://127.0.0.1:8081',
    benim: '',   // kullanıcının dosyaları (yardımcı programın /benim adresi); boşsa yok
    cevirmen: '',   // dil köprüsünde soruyu çeviren TranslateGemma sunucusu; boşsa sohbet modeli çevirir (06.11)
    ikinciGoz: true,   // Ö22 (07.11): cevap sorulan duruma mı ait — sohbet modeli hakem; false ise sorulmaz
    kalip: 'gemma3',   // sohbet modelinin konuşma kalıbı: 'gemma3' (ölçülmüş yol) · 'sablon' (kardeş modeller, modelin kendi şablonu — §58)
    // Ö26 (07.11, §47): kendi dilindeki en iyi paragrafın anlam puanı bunun altındaysa model yazmaz, "bilgi yok" (köprü açıksa
    // öbür dillerin kitaplarına bakılır). Yalnız ölçülen dil: görülmüş 112 Türkçe cevapta 0,45 altı doğru 0, kötü 4.
    zayifHavuz: { tr: 0.45 },
    // 09.11 (§86): makale sayısı `sinir`dan az olan kitap küçüktür — tek kelimeyle de aranır; konu makalesinden `konu` paragraf.
    // CEVAP YOLUNDA KAPALI (sinir 0). 09.11: sorgu 'ikisi' ile G'de yanlış/tehlikeli geçen 0 → 4. 13.11 (§120) yeniden
    // ölçüldü (sorgu özgün, o günden beri eklenen bekçilerle): 150 etiketli soruda soruya ait makale aday 114 → 144, en
    // başta 100 → 114, kaynak cümlesi 200 → 295/481; uçtan uca beş sette (G H I J M) işe yarar cevap 18 → 25, geçen kötü
    // 7 → 5 — ama tehlikeli geçen 1 → 3 (karbonmonoksite sıcak su torbası, nefes alan kişiye CPR, apandisitte sıcak su
    // torbası; ikisi yanlış bölümden). Güvenlik önce: kapalı. `okuma`: okuma kipinde (cevap yazılmaz, bölüm gösterilir)
    // aynı arama AÇIK — kaynak cümlesi F 46 → 48, G 42 → 44/75 (anlam modeliyle), kelimeyle F 16 → 18, G 27 → 28.
    kucukKitap: { sinir: 0, konu: 5, okuma: 5000 },
    // 15.11 (§150) deney: sorunun konusu kendi dilindeki başlık önerisine de önek olsun mu ("Tıbbi: Ateş düşürme").
    // Ölçülmedi → kapalı; ürün konuyu yalnız çeviride kullanır (konuluCevir). olcum/kopru/konu_uctan_olc.cjs açar.
    konuBaslik: false,
    // §150 deney 2: konu anlam sıralamasının sorgusuna da önek olsun mu (kendi dilinde ve köprüde). Ölçülmedi → kapalı.
    konuSorgu: false,
    // 12.11 (§111): en iyi makalenin uyarı kutuları (Key action · NOTE · CAUTION) makale başına sınıra takılmadan en çok
    // bu kadar eklenir. Görülmüş F+G+H'de kaçan alıntıların 57'si makale sınırında kalmıştı ("Do not apply ice", "Do not
    // make the person vomit"); en iyi makaleden ≤2 kutu: alıntı 109 → 116/223. Görülmemiş I'de işe yarar cevap 4 → 6.
    // 13.11 (§114) KAPATILDI: görülmemiş J'de tehlikeli bir cevaba yol açtı — "NOTE" her zaman uyarı değil; IFRC'nin kafa
    // yaralanması NOT'u hafif darbe için "dinlensin, gününe devam etsin" diyor; burundan berrak sıvı gelen soruya bu
    // cümle eklendi (J03). Kutusuz aynı soru zararsız. Yeniden açmak (ör. yalnız CAUTION) yeni görülmemiş setle ölçülür.
    uyariKutusu: 0,
    // 13.11 (§122): konu uyumu bekçisi — küçük kitapta (makale sayısı `sinir` altı) soru kitabın BÜTÜN paragraflarına karşı
    // ayrıca sıralanır (anlam modeli; köprüde kaynak dilindeki çeviriyle). Cevabın o kitaba atıflarının yarısından çoğu
    // bu bağımsız sıralamanın birinci makalesinden değilse durur. Notlu 104 cevapta (görülmüş setler, §121): kötü 13/27
    // (tehlikeli 5/11) durdu, iyi 6/77. Komşu durum tuzaklarını görmez (bağımsız arama da aynı kelimeye kanar).
    // `makaleler`: yardımcı programın küçük kitap makale listesi (/api/makaleler); boşsa bekçi çalışmaz. 0: kapalı.
    konuBekci: { sinir: 500 },
    makaleler: '',
    // 20.11 (§235): özel adlarda cümle başı kelimesi atlansın mı (bağlam bekçisinin "başka yer için" hatası). ~~Ölçülene kadar kapalı.~~
    // 21.11 (§236): AÇIK — laboratuvar (saklı yarı İngilizce doğru 9 → 14, tehlikeli 0 → 0) ve görülmemiş TI (doğru 3 → 5, tehlikeli 6 → 6) geçti.
    cumleBasiAtla: true,
    // 14.11 (§133): acil belirti kartı — soruda şu anda acil bir belirti varsa cevap yazılmaz, acil numara + kaynaklar
    acilKart: true,
    acilHakem: true,   // §133: kalıp bulamazsa sohbet modeline sorulur
    // 16.11 (§178) AÇIK — görülmemiş TB'de (§173) ulaşan doğru 8 → 11, tehlikeli 8 → 6; ölçüt geçti, Ercan: "Evet bu sırayla yapalım".
    // (eski:) 16.11 (§172) DENEY — dil körü arama (§49, Planlama 6b; Ercan 07.11: "hangi dilde kaynak en zengin ve ücretsiz ise onu
    // kullanmak"). Açıkken kitaplar dil ayırmadan tek havuzda aranır; en iyi bölüm hangi dildeyse cevap YALNIZ o dilin
    // bölümlerinden, bugünkü ölçülmüş yoldan yazılır (yabancıysa çevirerek, bütün bekçilerle). Kapalıyken eski yol: önce
    // sorunun dili, "bilgi yok" deyince köprü. §171: aynı 41 soruda doğru bölüm 7 → 19 (yalnız arama). Karar görülmemiş setle.
    dilKoru: true,
    // 19.11 (§207) DENEY — çok dilli havuz (Ercan 18.11: "ilk önce Heybe her dilde olan kaynakları soru ile ilişkili olanları
    // bulup havuzda toplamasını sağlamak. Tehlikeli cevap sonra elinir"). Açıkken dil körünün havuzu (bütün diller tek listede)
    // dil seçmek için değil, doğrudan kullanılır: şıklar ve modele giden bölümler ondan, ikinci arama yok. Havuz karışıksa başka
    // dildeki bölümler önce çevirmenle kullanıcının diline çevrilir; çeviride sayı, olumsuzluk ya da kip kayarsa o bölüm modele
    // gitmez; model kendi dilinde yazar (06.11: model kendisi çevirerek yazınca "do not cut" → "kesin" olmuştu — burada çeviriyi
    // çevirmen yapar ve bekçiden geçer). §206: riskli altı soruda Heybe yalnız Türkçede aradı, ready.gov'daki doğru tarife ulaşmadı.
    cokDilli: false,
    // §211 DENEY (Ercan 19.11: "Evet, dene" — §210: forumdaki tehlike yanıtların kendisinde, yorumda değil): kaynağın güveni.
    // Havuzun en iyi puanına `fark` kadar yakın forum dışı bir paragraf varsa forum paragrafları havuzdan çıkar: modele de
    // şıklara da gitmez. Yoksa forum kalır (başka kaynak yok). Kullanıcının seçtiği bölüme ve kendi dosyalarına dokunmaz.
    forumGeri: { acik: false, fark: 0.10 },
    // 16.11 (§180) dayanak denetimi: cevabın atıflı satırı, atıf verdiği bölümlerin hiçbir cümlesinde karşılık bulmuyorsa
    // (içerik köklerinin en iyi cümlede bile esik'ten azı) cevap durur. esik 0: kapalı.
    // hukum: "Evet/Hayır" ile başlayan cümle sorunun hükmüdür, kelimeleri sorudan gelir; kaynakta nesnenin adı yetmez,
    // sorulan durum da geçmeli (Ercan'ın sıra testi, §180: "Evet, evinizde … jeneratörü çalıştırabilirsiniz" 0,4'te geçiyordu)
    // §181 KAPALI: görülmemiş TC'de ulaşan tehlikeli 2 → 1, ulaşan doğru 8 → 4 (giriş/toparlama cümleleri ve hüküm eşiği doğruyu
    // durdurdu). Kod ve dişler duruyor; daha dar biçimi ölçülmeden açılmaz. Deney değeri: { esik: 0.4, enAz: 3, hukum: 0.6 }.
    dayanak: { esik: 0, enAz: 3, hukum: 0.6 },
    dayanakOlc: null,
    // 16.11 (§185) DENEY — çeşitli arama (Ercan: "biz Heybe bir kaynak seçmek için zorluyoruz … aramada sanki bir boşluk yada
    // öncelik sıralamasında katı bir durum var"). §184: bir dilin bütün kitapları tek aramada en iyi 2–5 sonuç veriyordu;
    // İngilizcede forum baskın, Wikivoyage'ın "Cold weather", "Aggressive dogs" maddeleri havuza hiç girmedi. Açıkken her
    // sorgu her kitapta AYRI aranır (kitap başına aynı sayı), aday sınırı `aday`, bir maddeden en çok `makaleBasina` paragraf.
    cesitliArama: { acik: false, aday: 30, makaleBasina: 2 },
    // §196 DENEY adil sınır (Ercan: "kısıtlamaları biraz daha genişletsek"): her aramanın sonuçları sırayla dönüşümlü (önce hepsinin
    // 1.'si), arama başına derinlik ve toplam madde sınırı biraz geniş; başka hiçbir şey değişmez. Kapalı, ölçülmeden açılmaz.
    adilSinir: { acik: false, derinlik: 3, sinir: 30 },
    // §197 DENEY kitap başına arama: bir dilin kitapları ayrı ayrı aranır, her kitaba eşit pay (en az `pay` madde); birleştirme
    // adil sınırdaki gibi. Kapalı, ölçülmeden açılmaz.
    kitapBasina: { acik: false, pay: 10 },
    // §198 DENEY dil başına sıralama tek başına (§186'da çeşitli aramanın içindeydi): her dilin paragrafları o dildeki soruyla
    // (köprünün çevirisi) sıralanır, diller dönüşümlü birleşir. Kapalı, ölçülmeden açılmaz.
    dilSirala: { acik: false },
    // §201/§203 acil kartının sorusu ("Şu anda biri tehlikede mi?" · Evet / Hayır, bilgi istiyorum): yazıldı, ANAHTARLA KAPALI.
    // "Hayır" yolu boş alarmda 70'te 20 doğru 2 tehlikeli; gerçek acilde yanlış basılırsa 29'da 4, üç dilli riskli testte 18'de 6
    // tehlikeli. Kütüphanenin acil içeriği (yangında mahsur, gaz) ve bölüm seçimi düzelmeden açılmaz (Ercan'ın kararı).
    acilSoru: false,
    // §194 DENEY ana dal ağırlığı (Ercan): nesne + durum aynı paragrafta → öne; kapalı, ölçülmeden açılmaz
    anaDal: { acik: false, nesne: 1, birlikte: 0.04, fazla: 0.01, enCok: 2 },
    // 17.11 (§188) DENEY — kaynaktan uyarı (Ercan 16.11: "bu cümle kaynaklarımızda varsa kullanıc sormamış olsa bile uyarılar
    // varsa söylemeli"). Uyarı cevapla aynı sıralamada yarışmaz (§187: jeneratörün karbonmonoksit paragrafı soruya benzerlikte
    // 683. sıradaydı): sorunun nesnesi tehlike kelimeleriyle ayrıca aranır, nesneyi ve tehlike sözünü aynı cümlede taşıyan
    // kitap cümleleri, kitabın kendi sözüyle ayrı döner (r.uyarilar). Cevabı durdurmaz, değiştirmez.
    // 17.11 (§189) DENEY — hükümsüz cevap (Ercan: "Heybe evet yada hayır cevap vermek durumunda mı ? Soru ile ilgili cevap
    // verse nasıl olur"). Talimata 6. kural: evet/hayır hükmü verme, kaynakların ne söylediğini ve koşulunu yaz. Üç görülmemiş
    // sette "Evet/Hayır" ile başlayan 5 cevabın 1'i doğruydu, biri jeneratör ("Evet, … evin içinde çalıştırabilirsiniz").
    hukumsuz: false,
    uyariKanali: { acik: false, enCok: 1, nesne: 3, sonuc: 3, aday: 40, benzer: 0.3, enAzPuan: 3, aramaEs: 1, okumaEs: 4 },   // ölçüm kancası (§180): dizi verilirse bulgular cevabı durdurmaz, buraya yazılır (yalnız ölçü betikleri)
    // §135 şıklar: ilk iki aday bölümün anlam puanı farkı bundan küçükse Heybe sorar (0: kapalı). KAPALI (14.11): görülmemiş A'da
    // (gerçek kütüphane) 30 sorunun 16'sında soruldu, 6'sı açık/bilgi sorusuydu; şıklar makale başlığı — çoğu durum değil konu
    // ("Rigor mortis", "Mastit", tarihî depremler); taklit kullanıcı uymayanı da seçti. Kötü geçen 3 → 1 ama işe yarar 10 → 8:
    // kazanç doğru bölümden değil susmaktan. Ölçüm için 0.03 (etiketli IFRC'de ayarlandı).
    // 14.11 gece (§143) AÇILDI: şıklar artık bölüm adı + ayırt eden kelimeler (§142: insan 15'te 12); geri dönüş sayfada
    secenek: { esik: 0.03 },
    // 21.11 (§237, Ercan'ın fikri §233: "her birini elemek için cümleler içerisinde kelimlerle soru sorar gibi"): şık BÖLÜM düzeyinde —
    // aynı makalenin bölümleri (donma ↔ vücut üşümesi) ayrı şık olur, ayırt eden kelimeler bölümün kendi metninden; seçilince cevap
    // yalnız o bölümden yazılır. Laboratuvarda çiftlerin 12/30'u aynı makalede (madde düzeyindeki şık ayıramaz). Ölçülene kadar kapalı.
    bolumSik: false,
  };

  const PARCA_SAYISI = 6;       // modele giden paragraf sayısı
  const SECENEK_EN_COK = 4;     // §135 şıklar: en çok kaç bölüm sunulur
  const ANLAM_AYRIMI = /\((anlam ayrımı|disambiguation|rozcestník)\)\s*$/iu;
  const PARCA_UZUNLUK = 900;    // her paragraf en çok bu kadar harf
  const MAKALE_BASINA = 3;      // bir makaleden en çok kaç paragraf
  const KARDES_BAKIS = 12;      // kişi kuralı (§109): kardeş makale için sıralamanın ilk kaç paragrafına bakılır
  const OKUMA_KELIME = 8;       // okuma kipi (modelsiz): başlık gibi aranan içerik kelimesi sayısı (10.11, Özet §101)
  // 09.11 (F seti, §86): küçük kitap (kurumun kılavuzu gibi, her konu tek makale) — tek kelimeyle de aranır ve en iyi
  // paragrafın makalesinden (konu makalesi) 5 paragraf gelebilir. Tanı: IFRC kitabında kaynağın asıl cümlelerinin
  // 26/75'i adaydı ama "makale başına 3" sınırına takıldı; 10/75'in makalesi hiç aday olmadı ("bleeding" kelimesi soruda
  // 8. sıradaydı, yalnız ilk 5 kelime ikili aranıyordu). Vikipedi gibi büyük kitapta ölçülmüş yol aynen kalır.
  // sınırlar AYAR.kucukKitap'ta (ölçümde değiştirilebilsin)
  const ATLANAN_BOLUM = ['kaynakça', 'kaynaklar', 'dış bağlantılar', 'ayrıca bakınız', 'notlar', 'dipnotlar',
    'references', 'external links', 'see also', 'notes', 'further reading', 'bibliography',
    'reference', 'externí odkazy', 'související články', 'literatura', 'poznámky'];

  const SISTEM_KAYNAKLI = `Sen çevrim dışı çalışan bir yardımcı arkadaşsın. İnternet yok. Sana KAYNAKLAR verilecek.
Kurallar:
1. Yalnızca KAYNAKLAR'da yazanı kullan. Kendi bilgini ekleme.
2. Her bilginin sonuna kaynağın numarasını [1] gibi yaz.
3. Kaynaklarda sorunun cevabı yoksa yalnızca şunu yaz: "Kaynaklarımda bu bilgi yok." Tahmin etme.
4. İlaç dozu kaynakta açıkça yazmıyorsa asla doz söyleme.
5. Kısa, sakin, maddeler halinde, Türkçe yaz.`;

  const SISTEM_BASLIK = `Kullanıcının sorusu için Türkçe Vikipedi'de bakılacak en fazla 3 makale başlığı yaz.
Yalnızca başlıkları yaz, her satıra bir tane. Açıklama yazma.`;

  // soru kalıbı kelimeleri aramayı saptırmasın
  const DURAK_KOK = new Set(['nasıl', 'nedir', 'neler', 'yapıl', 'gerek', 'kadar', 'sonra', 'önce', 'veya', 'daha',
    'olan', 'olara', 'için', 'midir', 'mıdır', 'yenir', 'hale', 'getir', 'ilk']);

  // ---- diller (06.11.2026): Türkçe metinler ölçülmüş haliyle aynen. İngilizce ve Çekçe Can'ın çevirisi —
  //      insan doğrulaması bekliyor (Çekçe: K12, Ercan'ın arkadaşı). ----

  const SISTEM_KAYNAKLI_EN = `You are a helpful friend that works offline. There is no internet. You will be given SOURCES.
Rules:
1. Use only what is written in the SOURCES. Do not add your own knowledge.
2. Put the number of the source like [1] after each piece of information.
3. If the SOURCES do not contain the answer, write only this: "My sources do not contain this information." Do not guess.
4. Never state a medicine dose unless the source states it explicitly.
5. Write short, calm, in bullet points, in English.`;

  const SISTEM_BASLIK_EN = `Write at most 3 English Wikipedia article titles to look up for the user's question.
Write only the titles, one per line. Do not explain.`;

  const SISTEM_KAYNAKLI_CS = `Jsi pomocný přítel, který funguje bez internetu. Internet není k dispozici. Dostaneš ZDROJE.
Pravidla:
1. Používej jen to, co je napsáno ve ZDROJÍCH. Nepřidávej vlastní znalosti.
2. Za každou informaci napiš číslo zdroje, například [1].
3. Pokud ve ZDROJÍCH odpověď není, napiš jen toto: "V mých zdrojích tato informace není." Nehádej.
4. Nikdy neuváděj dávku léku, pokud ji zdroj výslovně neuvádí.
5. Piš krátce, klidně, v bodech, česky.`;

  const SISTEM_BASLIK_CS = `Napiš nejvýše 3 názvy článků české Wikipedie, které je třeba vyhledat k otázce uživatele.
Napiš jen názvy, každý na samostatný řádek. Nic nevysvětluj.`;

  const DIL = {
    tr: { kiwix: 'tur', sistem: SISTEM_KAYNAKLI, baslik: SISTEM_BASLIK, yok: 'Kaynaklarımda bu bilgi yok.',
      kaynaklar: 'KAYNAKLAR', soru: 'SORU', makale: 'Makale', dosya: 'Senin dosyan', hepAday: 'İlk_yardım',
      kucuk: (m) => kucuk(m), harf: /[a-zçğıöşü]+/g, durak: DURAK_KOK },
    en: { kiwix: 'eng', sistem: SISTEM_KAYNAKLI_EN, baslik: SISTEM_BASLIK_EN, yok: 'My sources do not contain this information.',
      kaynaklar: 'SOURCES', soru: 'QUESTION', makale: 'Article', dosya: 'Your file', hepAday: 'First_aid',
      kucuk: (m) => m.toLowerCase(), harf: /[a-z]+/g,
      durak: new Set(['what', 'shoul', 'about', 'after', 'befor', 'which', 'there', 'would', 'could', 'with', 'from',
        'that', 'this', 'have', 'does', 'when', 'first', 'where', 'doing', 'long', 'much', 'many', 'into', 'your',
        'need', 'make', 'them', 'they', 'will', 'then', 'than', 'some', 'very']) },
    cs: { kiwix: 'ces', sistem: SISTEM_KAYNAKLI_CS, baslik: SISTEM_BASLIK_CS, yok: 'V mých zdrojích tato informace není.',
      kaynaklar: 'ZDROJE', soru: 'OTÁZKA', makale: 'Článek', dosya: 'Tvůj soubor', hepAday: 'První_pomoc',
      kucuk: (m) => m.toLowerCase(), harf: /[a-záčďéěíňóřšťúůýž]+/g,
      durak: new Set(['když', 'který', 'která', 'které', 'jaký', 'jaká', 'jaké', 'proč', 'může', 'mohu', 'musí',
        'bych', 'nebo', 'také', 'jsou', 'byla', 'bylo', 'před', 'potom', 'poté', 'první', 'dělat', 'udělá', 'kolik',
        'mám', 'mají', 'jsem', 'jako', 'tak', 'aby', 'pro', 'při', 'pak', 'jeho', 'její']) },
  };
  // 06.11: kullanıcının dili de çevirmenin 55 dilinden biri olabilir → dilBilgi (tr, en, cs için aynısı)
  function dilAl(dil) { return dilBilgi(dil); }

  // ---- köprüde tanınmayan diller (06.11.2026, Ercan: "kullanıcı isterse manuel kopyalasın … translate ile birlikte
  //      çalışabilmesi"): kitaplıktaki ya da kullanıcının dosyasındaki her dil köprüye girer. DIL'de kuralları ölçülmüş
  //      üç dil var; ötekiler için İngilizce talimatlı genel kalıp ("cevabı o dilde yaz"), sayı denetçisi yalnız rakam. ----
  // Kiwix'in 3 harflik dil kodu → kısa kod. Çevirmenin 55 dili (WMT24++: 51 dil + bölge biçimleri) + birkaç yakın dil.
  const KISA = { tur: 'tr', eng: 'en', ces: 'cs', ara: 'ar', bul: 'bg', ben: 'bn', cat: 'ca', dan: 'da', deu: 'de',
    ell: 'el', spa: 'es', est: 'et', fas: 'fa', fin: 'fi', fil: 'fil', fra: 'fr', guj: 'gu', heb: 'he', hin: 'hi',
    hrv: 'hr', hun: 'hu', ind: 'id', isl: 'is', ita: 'it', jpn: 'ja', kan: 'kn', kor: 'ko', lit: 'lt', lav: 'lv',
    mal: 'ml', mar: 'mr', nld: 'nl', nor: 'no', nob: 'no', pan: 'pa', pol: 'pl', por: 'pt', ron: 'ro', rus: 'ru',
    slk: 'sk', slv: 'sl', srp: 'sr', swe: 'sv', swa: 'sw', tam: 'ta', tel: 'te', tha: 'th', ukr: 'uk', urd: 'ur',
    vie: 'vi', zho: 'zh', zul: 'zu', nno: 'nn', kur: 'ku', aze: 'az' };
  const UC = Object.fromEntries(Object.entries(KISA).filter(([u]) => u !== 'nob').map(([u, k]) => [k, u]));
  const genelDiller = new Map();
  function dilBilgi(kisa) {
    if (DIL[kisa]) return DIL[kisa];
    if (!genelDiller.has(kisa)) {
      const ad = DIL_ADI[kisa] || kisa;
      genelDiller.set(kisa, { kiwix: UC[kisa] || kisa, genel: true,
        sistem: SISTEM_KAYNAKLI_EN.replace('5. Write short, calm, in bullet points, in English.',
          `5. Write short, calm, in bullet points, in ${ad}. If the SOURCES do not contain the answer, write the rule 3 sentence in English.`),
        baslik: `Write at most 3 ${ad} Wikipedia article titles to look up for the user's question, in ${ad}.\nWrite only the titles, one per line. Do not explain.`,
        yok: DIL.en.yok, kaynaklar: 'SOURCES', soru: 'QUESTION', makale: 'Article', dosya: 'Your file', hepAday: '',
        kucuk: (m) => m.toLowerCase(), harf: /\p{L}+/gu, durak: new Set() });
    }
    return genelDiller.get(kisa);
  }

  // ---- dil köprüsü (06.11.2026 — K17, Özet §29): soru bir dilde, kaynak başka dilde ----
  // Yalnız sor(..., { kaynakDilleri }) verilince çalışır; verilmezse yol ölçülmüş haliyle aynen kalır.
  const CEVIR = {
    tr: `Kullanıcının sorusunu Türkçeye çevir. Yalnızca çeviriyi yaz, başka bir şey yazma.`,
    en: `Translate the user's question into English. Write only the translation, nothing else.`,
    cs: `Přelož otázku uživatele do češtiny. Napiš jen překlad, nic jiného.`,
  };
  // TranslateGemma'nın kendi kalıbı (model dosyasındaki tokenizer.chat_template'in metin hâli, 06.11'de karşılaştırıldı).
  // 20 soruda Gemma 3 4B "ısırgan otu"nu "poison ivy", "baldıran otu"nu "baldrian" çevirdi; TranslateGemma
  // "stinging nettle", "baldıran" (çevirmedi ama yanlış bitkiye de çevirmedi) — olcum/sonuc/olcum_kopru_soru_cevirisi_tg.json
  // TranslateGemma şablonundaki adlarla birebir (06.11; şablon model dosyasından okundu)
  const DIL_ADI = { tr: 'Turkish', en: 'English', cs: 'Czech', ar: 'Arabic', bg: 'Bulgarian', bn: 'Bengali', ca: 'Catalan',
    da: 'Danish', de: 'German', el: 'Greek', es: 'Spanish', et: 'Estonian', fa: 'Persian', fi: 'Finnish', fil: 'Filipino',
    fr: 'French', gu: 'Gujarati', he: 'Hebrew', hi: 'Hindi', hr: 'Croatian', hu: 'Hungarian', id: 'Indonesian', is: 'Icelandic',
    it: 'Italian', ja: 'Japanese', kn: 'Kannada', ko: 'Korean', lt: 'Lithuanian', lv: 'Latvian', ml: 'Malayalam', mr: 'Marathi',
    nl: 'Dutch', no: 'Norwegian', nb: 'Norwegian Bokmål', nn: 'Norwegian Nynorsk', pa: 'Punjabi', pl: 'Polish', pt: 'Portuguese',
    ro: 'Romanian', ru: 'Russian', sk: 'Slovak', sl: 'Slovenian', sr: 'Serbian', sv: 'Swedish', sw: 'Swahili', ta: 'Tamil',
    te: 'Telugu', th: 'Thai', uk: 'Ukrainian', ur: 'Urdu', vi: 'Vietnamese', zh: 'Chinese', zu: 'Zulu', ku: 'Kurdish',
    az: 'Azerbaijani' };
  function translateGemmaIstemi(metin, kaynak, hedef) {
    const k = DIL_ADI[kaynak], h = DIL_ADI[hedef];
    return `<start_of_turn>user\nYou are a professional ${k} (${kaynak}) to ${h} (${hedef}) translator. Your goal is to accurately ` +
      `convey the meaning and nuances of the original ${k} text while adhering to ${h} grammar, vocabulary, and cultural ` +
      `sensitivities.\nProduce only the ${h} translation, without any additional explanations or commentary. Please ` +
      `translate the following ${k} text into ${h}:\n\n\n${metin.trim()}<end_of_turn>\n<start_of_turn>model\n`;
  }

  // cevap talimatına eklenen kural: kaynak başka dilde olsa da cevap kullanıcının dilinde
  const KOPRU = {
    tr: `6. Kaynakların bazıları başka dilde olabilir. Cevabı yine Türkçe yaz. Sayıları ve birimleri kaynaktaki gibi aynen aktar.`,
    en: `6. Some sources may be in another language. Still write the answer in English. Copy numbers and units exactly as in the source.`,
    cs: `6. Některé zdroje mohou být v jiném jazyce. Odpověď přesto napiš česky. Čísla a jednotky přepiš přesně podle zdroje.`,
  };

  function kucuk(metin) {
    return metin.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase();
  }

  // 07.11 akşam (§48): metni n harfte keserken bir emojinin (vekil çift) yarısında kalmaz, bozuk karakter sunucuya gitmez.
  // Eskiden "slice(0, 600)" yarım karakter bırakınca anlam sunucusu isteği JSON hatasıyla reddediyordu ve soru hiç
  // cevaplanmıyordu (ek kitap denemesinde Ready.gov ve Wikivoyage sayfaları, 38 sorunun 3'ü).
  function kes(metin, n) {
    let m = String(metin || '').slice(0, n);
    const c = m.charCodeAt(m.length - 1);
    if (c >= 0xd800 && c <= 0xdbff) m = m.slice(0, -1);
    return typeof m.toWellFormed === 'function' ? m.toWellFormed() : m;
  }

  function bosluklariTopla(metin) {
    return metin.split(/\s+/).filter(Boolean).join(' ');
  }

  // ---- Vikipedi HTML'inden (bölüm, paragraf) çiftleri ----

  const VARLIK = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ndash: '–', mdash: '—',
    laquo: '«', raquo: '»', deg: '°', times: '×', minus: '−', hellip: '…', middot: '·' };

  function varlikCoz(metin) {
    return metin.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tam, ad) => {
      if (ad[0] === '#') {
        const kod = ad[1] === 'x' || ad[1] === 'X' ? parseInt(ad.slice(2), 16) : parseInt(ad.slice(1), 10);
        return Number.isFinite(kod) ? String.fromCodePoint(kod) : tam;
      }
      return VARLIK[ad.toLowerCase()] ?? tam;
    });
  }

  function paragraflar(html) {
    // Python'daki HTMLParser tabanlı Paragrafci'nin birebir karşılığı: aynı etiketler sayılır, aynı yerler atlanır.
    const parcalar = [];
    let bolum = '', tampon = [], etiket = null, atla = false;
    // 07.11 (kitap sağlık denetimi buldu): atlanan bölgeler eskiden tek bir sayaçla tutuluyordu; "navbox" sınıflı bir
    // <div>/<td> sayacı artırıyor ama kapanışı azaltmıyordu → makalenin başında bir navbox varsa sonraki bütün paragraflar
    // kayboluyordu ("Kût'ül-Amâre Kuşatması": 23 paragraf, 0 okundu). Artık her bölge kendi etiketiyle kapanır.
    const yigin = [];   // [{ tag, sayac }]
    const BOS_ETIKET = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
    // 09.11 (F seti, §86): kısa ama tam cümle ("Keep the injury still to reduce pain.", 37 harf — bir konunun ana eylemi)
    // ve kısa liste maddeleri ("• Half a teaspoon of salt" — serum tarifi) atılıyordu. Artık madde her boyda alınır
    // (birleşince 40 harfi geçmezse yine atılır), 15 harften uzun tam cümle ve listeye giriş ("Oral rehydration recipe:") tutulur.
    const bosalt = () => {
      if ((etiket === 'p' || etiket === 'li') && !atla) {
        const metin = bosluklariTopla(tampon.join(''));
        if (etiket === 'li' ? metin.length >= 3 : (metin.length > 40 || (metin.length >= 15 && /[.!?:]$/.test(metin)))) {
          parcalar.push([bolum, (etiket === 'li' ? '• ' : '') + metin]);
        }
      }
      tampon = []; etiket = null;
    };
    const ac = (tag, sinif) => {
      const ust = yigin[yigin.length - 1];
      if (ust && ust.tag === tag) ust.sayac += 1;   // atlanan bölgenin içinde aynı etiket: kapanışı sayılır
      if (['style', 'script', 'sup', 'table'].includes(tag) || sinif.includes('reference') || sinif.includes('navbox')) {
        if (!(ust && ust.tag === tag) && !BOS_ETIKET.has(tag)) yigin.push({ tag, sayac: 1 });
      } else if (tag === 'h2' || tag === 'h3') {
        bosalt(); etiket = 'baslik';
      } else if ((tag === 'p' || tag === 'li') && yigin.length === 0) {
        bosalt(); etiket = tag;
      }
    };
    const kapa = (tag) => {
      let i = yigin.length - 1;
      while (i >= 0 && yigin[i].tag !== tag) i--;
      if (i >= 0) {   // bu etiketin açtığı bölge (kapanmamış iç bölgeler de onunla biter)
        yigin.length = i + 1;
        if (--yigin[i].sayac === 0) yigin.pop();
      } else if ((tag === 'h2' || tag === 'h3') && etiket === 'baslik') {
        bolum = bosluklariTopla(tampon.join(''));
        atla = ATLANAN_BOLUM.some((a) => kucuk(bolum).startsWith(a) || bolum.toLowerCase().startsWith(a));
        tampon = []; etiket = null;
      } else if ((tag === 'p' || tag === 'li') && etiket === tag) {
        bosalt();
      }
    };
    const veri = (metin) => {
      if (etiket && yigin.length === 0) tampon.push(varlikCoz(metin));
    };

    const desen = /<!--[\s\S]*?-->|<![^>]*>|<\/\s*([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;
    let m;
    while ((m = desen.exec(html)) !== null) {
      if (m[1]) {
        kapa(m[1].toLowerCase());
      } else if (m[2]) {
        const tag = m[2].toLowerCase();
        const nitelik = m[3] || '';
        const s = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(nitelik);
        ac(tag, s ? varlikCoz(s[1] ?? s[2] ?? s[3] ?? '') : '');
        if (/\/\s*$/.test(nitelik)) kapa(tag);
        if (tag === 'script' || tag === 'style') {   // içerik etiket sayılmaz (HTMLParser'daki gibi)
          // toLowerCase() kullanılmaz: "İ" iki harfe dönüşür, konumlar kayar
          const kapanis = new RegExp('</' + tag, 'gi');
          kapanis.lastIndex = desen.lastIndex;
          if (kapanis.exec(html)) desen.lastIndex = kapanis.lastIndex - tag.length - 2;
        }
      } else if (m[4]) {
        veri(m[4]);
      } else if (m[0] === '<') {
        veri('<');
      }
    }
    bosalt();
    return liBirlestir(parcalar);
  }

  function liBirlestir(parcalar) {
    // art arda gelen liste maddelerini tek paragrafta topla; kısa giriş ("Tarif:") arkasından gelen listeyle birleşir.
    // 40 harfi geçmeyen parça (tek kısa madde, listesiz giriş) atılır — eski eşik birleşmeden sonra uygulanır.
    // 09.11 (§87): uzun bir paragrafın ":" ile biten son cümlesi listenin başına da yazılır (paragraf yerinde kalır).
    // F10 (görülmüş): "The following actions are not effective and may even cause further harm:" + "• applying a cold
    // compress" — liste girişinden ayrılınca olumsuzluğu kaybetti, model "Apply a cold compress" yazdı. Liste parçalara
    // bölünürse her parça girişi taşır.
    const kisaGiris = (m) => !m.startsWith('• ') && m.length <= 40 && /:$/.test(m);
    const girisCumlesi = (m) => {
      if (m.startsWith('• ') || m.length <= 40 || !/:$/.test(m)) return '';
      const son = m.split(/(?<=[.!?])\s+/).pop();
      return son.length <= 200 ? son : '';
    };
    const sonuc = [];   // [bölüm, metin, liste mi, giriş]
    for (const [bolum, metin] of parcalar) {
      const onceki = sonuc[sonuc.length - 1];
      const madde = metin.startsWith('• ');
      if (onceki && madde && (onceki[2] || kisaGiris(onceki[1])) && onceki[0] === bolum && onceki[1].length < PARCA_UZUNLUK) {
        if (!onceki[2]) onceki[3] = onceki[1];
        onceki[1] = onceki[1] + ' ' + metin;
        onceki[2] = true;
      } else if (onceki && madde && onceki[0] === bolum && (onceki[2] ? onceki[3] : girisCumlesi(onceki[1]))) {
        const giris = onceki[2] ? onceki[3] : girisCumlesi(onceki[1]);
        sonuc.push([bolum, giris + ' ' + metin, true, giris]);
      } else {
        sonuc.push([bolum, metin, madde, '']);
      }
    }
    return sonuc.filter(([, m, liste]) => m.length > 40 || (!liste && !kisaGiris(m))).map(([b, m]) => [b, m]);
  }

  // ---- sunucularla konuşma ----

  async function getir(url, secenek) {
    const yanit = await fetch(url, secenek);
    if (!yanit.ok) { const e = new Error(`${yanit.status} ${url}`); e.durum = yanit.status; throw e; }   // §191: durum kodu arıza ayrımı için
    return yanit;
  }

  // ---- §191 kütüphane arızası (17.11): arıza "bilgi yok" gibi görünmesin ----
  // §190'da kütüphane sunucusu düştü; her istek hatayı yuttuğu için sonraki her soru sessizce "kaynaklarımda yok" oldu.
  // Ercan'ın kuralı: önle (aramalar sırayla) → o anda çöz → dokunma → bildir. Ağ hatası ya da 5xx (yardımcının "sunucu
  // henüz hazır değil" 502'si dahil) arızadır; 4xx (madde yok, kitap adı yanlış) arıza değildir. Arızada: kütüphane
  // kendiliğinden yanıt veriyorsa (tek seferlik 500) yeniden dene; vermiyorsa yardımcıdan yeniden açmasını iste
  // (AYAR.onarim; sayfada /api/kutuphane-onar, ölçü betiklerinde yok), açılmasını bekle, bir kez yeniden dene. Olmazsa
  // kütüphane "düştü" sayılır: kısa süre sonraki istekler beklemeden düşer, en dıştaki sor/oku sonuca kutuphaneArizasi
  // ekler, sayfa "bilgi yok" yerine arızayı söyler. Geliştiriciye: konsola kanonik Türkçe satır.
  const kutuphaneDurum = { hata: 0, onarim: 0, kurtarildi: 0, dustu: false, dustuZaman: 0 };
  const KUTUPHANE_DUSUK_SURE = 15000;   // düştükten sonra bu süre içinde istekler beklemeden düşer (yeni soru yeniden dener)
  const arizaMi = (e) => !(e && e.durum >= 400 && e.durum < 500);
  const kutuphaneUyu = (ms) => new Promise((r) => setTimeout(r, ms));
  async function kutuphaneCanli() {
    try { return (await fetch(`${AYAR.kutuphane}/catalog/v2/entries?count=1`)).ok; } catch (e) { return false; }
  }
  async function kutuphaneOnar() {
    if (await kutuphaneCanli()) return true;
    if (!AYAR.onarim) return false;
    let d = '';
    // yardımcının güvenlik kapısı: POST yalnız X-Heybe başlığıyla (main.go guvenlik); başlıksız istek 403 döner (17.11 canlı denemede
    // onarım bu yüzden hiç istenmemişti — dişlerin sahte yardımcısı kapıyı taklit etmiyordu)
    try { d = String(((await (await fetch(AYAR.onarim, { method: 'POST', headers: { 'X-Heybe': '1' } })).json()) || {}).durum || ''); } catch (e) { return false; }
    kutuphaneDurum.onarim++;
    if (d === 'acilamadi' || d === 'sinir') return false;   // yardımcı açamadı ya da bu oturumda çok denendi: boşuna bekleme
    const son = Date.now() + (AYAR.onarimBekle || 30000);
    while (Date.now() < son) {
      await kutuphaneUyu(AYAR.onarimAralik || 1000);
      if (await kutuphaneCanli()) return true;
    }
    return false;
  }
  async function kutuphaneGetir(url, secenek) {
    if (kutuphaneDurum.dustu && Date.now() - kutuphaneDurum.dustuZaman < KUTUPHANE_DUSUK_SURE) {
      const e = new Error(`kütüphane düştü ${url}`); e.durum = 503; throw e;
    }
    try { return await getir(url, secenek); } catch (e) {
      if (!arizaMi(e)) throw e;
      kutuphaneDurum.hata++;
      if (await kutuphaneOnar()) {
        try { const y = await getir(url, secenek); kutuphaneDurum.kurtarildi++; return y; } catch (e2) { if (!arizaMi(e2)) throw e2; }
      }
      Object.assign(kutuphaneDurum, { dustu: true, dustuZaman: Date.now() });
      if (typeof console !== 'undefined') console.log(`[Heybe] kütüphane yanıt vermiyor (onarım ${kutuphaneDurum.onarim}): ${e.message}`);
      throw e;
    }
  }
  // ---- 19.11 (§207, Ercan: "Heybe direk bulunduğunuz yerel acili arayın dese en kısa yoldan çözmüş oluruz. Acil kart zaten
  //      sürekli açık kullanıcı bulunduğu bölgenin acilini arar kaldı kı böyle bir durumda 911 veya 112 ulaşılmaz olabilir başka
  //      acil no da atanmış olabilir"): cevabın içinde belli bir ülkenin acil numarası kalmaz → "bulunduğunuz yerin acil numarası".
  //      Numara her cevabın üstündeki sabit satırda, tarayıcının bölgesine göre (sayfa, ACIL_NO). 18.11 (§206): TC010 yılan
  //      sorusunda forumdan "911'i arayın" kullanıcıya ulaştı. 911 ve 9-1-1 her yerde değişir; öbür numaralar yalnız arama
  //      bağlamında ya da hâl ekiyle ("112'yi arayın" değişir, "112 kişi" değişmez). Kaynağın kendi paragrafına dokunulmaz.
  //      Ölçülen diller tr, en, cs; başka dildeki cevap çoğunlukla İngilizce yazılıp çevrilir, numara çeviriden önce değişir. ----
  const ACIL_NO_DESEN = '(?:9-1-1|911|999|112|000|111|113|155|110|119|120)';
  const ACIL_NO_ON = '(?<![\\p{L}\\p{N}.,/-])', ACIL_NO_ARKA = '(?![.,]?\\p{N})';
  const ACIL_NO_HER_YER = /^(?:9-1-1|911)$/;
  const ACIL_YEREL_TR = 'bulunduğunuz yerin acil numarası';
  const ACIL_TR_EK = { belirtme: 'nı', yonelme: 'na', ayrilma: 'ndan', bulunma: 'nda', ilgi: 'nın', vasita: 'yla' };
  // kesme işaretinden sonraki ek ya da "merkezini", "hattına", "telefonu" gibi son kelimenin hâli
  function acilTrHal(ek, kelime = false) {
    const e = kucuk(String(ek || ''));
    if (!kelime) {
      if (/^[ny]?[ıiuü]$/.test(e)) return 'belirtme';
      if (/^[ny]?[ea]$/.test(e)) return 'yonelme';
      if (/^n?[dt][ea]n$/.test(e)) return 'ayrilma';
      if (/^n?[dt][ea]$/.test(e)) return 'bulunma';
      if (/^n?[ıiuü]n$/.test(e)) return 'ilgi';
      if (/^y?l[ea]$/.test(e)) return 'vasita';
      return null;
    }
    if (/n[dt][ea]n$/.test(e)) return 'ayrilma';
    if (/n[dt][ea]$/.test(e)) return 'bulunma';
    if (/n[ıiuü]n$/.test(e)) return 'ilgi';
    if (/[ny][ea]$/.test(e)) return 'yonelme';
    if (/[ny][ıiuü]$/.test(e)) return 'belirtme';
    if (/y?l[ea]$/.test(e)) return 'vasita';
    return '';
  }
  // 19.11 tarama (2.870 kayıtlı cevap): "dakikada 100 ila 120 arasında" → "arasında" arama sanılmıştı; "110'un üzerinde" nabız.
  // Türkçede yalnız 112 eki tek başına yeter; öbür numaralar arama fiili ya da "acil çağrı merkezi" gibi sözle değişir.
  const cumleBasi = (onu) => !onu.trim() || /[.!?:\n]\s*$|(^|\n)\s*[-*•]+\s*$/.test(onu);
  const buyukBas = (m, dil) => (dil === 'tr' ? m.charAt(0).toLocaleUpperCase('tr') : m.charAt(0).toUpperCase()) + m.slice(1);
  const ACIL_NO_TR = '(?:9-1-1|911|112|999|155|110|177)';
  const ARAMA_FIIL_TR = /^\s+ara(?:y|m|n|d|r(?![\p{L}])|(?![\p{L}]))/u;   // arayın, aramak, aranmalı, aradığınızda — "arasında" değil
  const ACIL_SOZ_TR = /(?<!\p{L})(acil|ambulans|itfaiye|polis|yardım|tıbbi|çağrı|ara(?:y|m|n|d))/u;
  function acilNoTr(m) {
    let n = 0;
    // (112) — 112 ve 911 her yerde; öbürleri cümlede yardım sözü varsa
    m = m.replace(new RegExp(`\\s*\\(\\s*(${ACIL_NO_TR}(?:\\s*(?:,|/|veya|ya da|ve)\\s*${ACIL_NO_TR})*)\\s*\\)`, 'gu'), (t, no, konum, metin) => {
      const cumle = kucuk(metin.slice(Math.max(0, metin.lastIndexOf('.', konum) + 1), konum));
      if (!/(^|\D)(112|911|9-1-1)(\D|$)/.test(no) && !ACIL_SOZ_TR.test(cumle)) return t;
      n++; return '';
    });
    const re = new RegExp(`${ACIL_NO_ON}(${ACIL_NO_TR}(?:\\s*(?:,|/|veya|ya da|ve)\\s*${ACIL_NO_TR})*)${ACIL_NO_ARKA}((?:\\s+(?:[Aa]cil|ACİL|[Çç]ağrı|ÇAĞRI|[Aa]mbulans))*(?:\\s+[Nn]umaralı(?:\\s+(?:[Tt]elefon|[Hh]at)\\p{L}*)?|\\s+(?:[Mm]erkez|[Hh]att?|[Nn]umara|[Ss]ervis)\\p{L}*)?)(?:['’](\\p{L}+))?(?!\\p{L})(\\s+\\p{L}+)?`, 'gu');
    m = m.replace(re, (tum, no, sozler, ek, sonraki = '', konum, metin) => {
      const nolar = no.match(/9-1-1|\d+/g) || [];
      const herYer = nolar.some((x) => ACIL_NO_HER_YER.test(x)), ekYeter = herYer || nolar.includes('112');
      const sonKelime = (sozler.trim().split(/\s+/).pop()) || '';
      const arama = ARAMA_FIIL_TR.test(sonraki);
      const baglam = sozler.trim() || arama || /^\s+(ulaş|haber|bildir|çağır|telefon)/u.test(kucuk(sonraki));
      if (!herYer && !baglam && !(ek && ekYeter)) return tum;   // "112 kişi", "120 arasında", "110'un üzerinde"
      let hal = ek ? acilTrHal(ek) : sonKelime ? acilTrHal(sonKelime, true) : '';
      if (hal === null) { if (!herYer && !baglam) return tum; hal = ''; }   // "112'si" gibi bilinmeyen ek
      if (!hal && arama) hal = 'belirtme';   // "Acil Servisi arayın", "112 arayın"
      n++;
      const yeni = ACIL_YEREL_TR + (hal ? ACIL_TR_EK[hal] : '');
      return (cumleBasi(metin.slice(0, konum)) ? buyukBas(yeni, 'tr') : yeni) + sonraki;
    });
    return { metin: m, n };
  }
  function acilNoEn(m) {
    let n = 0;
    const N = `${ACIL_NO_ON}${ACIL_NO_DESEN}${ACIL_NO_ARKA}`;
    m = m.replace(new RegExp(`\\s*\\(\\s*((?:call|dial)\\s+)?(${N}(?:\\s*(?:,|/|or)\\s*${N})*)(?:\\s+in\\s+(?:the\\s+)?[\\p{L}.]+)?\\s*\\)`, 'giu'), (t, fiil, no, konum, metin) => {
      const cumle = metin.slice(Math.max(0, metin.lastIndexOf('.', konum) + 1), konum).toLowerCase();
      if (!fiil && !/(^|\D)(911|9-1-1|999|112)(\D|$)/.test(no) && !/\b(emergency|ambulance|police|fire|call|dial|help|medical)\b/.test(cumle)) return t;
      n++; return '';
    });
    m = m.replace(new RegExp(`\\b(call|dial|phone|ring|contact|text)(s|ed|ing)?(\\s+)(?:up\\s+)?(?:the\\s+)?(?:local\\s+)?(?:emergency\\s+(?:services?|number|line)\\s+)?(?:(?:at|on)\\s+)?${N}(?:\\s*(?:,|/|or|and)\\s*${N})*`, 'giu'),
      (t, v, s = '', b) => { n++; return `${v}${s}${b}your local emergency number`; });
    m = m.replace(new RegExp(`\\b(?:(a|an|the)\\s+)?${N}\\s+(operators?|dispatchers?|dispatch|calls?|cent(?:er|re)s?|services?|lines?|responders?)\\b`, 'giu'),
      (t, art, ad) => { n++; const a = !art ? '' : /^a/i.test(art) && !/^the$/i.test(art) ? (art[0] === 'A' ? 'An ' : 'an ') : `${art} `; return `${a}emergency ${ad}`; });
    m = m.replace(new RegExp(`\\b(emergency\\s+(?:numbers?|lines?|services?))(?:\\s+(?:is|:))?\\s+${N}`, 'giu'), (t, ad) => { n++; return `local ${ad}`; });
    m = m.replace(new RegExp(`${ACIL_NO_ON}(?:9-1-1|911)${ACIL_NO_ARKA}`, 'gu'), (t, konum, metin) => {
      n++; return cumleBasi(metin.slice(0, konum)) ? 'Your local emergency number' : 'your local emergency number';
    });
    return { metin: m, n };
  }
  function acilNoCs(m) {
    let n = 0;
    const N = `${ACIL_NO_ON}${ACIL_NO_DESEN}${ACIL_NO_ARKA}`;
    m = m.replace(new RegExp(`\\s*\\(\\s*${N}(?:\\s*(?:,|/|nebo)\\s*${N})*\\s*\\)`, 'gu'), () => { n++; return ''; });
    m = m.replace(new RegExp(`(?<!\\p{L})(volejte|zavolejte|vytočte|volat|zavolat|kontaktujte)(\\s+)(?:na\\s+)?(?:(?:tísňov\\p{L}*\\s+)?(?:číslo|linku)\\s+)?${N}(?:\\s*(?:,|/|nebo|a)\\s*${N})*`, 'giu'),
      (t, v, b) => { n++; return `${v}${b}místní tísňové číslo`; });
    m = m.replace(new RegExp(`${ACIL_NO_ON}(?:9-1-1|911)${ACIL_NO_ARKA}`, 'gu'), (t, konum, metin) => {
      n++; return cumleBasi(metin.slice(0, konum)) ? 'Místní tísňové číslo' : 'místní tísňové číslo';
    });
    return { metin: m, n };
  }
  function acilNumaraYerel(metin, dil) {
    if (typeof metin !== 'string' || !/\d/.test(metin)) return { metin, n: 0 };
    // "[112] numarasını arayarak" — köşeli ayraç atıf değil (atıflar [1]–[6]); numara açılır, kural olağan yolla bakar
    const m = metin.replace(/\[(9-1-1|911|112|999)\]/g, '$1');
    const f = { tr: acilNoTr, en: acilNoEn, cs: acilNoCs }[dil];
    if (f) return f(m);
    // ölçülmemiş dil: yalnız ayraç içindeki 112 / 911 / 999 atılır ("medizinische Hilfe (112)"); cümleye dokunulmaz
    let n = 0;
    const t = m.replace(/\s*\(\s*(?:9-1-1|911|112|999)(?:\s*[,/]\s*(?:9-1-1|911|112|999))*\s*\)/g, () => { n++; return ''; });
    return n ? { metin: t, n } : { metin, n: 0 };
  }
  // her sor/oku sonucunun cevabı (ve özgün dildeki cevabı) — iç çağrılarda da; ikinci kez uygulamak bir şey değiştirmez
  function acilNumaraSonuc(r) {
    if (!r || typeof r.cevap !== 'string') return r;
    const c = acilNumaraYerel(r.cevap, r.dil || 'tr');
    const o = r.ozgun && typeof r.ozgun.cevap === 'string' ? acilNumaraYerel(r.ozgun.cevap, r.ozgun.dil) : { n: 0 };
    if (!c.n && !o.n) return r;
    return { ...r, cevap: c.metin, ...(o.n ? { ozgun: { ...r.ozgun, cevap: o.metin } } : {}), acilNumara: (r.acilNumara || 0) + c.n + o.n };
  }
  const acilNumaraIzle = (fn) => async (...a) => acilNumaraSonuc(await fn(...a));
  // en dıştaki sor/oku çağrısı: başta durum sıfırlanır, sonda düştüyse sonuca kutuphaneArizasi eklenir (iç çağrılar dokunmaz)
  let kutuphaneDerinlik = 0;
  function kutuphaneSonuc(r) {
    const { hata, onarim, kurtarildi, dustu } = kutuphaneDurum;
    if (hata && typeof console !== 'undefined') console.log(`[Heybe] bu soruda kütüphane arızası: ${hata} istek, onarım ${onarim}, kurtarılan ${kurtarildi}${dustu ? ', düştü' : ''}`);
    return dustu ? { ...r, kutuphaneArizasi: { hata, onarim, kurtarildi } } : r;
  }
  function kutuphaneIzle(fn) {
    return async (...a) => {
      if (kutuphaneDerinlik === 0) Object.assign(kutuphaneDurum, { hata: 0, onarim: 0, kurtarildi: 0, dustu: false, dustuZaman: 0 });
      kutuphaneDerinlik++;
      try {
        const r = await fn(...a);
        return kutuphaneDerinlik === 1 ? kutuphaneSonuc(r) : r;
      } catch (e) {
        if (kutuphaneDerinlik === 1 && kutuphaneDurum.dustu) {
          return kutuphaneSonuc({ soru: a[0], dil: a[2] || 'tr', basliklar: [], parcalar: [], cevap: '', eksik: [], durdur: false, bilgiYok: true });
        }
        throw e;
      } finally { kutuphaneDerinlik--; }
    };
  }

  function yolKodla(yol) {
    return yol.split('/').map(encodeURIComponent).join('/');
  }

  // ---- kitaplık: kütüphane sunucusunun kendi kataloğundan (06.11.2026 — K13) ----

  async function kitaplik(kati = false) {
    // her soruda yeniden okunur (yerel, birkaç milisaniye): yeni inen kitap hemen aranır
    // kati: kütüphane açılmadıysa yedek kitabı uydurma, hata ver (dil ekranındaki tik için — 06.11)
    try {
      const xml = await (await kutuphaneGetir(`${AYAR.kutuphane}/catalog/v2/entries?count=1000`)).text();
      const kitaplar = [];
      for (const [, e] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
        const al = (ad) => { const r = new RegExp(`<${ad}>([^<]*)</${ad}>`).exec(e); return r ? varlikCoz(r[1]).trim() : ''; };
        const yol = /<link type="text\/html" href="[^"]*\/content\/([^"\/]+)"/.exec(e);
        if (!yol) continue;
        const etiket = al('tags');
        kitaplar.push({ ad: decodeURIComponent(yol[1]), seri: al('name'), baslik: al('title'), dil: al('language'),
          aranir: !/_ftindex:no/.test(etiket), resimli: /_pictures:yes/.test(etiket), videolu: /_videos:yes/.test(etiket),
          makaleSayisi: parseInt(al('articleCount'), 10) || 0 });
      }
      return kitaplar;
    } catch (e) {
      if (kati) throw e;
      return [{ ad: AYAR.kitap, seri: 'wikipedia_tr_all', baslik: 'Vikipedi', dil: 'tur', aranir: true }];
    }
  }

  function dildekiler(kitaplar, D) {
    // aynı dilin iki kodu tek dil sayılır (Kiwix Norveççe için hem "nob" hem "nor" kullanıyor — 06.11)
    const kisa = KISA[D.kiwix];
    return kitaplar.filter((k) => k.aranir && k.dil.split(',').some((u) => u === D.kiwix || (kisa && KISA[u] === kisa)));
  }

  async function oneri(terim, adet, kitap = AYAR.kitap) {
    const u = `${AYAR.kutuphane}/suggest?content=${encodeURIComponent(kitap)}&term=${encodeURIComponent(terim)}&count=${adet}`;
    try {
      const liste = await (await kutuphaneGetir(u)).json();
      // öneri listesindeki yol HTML kaçışlı gelir ("Türkiye&apos;nin")
      return liste.filter((o) => o.kind === 'path').slice(0, adet).map((o) => ({ kitap, yol: varlikCoz(o.path) }));
    } catch (e) { return []; }
  }

  async function metinAra(sorgu, adet, kitaplar = [{ ad: AYAR.kitap }]) {
    // aynı dildeki kitaplar tek aramada (kütüphane farklı dilleri birlikte aramıyor — 06.11 ölçüldü)
    if (!sorgu.trim() || !kitaplar.length) return [];
    const kitapParam = kitaplar.map((k) => `books.name=${encodeURIComponent(k.ad)}`).join('&');
    const u = `${AYAR.kutuphane}/search?${kitapParam}&pattern=${encodeURIComponent(sorgu)}&pageLength=${adet}&format=xml`;
    try {
      const xml = await (await kutuphaneGetir(u)).text();
      const yollar = [];
      for (const m of xml.matchAll(/<item>[\s\S]*?<link>([^<]*)<\/link>/g)) {
        const link = /\/content\/([^/]+)\/(.*)$/.exec(varlikCoz(m[1]));
        if (link) yollar.push({ kitap: decodeURIComponent(link[1]), yol: decodeURIComponent(link[2]) });
      }
      if (AYAR.sorguGozlem) AYAR.sorguGozlem({ sorgu, kitaplar: kitaplar.map((k) => k.ad), adet, yollar: yollar.slice(0, adet) });   // §195 yalnız ölçüm (olcum/kopru/sorgu_olc.cjs)
      return yollar.slice(0, adet);
    } catch (e) { return []; }
  }

  async function makale(yol, kitap = AYAR.kitap) {
    const html = await (await kutuphaneGetir(`${AYAR.kutuphane}/raw/${encodeURIComponent(kitap)}/content/${yolKodla(yol)}`)).text();
    const t = /<title>([^<]*)<\/title>/i.exec(html);
    return { ad: t ? varlikCoz(t[1]).trim() : yol.replace(/_/g, ' '), paragraflar: paragraflar(html) };
  }

  const gommeOnbellek = new Map();

  async function gom(metinler) {
    // metinleri anlam vektörüne çevirir; aynı metin ikinci kez hesaplanmaz
    const eksik = [...new Set(metinler)].filter((m) => !gommeOnbellek.has(m));
    for (let i = 0; i < eksik.length; i += 64) {
      const parti = eksik.slice(i, i + 64);
      const yanit = await (await getir(`${AYAR.gomme}/v1/embeddings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: parti }),
      })).json();
      const veri = [...yanit.data].sort((a, b) => a.index - b.index);
      parti.forEach((m, j) => {
        const v = veri[j].embedding;
        const boy = Math.sqrt(v.reduce((t, x) => t + x * x, 0)) || 1;
        gommeOnbellek.set(m, v.map((x) => x / boy));
      });
    }
    return metinler.map((m) => gommeOnbellek.get(m));
  }

  function gemmaIstemi(sistem, mesaj) {
    // Ollama'nın gemma3 kalıbıyla birebir: sistem metni ayrı bir kullanıcı turu olarak gider.
    // llamafile'ın kendi kalıbı sistemi soruyla birleştiriyor; o kalıpla model kaynakta olan
    // cevaba iki kez "bilgi yok" dedi (05.11). Kurallar bu kalıpla ölçüldü (Özet §8).
    return `<start_of_turn>user\n${sistem}<end_of_turn>\n<start_of_turn>user\n${mesaj}<end_of_turn>\n<start_of_turn>model\n`;
  }

  // Kardeş modeller (08.11, Özet §58 — Ercan: "Heybe iki kardeşi olur"): Gemma 3 dışındaki sohbet modeli kendi kalıbıyla
  // konuşur; sunucu modelin içindeki şablonu kullanır. Varsayılan 'gemma3' bugünkü ölçülmüş yoldur, birebir aynı kalır.
  async function sablonla(mesajlar, uzunluk) {
    const y = await (await getir(`${AYAR.sohbet}/v1/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // düşünme kapalı: Woof 2B önce Çince düşündü, 350 jetonu bitirip cevap yazmadı (08.11)
      body: JSON.stringify({ messages: mesajlar, max_tokens: uzunluk, temperature: 0, seed: 1,
        chat_template_kwargs: { enable_thinking: false } }),
    })).json();
    return String(((((y.choices || [])[0]) || {}).message || {}).content || '').trim();
  }

  // §189 deney: hükümsüz cevap kuralı (talimatın sonuna; ölçülmüş talimat aynen kalır, ayar kapalıyken hiç eklenmez).
  // 17.11 canlı 4 soru (görülmemiş setlerde Evet/Hayır ile başlayan cevapların hepsi): bu biçim 4'ün 3'ünde hükmü kaldırdı ama
  // ikinci göz (Ö22) 2'sini durdurdu (jeneratör: yerinde, parasetamol: boş alarm). "İlk cümlede sorudaki işi an" biçimi
  // 4'ün 2'sinde kaldırdı, jeneratör yine "Evet" dedi → bu biçimde kalındı. Açılmadan önce uçtan uca ölçü gerekir.
  const HUKUMSUZ = {
    tr: '6. Soru evet ya da hayır diye sorulsa bile "Evet" ya da "Hayır" diye hüküm verme; kaynakların o konuda ne söylediğini ve hangi koşulda söylediğini yaz.',
    en: '6. Even if the question asks yes or no, do not answer "Yes" or "No"; state what the SOURCES say about it and under which conditions.',
    cs: '6. I když se otázka ptá ano, nebo ne, neodpovídej „Ano“ ani „Ne“; napiš, co o tom říkají ZDROJE a za jakých podmínek.',
  };
  function hukumsuz(sistem, dil) {
    return AYAR.hukumsuz ? `${sistem}\n${HUKUMSUZ[dil] || HUKUMSUZ.en}` : sistem;
  }

  async function sohbet(sistem, mesaj, uzunluk = 350) {
    if (AYAR.kalip === 'sablon') return sablonla([{ role: 'system', content: sistem }, { role: 'user', content: mesaj }], uzunluk);
    const yanit = await (await getir(`${AYAR.sohbet}/completion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: gemmaIstemi(sistem, mesaj), n_predict: uzunluk, temperature: 0, seed: 1,
        stop: ['<end_of_turn>'] }),
    })).json();
    return yanit.content.trim();
  }

  async function cevir(metin, kaynak, hedef, uzunluk = 450, adres = AYAR.cevirmen) {
    // dil köprüsü: TranslateGemma sunucusuyla çeviri (AYAR.cevirmen; konuşma çevirisi kendi adresini verir — 10.11)
    const yanit = await (await getir(`${adres}/completion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: translateGemmaIstemi(metin, kaynak, hedef), n_predict: uzunluk, temperature: 0, seed: 1,
        stop: ['<end_of_turn>'] }),
    })).json();
    return yanit.content.trim();
  }

  // ---- 15.11 (Özet §149–§150) sorunun konusu (Ercan: "kullanıcı sorusu hangi konu ile ilgili başlık atsın"; "bir insana da
  //      sorsan mesleğine göre algılar"). Kullanıcı isterse soruyu sorarken bir konu seçer; soru başka dile çevrilirken konu
  //      önek olur ("Tıbbi: Ateş düşürme" → "Medical: Fever reduction"), önekten sonrası alınır. Kodu görmeyen bir yazarın iki
  //      anlamlı 40 kısa sorusunda (konu_baslik_1511) doğru anlam 14 → 28, konusuz çeviride bir çiftin ikisi birden hiç doğru
  //      olamıyordu (0 → 10/20). Konu yalnız ipucudur: acil kalıpları, arama ve cevabın denetimleri özgün soruyla kalır.
  //      Karışma kapısı: konunun çevrilmiş adındaki bir kelime çeviride geçiyor ama konusuz çeviride yoksa konu soruya
  //      olmayan bir durum katmıştır ("Kurt varsa ne yapmalıyım" + Yangın → "yangın var ve biri mahsur kaldıysa") →
  //      konusuz çeviri kullanılır. Önek ayrılamazsa ya da soruda iki nokta varsa da konusuz (bugünkü yol).
  //      Bilinen sınır (§149): "nöbet = vardiya" gibi güçlü önyargıyı konu yenemiyor; konu yanlış anlamı da seçebilir
  //      ("Tulum" + Barınak → çadır) — kapı yalnız konunun kendi kelimesinin sızmasını görür. ----
  const BOSLUKSUZ_YAZI = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
  // konu adının ayırt edici kelimeleri: 4 harf ve üstü ("and", "und", "ve" gibi bağlaçlar düşer); boşluksuz yazıda 2 ve üstü
  const soruKonuKelime = (etiket) => (String(etiket || '').toLowerCase().match(/\p{L}[\p{L}\p{M}]*/gu) || [])
    .filter((w) => w.length >= 4 || (BOSLUKSUZ_YAZI.test(w) && w.length >= 2));
  // kelime başında eşleşir ("fire" → "fire", "fires"); boşluksuz yazıda alt dize
  function soruKonuGecer(kelime, metin) {
    const m = String(metin || '').toLowerCase();
    if (BOSLUKSUZ_YAZI.test(kelime)) return m.includes(kelime);
    return new RegExp(`(^|[^\\p{L}\\p{M}])${kelime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(m);
  }
  // çevirmenin cevabından önek ile gövde: ilk dolu satır, ilk iki noktaya kadar (önek kısa olmalı)
  function soruKonuAyir(ham, konu) {
    const satir = ceviriAyikla(String(ham || ''));   // ilk dolu satır, "Translation:" öneki ve tırnaklar atılmış
    const i = satir.search(/[:：]/);
    if (i <= 0 || i > Math.max(40, String(konu || '').length * 3)) return null;
    const govde = ceviriAyikla(satir.slice(i + 1));
    return govde ? { etiket: satir.slice(0, i).trim(), govde } : null;
  }
  // konunun adı gövdeye sızdı mı: gövdede geçen ama konusuz çeviride geçmeyen konu kelimeleri
  const soruKonuSizdi = (etiket, govde, yalin) => soruKonuKelime(etiket)
    .filter((w) => soruKonuGecer(w, govde) && !soruKonuGecer(w, yalin));
  // dönüş: { metin, konu, konuDustu? } — konuDustu: 'ayrilmadi' | 'karisti' (konusuz çeviri kullanıldı).
  // ceviren: çeviri işlevi (ürün cevir; modelsiz diş sahte çevirmen verir)
  async function konuluCevir(soru, konu, kaynak, hedef, uzunluk = 80, ceviren = cevir) {
    const yalin = async () => ceviriAyikla(await ceviren(soru, kaynak, hedef, uzunluk));
    const k = String(konu || '').trim();
    if (!k) return { metin: await yalin(), konu: '' };
    if (/[:：]/.test(soru)) return { metin: await yalin(), konu: k, konuDustu: 'ayrilmadi' };
    const ayri = soruKonuAyir(await ceviren(`${k}: ${soru}`, kaynak, hedef, uzunluk + 16), k);
    if (!ayri) return { metin: await yalin(), konu: k, konuDustu: 'ayrilmadi' };
    // konusuz çeviri yalnız konunun bir kelimesi gövdede geçince istenir (çoğu soruda ek çeviri yok)
    if (!soruKonuKelime(ayri.etiket).some((w) => soruKonuGecer(w, ayri.govde))) return { metin: ayri.govde, konu: k };
    const y = await yalin();
    return soruKonuSizdi(ayri.etiket, ayri.govde, y).length ? { metin: y, konu: k, konuDustu: 'karisti' } : { metin: ayri.govde, konu: k };
  }

  // ---- Ö22 ikinci göz (07.11, Özet §45): cevap sorulan duruma mı ait? ----
  // Görülmemiş 30 soruda geçen 7 kötü cevabın 5'i başka durumun paragrafından (yılan sargısı köpeğe, Heimlich dumanlı
  // odaya), biri alakasız köprü cevabıydı (Ankara'nın havası → COVID yasağı). Aynı model, kısa bir hakem sorusuyla:
  // kayıtlı 74 geçen cevapta kötü 7/16 yakalandı, doğruya boş alarm 2/34 (olcum/kopru/ikinci_goz_analiz.cjs, kalıp a).
  // Kalıp ve cevap hazırlığı ölçülenle birebir; değişirse yeniden ölçülür.
  const IKINCI_GOZ = (q, a) => `You check answers of an offline first-aid helper. Read the QUESTION and the ANSWER.
Does the ANSWER talk about the same situation as the QUESTION — the same person (for example baby vs adult), the same event (for example dog bite vs snake bite, smoke vs choking), and the same need?
Reply with exactly one word: YES or NO.

QUESTION: ${q}

ANSWER: ${a}`;
  async function ikinciGoz(soru, cevap) {
    if (!AYAR.ikinciGoz) return [];
    const temiz = kes(String(cevap || '').split(/\s+/).join(' ').trim().replace(/\[[\d,\s]+\]/g, ''), 1200);
    try {
      const icerik = AYAR.kalip === 'sablon' ? await sablonla([{ role: 'user', content: IKINCI_GOZ(soru, temiz) }], 4)
        : String((await (await getir(`${AYAR.sohbet}/completion`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: `<start_of_turn>user\n${IKINCI_GOZ(soru, temiz)}<end_of_turn>\n<start_of_turn>model\n`,
            n_predict: 4, temperature: 0, cache_prompt: true, stop: ['<end_of_turn>'] }),
        })).json()).content || '');
      return /^\W*no\b/i.test(icerik.trim()) ? ['durum: cevap sorulan duruma ait görünmüyor'] : [];
    } catch (e) { return []; }   // hakem yoksa denetim yok
  }

  // ---- Ö25 eylem bekçisi (07.11 öğleden sonra, Özet §46): dar izinli ya da hiç önerilmeyen ilk yardım eylemleri ----
  // İkinci göz (Ö22) yakın durumu göremedi: kırık bacağa kopma turnikesi (K7b), deprem anında koridora yürümek (K14a),
  // köpek ısırığına yılan sargısı (Y06) — konu tuttuğu için hakem "evet" dedi; hakem sorusunun üç başka biçimi de
  // kayıtlı 90 cevapta daha iyi değildi. Bekçi bilgi eklemez, cevabı durdurur: cevabın bir cümlesinde olumsuzluksuz,
  // uyarısız tehlikeli bir eylem geçiyorsa ve soru o eylemin izinli durumunu anmıyorsa. Kurallar görülmüş cevaplardan
  // değil, yaygın ilk yardım bilgisinden yazıldı (Kızılay / Kızıl Haç); diller: kütüphanenin dilleri tr ve en.
  //   kod: sayfadaki açıklamanın anahtarı (METIN.*.eylemAdlari) ·    soru: kural yalnız bu sorularda bakılır (yoksa her soruda) · izin: soru bunu anıyorsa eylem serbest
  //   kisiYok: soruda bu kişi (bebek, gebe) varsa izin olsa da durur · sonraSerbest: "sonra / geçince" diyen cümle serbest
  //   Türkçe kalıplarda ünsüz yumuşaması yazılı: bilinç → bilinci, ilaç → ilacı, ısırık → ısırığı, zehir → zehri (bozma denemesi buldu)
  const EYLEM = [
    { ad: 'turnike', kod: 'turnike',   // sıkı bağ: yalnız durdurulamayan uzuv kanamasında ya da kopmada
      izin: { tr: /(?<!\p{L})(kan|kanı|kana|kanam\p{L}*|kanıyor\p{L}*|kanlı\p{L}*|kopm\p{L}*|kopa[nr]\p{L}*|kopu[kğ]\p{L}*|kopt\p{L}*|amput\p{L}*|uzuv\p{L}*|uzv\p{L}*)(?!\p{L})/u,
        en: /\b(bleed\w*|blood\w*|amputat\w*|sever\w*)/ },
      tr: /turnike|şerit(\s+\p{L}+){0,4}\s+sık|boğma işlem|yara ile kalp arasın|kalp ile yara arasın/u,
      en: /tourniquet|constricting band|between the (wound|bite) and the heart/ },
    // 15.11 akşam (§153, Özet §152'nin açığı): "Kol koptu ne yapmalı" — soru kopmayı andığı için turnikeye izin vardı ve
    // Vikipedi'nin "her yedi dakikada bir … gevşetilerek" cümlesi geçti. Bugünkü kılavuzlar (IFRC 2020, ERC 2021): takılan
    // turnike sağlık görevlisi gelene kadar gevşetilmez. Aralıklı gevşetme izinden bağımsız kendi kuralı oldu (turnike
    // kuralındaki eski hâli buraya taşındı). Sağlık görevlisinin gevşetmesini anlatan cümle hariç.
    // 15.11 akşam (§153, Özet §152'nin açığı): "Kol koptu ne yapmalı" — soru kopmayı andığı için turnikeye izin vardı ve
    // Vikipedi'nin "her yedi dakikada bir … gevşetilerek" cümlesi geçti. Bugünkü kılavuzlar (IFRC 2020, ERC 2021): takılan
    // turnike sağlık görevlisi gelene kadar gevşetilmez. Aralıklı gevşetme izinden bağımsız kendi kuralı oldu (turnike
    // kuralındaki eski hâli buraya taşındı). Fiilin yalnız olumlu biçimleri yazılı ("gevşetmeyin" girmez); bu yüzden kural
    // olumsuz cümlelere de bakar ("saat başı gevşetmeyi unutmayın" olumsuz sayılıyordu). Sağlık görevlisinin işi hariç.
    // hariç: gevşetmeyi sağlık ekibine bırakan cümle ("hastaneye ulaşamayacaksanız … gevşetin" hariç DEĞİL — §153 ikinci set)
    { ad: 'takılan turnikeyi ara ara gevşetmek', kod: 'turnikeGevset', olumsuz: true,
      haric: { tr: /(yalnız|sadece|ancak)\s+(\p{L}+\s+){0,2}(sağlık|doktor|hekim|hastane|ambulans)\p{L}*|(sağlık (görevli|personel|ekib|çalışan)|doktor|hekim|ambulans ekib|hastanede)\p{L}*\s+(\p{L}+\s+){0,3}(gevşet|aç|çöz|çıkar|karar)\p{L}*|(sağlık (görevli|personel|ekib)|ambulans|doktor)\p{L}*\s+(\p{L}+\s+){0,2}(gelene|ulaşana|devralana) kadar/u,
        en: /(only|just) (\w+ ){0,2}(medical|doctors?|paramedics?|hospital|trained)|(medical (staff|personnel|professionals?|team)|paramedics?|doctors?|trained (staff|personnel)|emergency (services|personnel|staff))\b.{0,30}\b(loosen|release|remove|decide)|until (medical|emergency|trained|professional)/ },
      tr: /(dakikada bir|dakika(da)? sonra|saatte bir|saat başı|ara ara|aralıklarla|belirli aralık\p{L}*|zaman zaman|arada bir|(?<!\p{L})her\s+[\p{L}\d–-]+\s+(dakika|saat)\p{L}*)([\s,(–-]+[\p{L}\d]+){0,6}[\s,()–-]+(gevşet(in|iniz|ip|ilip|erek|ilerek|ilmeli\p{L}*|meli\p{L}*|mek|meyi|mesi|ilir|ir|ilmesi|meniz|tikten|ilsin)|arala(yın|yınız|yıp|yarak|mak|mayı|nmalı\p{L}*|nır)|aç(ıp|ın|ınız|ılmalı\p{L}*|arak|mak|mayı|ılır|ılsın)|bırak(ıp|ın|ınız|arak|mak|mayı|ılmalı\p{L}*|ılır)|açık bırak\p{L}*|serbest bırak\p{L}*|(açıl|gevşetil|çözül|bırakıl)ması\p{L}*|gevşetme\s+(yapıl|yapın|gerek)\p{L}*|(açmak|açılmak|gevşetmek|çözmek|bırakmak)\s+gerek\p{L}*|çöz(ün|ünüz|üp|erek|ülmeli\p{L}*|mek|meyi|ülür)|(gevşetil|açıl|bırakıl|çözül|aralan)(ip|ıp|üp|arak|erek|ır|ir|ür|sın|sin|sün))(?!\p{L})|turnike\p{L}*(\s+\p{L}+){0,4}\s+(gevşet(in|iniz|ip|ilip|erek|ilerek|ilmeli\p{L}*|meli\p{L}*|mek|meyi|mesi|ilir|ir|ilmesi|meniz|tikten|ilsin)|arala(yın|yınız|yıp|yarak|mak|mayı|nmalı\p{L}*|nır)|aç(ıp|ın|ınız|ılmalı\p{L}*|arak|mak|mayı|ılır|ılsın)|bırak(ıp|ın|ınız|arak|mak|mayı|ılmalı\p{L}*|ılır)|açık bırak\p{L}*|serbest bırak\p{L}*|(açıl|gevşetil|çözül|bırakıl)ması\p{L}*|gevşetme\s+(yapıl|yapın|gerek)\p{L}*|(açmak|açılmak|gevşetmek|çözmek|bırakmak)\s+gerek\p{L}*|çöz(ün|ünüz|üp|erek|ülmeli\p{L}*|mek|meyi|ülür)|(gevşetil|açıl|bırakıl|çözül|aralan)(ip|ıp|üp|arak|erek|ır|ir|ür|sın|sin|sün))(?!\p{L})|(gevşet(in|iniz|ip|ilip|erek|ilerek|ilmeli\p{L}*|meli\p{L}*|mek|meyi|mesi|ilir|ir|ilmesi|meniz|tikten|ilsin)|arala(yın|yınız|yıp|yarak|mak|mayı|nmalı\p{L}*|nır)|aç(ıp|ın|ınız|ılmalı\p{L}*|arak|mak|mayı|ılır|ılsın)|bırak(ıp|ın|ınız|arak|mak|mayı|ılmalı\p{L}*|ılır)|açık bırak\p{L}*|serbest bırak\p{L}*|(açıl|gevşetil|çözül|bırakıl)ması\p{L}*|gevşetme\s+(yapıl|yapın|gerek)\p{L}*|(açmak|açılmak|gevşetmek|çözmek|bırakmak)\s+gerek\p{L}*|çöz(ün|ünüz|üp|erek|ülmeli\p{L}*|mek|meyi|ülür)|(gevşetil|açıl|bırakıl|çözül|aralan)(ip|ıp|üp|arak|erek|ır|ir|ür|sın|sin|sün))(?!\p{L})(\s+\p{L}+){0,3}\s+turnike\p{L}*|(gevşet(in|iniz|ip|ilip|erek|ilerek|ilmeli\p{L}*|meli\p{L}*|mek|meyi|mesi|ilir|ir|ilmesi|meniz|tikten|ilsin)|arala(yın|yınız|yıp|yarak|mak|mayı|nmalı\p{L}*|nır)|aç(ıp|ın|ınız|ılmalı\p{L}*|arak|mak|mayı|ılır|ılsın)|bırak(ıp|ın|ınız|arak|mak|mayı|ılmalı\p{L}*|ılır)|açık bırak\p{L}*|serbest bırak\p{L}*|(açıl|gevşetil|çözül|bırakıl)ması\p{L}*|gevşetme\s+(yapıl|yapın|gerek)\p{L}*|(açmak|açılmak|gevşetmek|çözmek|bırakmak)\s+gerek\p{L}*|çöz(ün|ünüz|üp|erek|ülmeli\p{L}*|mek|meyi|ülür)|(gevşetil|açıl|bırakıl|çözül|aralan)(ip|ıp|üp|arak|erek|ır|ir|ür|sın|sin|sün))(?!\p{L})(\s+\p{L}+){0,4}\s+(kan dolaşım|dolaşım|kan akış|kanın dolaş|dokulara kan|uzva kan)\p{L}*|(gevşet|aç)\p{L}*([\s,]+\p{L}+){0,5}[\s,]+(yeniden|tekrar)\s+sık\p{L}*|(kan dolaşım|dolaşım|kanın dolaş|dokular\p{L}*|kangren)\p{L}*(\s+\p{L}+){0,6}\s+(gevşet(in|iniz|ip|ilip|erek|ilerek|ilmeli\p{L}*|meli\p{L}*|mek|meyi|mesi|ilir|ir|ilmesi|meniz|tikten|ilsin)|arala(yın|yınız|yıp|yarak|mak|mayı|nmalı\p{L}*|nır)|aç(ıp|ın|ınız|ılmalı\p{L}*|arak|mak|mayı|ılır|ılsın)|bırak(ıp|ın|ınız|arak|mak|mayı|ılmalı\p{L}*|ılır)|açık bırak\p{L}*|serbest bırak\p{L}*|(açıl|gevşetil|çözül|bırakıl)ması\p{L}*|gevşetme\s+(yapıl|yapın|gerek)\p{L}*|(açmak|açılmak|gevşetmek|çözmek|bırakmak)\s+gerek\p{L}*|çöz(ün|ünüz|üp|erek|ülmeli\p{L}*|mek|meyi|ülür)|(gevşetil|açıl|bırakıl|çözül|aralan)(ip|ıp|üp|arak|erek|ır|ir|ür|sın|sin|sün))(?!\p{L})/u,
      en: /loosen\w*( it| the \w+)? every \d+|(periodically|every few minutes|every \d+( ?(to|-|–) ?\d+)? ?(minutes|min|mins|hours?)|every (hour|half hour)|once (an|every|a) (hour|half hour)|hourly|from time to time|at intervals)([\s,]+\w+){0,6}[\s,]+(loosen|release|relax|undo|open|untie)\w*|(loosen|release|relax|undo)\w*(\s+\w+){0,6}\s+(periodically|every few minutes|every \d+( ?(to|-|–) ?\d+)? ?(minutes|min|mins|hours?)|every (hour|half hour)|once (an|every|a) (hour|half hour)|hourly|from time to time|at intervals)|(loosen|release|undo)(s|ing|ed)? (the |a |your )?tourniquet|(loosen|release|relax|undo|untie)(s|ing|ed)?\b.{0,40}(restore|allow|let|return|gets?|receive)\w*.{0,20}(blood|circulation)/ },
    { ad: 'karın baskısı', kod: 'karin',   // Heimlich: yalnız yutulan cisimle tıkanmada, bebekte hiç (bebekte sırta vurma + göğüs baskısı)
      izin: { tr: /boğaz\p{L}*|lokma\p{L}*|(?<!\p{L})yut(tu|muş|kun|an|ar)\p{L}*|nefes borus|soluk borus|yabancı cisim|tıkan\p{L}*|kaçtı|kaçan|kaçmış|takıldı|takılan/u,
        en: /chok\w*|airway|windpipe|throat|lodged|foreign (body|object)|swallow\w*|stuck/ },
      kisiYok: ['bebek', 'gebe'],   // 07.11 X10 (görülmüş): hamilede de karın basısı yerine göğüs basısı
      // 08.11 (§58): Gemma 4 E2B boğulana kaynağın kendi cümlesini yazdı — "göbek deliğinin iki parmak üzerine … yumruk …
      // diyafram yukarı doğru itilir" — eski kalıplar görmedi, tehlikeli cevap geçti (W15)
      tr: /heimlich|karın (bası|baskı|itme)|midenin üst kısm|arkadan sarıl|(göbe|diyafram)\p{L}*(\s+\p{L}+){0,8}?\s+(yumruk\p{L}*|yukarı doğru it\p{L}*)|karn\p{L}*\s+bastır(ın(?!\p{L})|ılır|ılmalı|arak|ıp)/u,
      en: /heimlich|abdominal thrust|(thrust|fist)\w* (just )?above the (navel|belly button)|(push|press)\w* (the )?diaphragm up/ },
    { ad: 'deprem sırasında yer değiştirmek', kod: 'deprem',   // sarsıntıda: çök, kapan, tutun; kapı eşiği, merdiven, dışarı koşmak yok
      soru: { tr: /deprem|sarsıntı|zelzele/u, en: /earthquake|quake|tremor/ },
      izin: { tr: /sonra\p{L}*|geçince|geçtikten|bittikten|bitince|durunca|durduktan|artçı/u, en: /\bafter\w*|once the shaking/ },
      sonraSerbest: true,
      tr: /koridor\p{L}*|kapı (eşi|kasa|boşlu|altı)\p{L}*|merdiven\p{L}*|asansör\p{L}*|dışarı\p{L}*(\s+\p{L}+){0,2}\s+(koş|kaç|fırla)\p{L}*|binayı (terk|boşalt)\p{L}*|pencere\p{L}*den atla/u,
      en: /doorway|door frame|stair\w*|elevator|\blift\b|run (out|outside)|leave the building/ },
    { ad: 'kusturmak', kod: 'kusturma',   // zehirlenmede kendiliğinden kusturulmaz
      soru: { tr: /zehi?r\p{L}*|(?<!\p{L})yut\p{L}*|içti|içmiş|içen|ila[çc]\p{L}*|deterjan|çamaşır suyu|kimyasal|mantar\p{L}*|tablet\p{L}*/u,
        en: /poison\w*|swallow\w*|ingest\w*|overdos\w*|drank|\bate\b|tablets?|detergent|bleach/ },
      tr: /kustur\p{L}*|parma\p{L}*(\s+\p{L}+){0,2}\s+boğaz\p{L}*|tuzlu su içir/u,
      en: /induc\w* (vomit\w*|emesis)|make (\w+ ){0,2}(vomit|throw up)|ipecac/ },
    // 09.11 (F15, 0.18.0 ve 0.19.0 ölçümleri, görülmüş, §86): lavabo açıcı yutan çocuğa susuzluk bölümünden "elma suyu",
    // "ağızdan sıvı çözeltisi içmesini sağlayın" geldi. Yakıcı madde yutulunca sulandırılmaz (su, süt, aktif kömür ancak
    // zehir danışma söylerse). "asit" tek başına alınmaz: asetilsalisilik asit bir ilaçtır.
    { ad: 'yakıcı madde yutana sıvı içirmek', kod: 'yakici',
      soru: { tr: /lavabo açıcı\p{L}*|çamaşır suyu|kostik|yakıcı|kezzap|tuz ruhu|kireç sökücü|fırın temizleyici\p{L}*|pas sökücü|akü asid\p{L}*|tuvalet temizleyici\p{L}*|(bulaşık|çamaşır) makinesi tablet\p{L}*|kapsül deterjan\p{L}*/u,
        en: /drain (cleaner|opener)|bleach|caustic|corrosive|\blye\b|oven cleaner|rust remover|battery acid|hydrochloric|sulph?uric|muriatic|toilet cleaner|(dishwasher|washing machine) tablet|(detergent|laundry) pod/ },
      tr: /(?<!\p{L})(su|suyu|süt|sütü|sıvı|ors|serum|içecek|ayran|yoğurt|aktif kömür|solüsyon\p{L}*)\s+(\p{L}+\s+){0,2}(ver|içir)\p{L}*|(su|süt|ors|serum|sıvı|solüsyon\p{L}*)\s+(\p{L}+\s+){0,2}içmesini sağla\p{L}*/u,
      en: /(give|offer)\w* (\w+ ){0,4}(water|milk|fluids?|liquids?|oral rehydration|ors\b|drinks?|activated charcoal)|(drink|dilut)\w* (\w+ ){0,3}(water|milk|fluids?)/ },
    { ad: 'donmuş yeri ovmak ya da sıcakla ısıtmak', kod: 'donma',   // ılık suyla yavaş ısıtılır; ovulmaz, kar sürülmez, ateşe tutulmaz
      soru: { tr: /(?<!\p{L})don(ma|muş|du|u[kğ])\p{L}*|soğuk (ısırığı|yanığı)/u, en: /frost\w*|frozen/ },   // hipotermide sıcak içecek olağan
      tr: /(?<!\p{L})ov(un|unuz|ul\p{L}*|ala\p{L}*|mak|arak)(?!\p{L})|(?<!kalp\s)masaj|sıcak su\p{L}*|kaynar|ateş\p{L}*(\s+\p{L}+){0,2}\s+(yaklaştır|tut)\p{L}*|soba\p{L}*|alkol\p{L}*/u,
      en: /\brub\w*|(?<!(cardiac|heart)\s)massag\w*|hot water|direct heat|heater|alcohol/ },
    { ad: 'yanığa yağ, macun ya da buz', kod: 'yanik',   // yanık serin akan suyla soğutulur; kabarcık patlatılmaz
      // 09.11 (F26, görülmüş, §86): "his skin was dry and burning" (sıcak çarpması) yanık sayıldı, kaynağın "boyna ve kasığa
      // buz paketi"ni durdurdu → "burning" (yanma hissi, sıcak deri) yanık değildir; burn, burns, burned, burnt yanıktır
      soru: { tr: /(?<!\p{L})(yanı[kğ]\p{L}*|yandı\p{L}*|yanmış\p{L}*|haşlan\p{L}*)/u, en: /\bburn(s|ed|t)?\b|scald\w*/ },
      tr: /tereya\p{L}*|diş macun\p{L}*|yoğurt\p{L}*|salça\p{L}*|yumurta\p{L}*|zeytinyağ\p{L}*|(?<!\p{L})yağ\p{L}*\s+sür\p{L}*|(?<!\p{L})buz(?!\p{L})|(?<!\p{L})buz(la|lu|u|a)(?!\p{L})|kolonya\p{L}*|kabarc\p{L}*(\s+\p{L}+){0,2}\s+(patlat|del)\p{L}*|su toplam\p{L}*(\s+\p{L}+){0,3}\s+(patlat|del)\p{L}*/u,
      en: /butter|toothpaste|\boil\b|grease|\bice\b|egg white|(pop|burst|break)\w* (the )?blisters?/ },
    { ad: 'yılan ısırığını kesmek, emmek ya da buzlamak', kod: 'yilan',
      soru: { tr: /yılan\p{L}*|engerek\p{L}*/u, en: /snake\w*|viper\w*|\badder/ },
      // 15.11 akşam (§153): emme seti / pompası da emmektir (Outdoors'tan "Sawyer seti … zaman kazandırır" geçti, §152)
      tr: /(?<!\p{L})(em(erek|ip|ilmeli|ilir|mek|ilerek|erseniz|ersen|ersek|dikten|ebilirsiniz|melisiniz|meli|elim|ebilir)|emilme\p{L}*|emme yöntem\p{L}*)(?!\p{L})|(emme|vakum|emici)\p{L}*\s+(\p{L}+\s+)?(set|pompa|alet|cihaz|kit|aparat|kab|kap|bardak|şırınga|şişe)\p{L}*|hacamat\p{L}*|zehir\s+pompa\p{L}*|zehi?r\p{L}*\s+(\p{L}+\s+)?(çekil|emil|çıkarıl)\p{L}*|vakum\p{L}*\s+(\p{L}+\s+){0,2}(çek|al|çıkar)\p{L}*|zehir\p{L}*\s+(çekme|emme|çıkarma)\s+(set|pompa|alet|cihaz|kit|aparat)\p{L}*|zehr\p{L}*\s+(\p{L}+\s+){0,2}(dışarı|emerek|çekerek|çek(in|ip))\p{L}*|sawyer|ekstraktör|extractor|aspivenin|ağz\p{L}* ile (em|çek)|(yara|ısırı[kğ]|deri)\p{L}*(\s+\p{L}+){0,2}\s+kes\p{L}*|kesik at\p{L}*|çentik|(?<!\p{L})buz(?!\p{L})|(?<!\p{L})buz(la|lu|u|a)(?!\p{L})|soğuk (kompres|paket|uygula)\p{L}*/u,
      // 09.11 (F10, 0.19.0 ölçümü, görülmüş, §86): model kaynağın "cold compress should not be applied"ını "Apply a cold
      // compress" yazdı, Türkçesi geçti (tehlikeli) — soğuk kompres ve soğuk paket de buzlamaktır
      en: /\bsuck\w*|suction|extractor|venom pump|vacuum (pump|device)|sawyer|aspivenin|incision|cut (into|across|open)|\bice\b|cold (compress|pack)|electric shock/ },
    // 15.11 akşam (§153): "kobra … genellikle antivenin gerektirmez" (Outdoors, §152) — panzehiri ya da hastaneyi gereksiz
    // göstermek kişiyi yolda bekletir. Tehlike cümlenin olumsuzluğunda olduğu için bu kural olumsuz cümlelere de bakar
    // (olumsuz: true); "yanlış / efsane" gibi uyaran cümleler ve kararı hekime bırakan cümleler yine hariç.
    { ad: 'yılan ısırığında panzehiri ya da hastaneyi gereksiz göstermek', kod: 'yilanPanzehir', olumsuz: true,
      soru: { tr: /yılan\p{L}*|engerek\p{L}*/u, en: /snake\w*|viper\w*|\badder/ },
      haric: { tr: /(doktor|hekim|sağlık (personeli|görevlisi|ekibi)|hastanede)\p{L}*(\s+\p{L}+){0,3}\s+(karar|değerlendir|belirle)\p{L}*/u,
        en: /(doctor|physician|medical (staff|team)|clinician)s? (will |can |should )?(decide|determine|assess)/ },
      tr: /(panzehir|antivenin|antivenom|antiserum|serum)\p{L}*([\s(),]+\p{L}+){0,4}[\s(),]+(gerek(mez|miyor|tirmez|meyebilir|li değil|siz)|gerek yok|gerek kalmaz|gerek kalmayabilir|gerek olmayabilir|gereksiz\p{L}*|şart değil|lazım değil|lüzum yok)|(hastane|doktor|hekim|sağlık kuruluş|acil servis)\p{L}*(\s+\p{L}+){0,4}\s+(gerek(mez|miyor|yok)|gerek yok|gerek kalmaz|gerek kalmayacak|gerek kalmayabilir|gerek olmayabilir|gerekmeyebilir|şart değil|lazım değil)|(bekle|dinlen|izle)\p{L}*\s+(\p{L}+\s+){0,2}yeter\p{L}*|gerek(mez|miyor|tirmez)(\s+\p{L}+){0,2}\s+(panzehir|antivenin|antivenom)\p{L}*/u,
      en: /(antivenom|antivenin|anti-venom)s?( is| are)? (not|rarely|seldom|usually not|generally not|often not) (needed|required|necessary)|(don'?t|do not|doesn'?t|does not|rarely|seldom|usually|generally) (\w+ ){0,3}(need|require)\w* (\w+ ){0,2}(antivenom|antivenin|anti-venom|hospital|medical)|no need (to|for) (\w+ ){0,3}(hospital|antivenom|antivenin|doctor|medical)|(hospital|antivenom|antivenin|doctor)\w*( visits?)?( and (a |an )?\w+)? (is|are) (usually |generally |often |mostly )?(unnecessary|not (needed|necessary|required))|(doctor|hospital|antivenom)\w* (is|are)n'?t (necessary|needed|required)|(simply |just )?wait and (watch|see)( at home)?/ },
    { ad: 'nöbette ağza bir şey koymak ya da tutmak', kod: 'nobet',   // nöbette çevre güvenli yapılır, baş korunur, kişi tutulmaz
      soru: { tr: /nöbet\p{L}*|(?<!\p{L})sara(?!\p{L})|saralı|epilep\p{L}*|havale\p{L}*|kasıl\p{L}*/u, en: /seizure\w*|convuls\w*|epilep\w*|\bfits?\b/ },
      tr: /ağz\p{L}*(\s+\p{L}+){0,3}\s+(koy|sok|yerleştir|tıka)\p{L}*|dil\p{L}*\s+(\p{L}+\s+)?(tut|çek)\p{L}*|(kişiyi|hastayı|onu|kol\p{L}*|bacak\p{L}*)\s+(sıkıca|zorla)\s+tut\p{L}*|zaptet\p{L}*|soğan\p{L}*|kolonya\p{L}*/u,
      en: /(put|place|insert|force|stick)\w* (\w+ ){0,3}(in|into|between) (the|their|his|her) (mouth|teeth)|hold (them|him|her|the person) down|restrain\w*|pull\w* (out )?the tongue|\bonion/,
      haric: { tr: /midazolam|diazepam|ila[çc]\p{L}*/u, en: /midazolam|diazepam|medic\w*|drug\w*|buccal/ } },   // ağızdan ilaç (Z30, 07.11)
    { ad: 'burun kanamasında başı geriye yatırmak', kod: 'burun',   // baş öne eğilir, burnun yumuşak yeri sıkılır
      soru: { tr: /burn\p{L}*(\s+\p{L}+){0,2}\s+(kan\p{L}*)|burun kanam\p{L}*/u, en: /nose ?bleed\w*|epistaxis|bleed\w* (from the )?nose/ },
      tr: /baş\p{L}*\s+(\p{L}+\s+)?(geri|geriye|arka\p{L}*|yukarı)\s+(\p{L}+\s+)?(yatır|eğ|at|kaldır)\p{L}*|sırt\p{L}* üst\p{L}* yat\p{L}*/u,
      en: /tilt\w* (\w+ ){0,2}head back|head (tilted )?back|lie (down )?flat/ },
    { ad: 'çocuğa aspirin', kod: 'aspirin',   // çocukta aspirin Reye sendromu riski taşır
      soru: { tr: /çocu[kğ]\p{L}*|bebe[kğ]\p{L}*|ergen\p{L}*/u, en: /child\w*|kids?\b|infant\w*|bab(y|ies)|teen\w*/ },
      tr: /aspirin\p{L}*|asetilsalisilik/u, en: /aspirin|acetylsalicylic/ },
    // 13.11 (§115, J11 görülmüş — hafif kardeş): saplanan cama "yara üzerine baskı uygulayın" geçti. Saplanan cisim
    // çıkarılmaz, üstüne değil ÇEVRESİNE bastırılır. Yalnız saplanma sorularında: sıradan kanamada yaranın üzerine
    // bastırmak doğrudur.
    { ad: 'saplanan cismi çıkarmak ya da üstüne bastırmak', kod: 'saplanan',
      soru: { tr: /saplan\p{L}*|saplı(?!\p{L})|batmış\p{L}*|batan (cam|demir|çivi|bıçak|şiş|tel|kıymık)|içinde (kaldı|duruyor)/u,
        en: /impal\w*|embedded|stuck in (the|his|her|their) (arm|leg|hand|chest|body|wound)|lodged in/ },
      // 13.11 (§116, J11 son düzen): "kanamaya baskı uygulayın" da geçti — saplanma sorusunda "çevresine/etrafına" denmeyen
      // her baskı önerisi durur (haric: o cümlede çevre sözü varsa serbest)
      tr: /(?<!\p{L})(baskı|bastır)\p{L}*|(cam\p{L}*|cism\p{L}*|cisim|bıçak\p{L}*|demir\p{L}*|çivi\p{L}*|parça\p{L}*)\s+(\p{L}+\s+){0,2}(çek\p{L}*\s+)?çıkar(ın|ınız|ılmalı|ılır|ıp|arak)(?!\p{L})/u,
      en: /\bpress\w*|\bpressure\b|(remove|pull out|take out)\w* (\w+ ){0,2}(glass|object|knife|shard)/,
      haric: { tr: /çevre\p{L}*|etraf\p{L}*|kenar\p{L}*|iki yan\p{L}*/u, en: /around|either side|both sides|beside/ } },
    // 13.11 (§116, J23 görülmüş — hafif kardeş): nefes almayan 4 aylık bebeğe "yetişkinlerde başı iyice geriye yatırmak bu
    // durum için bir rehber olabilir". Bebekte baş nötr tutulur, iyice geriye yatırılmaz (soluk yolu kıvrılır).
    { ad: 'bebekte başı iyice geriye yatırmak', kod: 'bebekbas',
      soru: { tr: /bebe[kğ]\p{L}*|(?<!\p{L})\d+\s*(aylık|haftalık)(?!\s*(hamile|gebe))|yenidoğan\p{L}*/u,
        en: /\b(bab(y|ies)|infants?|newborns?|\d+[- ]month[- ]old)\b/ },
      tr: /baş\p{L}*\s+(\p{L}+\s+){0,2}(iyice|tamamen|sonuna kadar|fazla|tam)\s+geri\p{L}*\s+(\p{L}+\s+)?(yatır|eğ|it|çek)\p{L}*/u,
      en: /tilt\w* (the |their |his |her )?head (fully |all the way |far |well )back|hyperextend\w*/,
      haric: { tr: /hafif\p{L}*|nötr|düz pozisyon/u, en: /gently|slightly|neutral/ } },
    // 13.11 (§116, J20 görülmüş): efor sırasında "başımın arkasında bir şey patladı", "hayatımda yaşamadığım" ağrı →
    // bel ağrısı bölümünden "ağrı kesici (parasetamol, ibuprofen) almasına yardım edin" geçti; ikinci göz 0.25.0'da
    // durdurmuş, 0.26.0'da neredeyse aynı cevabı geçirmişti (modele bağlı yargı). Ani ve çok şiddetli baş ağrısı acil
    // yardım ister (kitap: Headache); ağrı kesiciyle geçiştirilmez.
    { ad: 'ani ve çok şiddetli baş ağrısına ağrı kesici', kod: 'basagrisi',
      soru: { tr: /(baş|başım|başın|kafam|ense)\p{L}*[^.?!]{0,60}(patla\p{L}*|vurul\p{L}*)|(aniden|birden|bir anda|ansızın)[^.?!]{0,60}(baş\p{L}*\s+ağrı\p{L}*|başım\p{L}*)|(hayatım\p{L}*|ömrüm\p{L}*)[^.?!]{0,60}(en şiddetli|en kötü|yaşamadığım|görmediğim)[^.?!]{0,40}ağrı|(en şiddetli|en kötü|yaşamadığım)[^.?!]{0,30}baş\p{L}*\s+ağrı/u,
        en: /(thunderclap|worst headache|sudden (and )?severe headache|headache (came on|started) suddenly|something (burst|exploded) in (my|his|her) head)/ },
      // "parasetamol … etkili olabilir" da öneridir (§116, hafif kardeş J20)
      // fiil ekleri yazılı: "alt grupları" (al…), "içinde" ve "için" (iç…) fiil değil (§116 bozma denemesi buldu)
      tr: /(ağrı kesici|parasetamol|ibuprofen|aspirin|naproksen|diklofenak)\p{L}*(\s+\p{L}+){0,6}\s+(al(ın|ınız|abilir\p{L}*|malı\p{L}*|man\p{L}*|mas\p{L}*|sın)?|iç(iniz|ebilir\p{L}*|meli\p{L}*|men\p{L}*|mes\p{L}*|sin)?|ver(in|iniz|ebilir\p{L}*|ilebilir\p{L}*|meli\p{L}*|ilmeli\p{L}*|men\p{L}*|mes\p{L}*)?|kullan(ın|ınız|abilir\p{L}*|ılabilir\p{L}*|malı\p{L}*|ılmalı\p{L}*|man\p{L}*|mas\p{L}*)?)(?!\p{L})|(ağrı kesici|parasetamol|ibuprofen)\p{L}*[^.]{0,60}(almasına|içmesine|kullanmasına) yardım|(ağrı kesici|parasetamol|ibuprofen|antiinflamatuar|anti-inflamatuar)\p{L}*[^.]{0,80}(etkili ol|rahatlat|hafiflet|iyi gel|işe yar)\p{L}*/u,
      en: /(take|give|offer|use)\w* (\w+ ){0,4}(painkillers?|pain relief|paracetamol|acetaminophen|ibuprofen|aspirin)|(painkillers?|paracetamol|ibuprofen)\w* (\w+ ){0,3}(may|can|should) (be taken|help)/ },
    { ad: 'bilinçsize ya da inme geçirene ağızdan bir şey vermek', kod: 'bilincsiz',   // inme: yutma bozulur (07.11 X29, görülmüş)
      soru: { tr: /bilin[çc]\p{L}*\s+(kapalı|yok|kayb\p{L}*|gitti\p{L}*)|bilinçsiz\p{L}*|baygın\p{L}*|kendinde değil|tepki vermiyor|(?<!\p{L})inme(?!\p{L})|inme (geçir|şüphe)\p{L}*|felç\p{L}*|beyin kanam\p{L}*/u,
        en: /unconscious\w*|unresponsive|passed out|(?<!(heat|sun)\s)\bstroke|brain (bleed|haemorrhage|hemorrhage)/ },
      sonraSerbest: true,
      tr: /(su|suyu|sıvı|ila[çc]\p{L}*|yiyece[kğ]\p{L}*|yemek|şeker\p{L}*|şerbet|çay|kahve|alkol\p{L}*)\s+(\p{L}+\s+)?(ver|içir|yedir)\p{L}*/u,
      en: /(giv|offer)\w* (\w+ ){0,2}(water|food|drinks?|fluids|liquids|anything|sugar)|\bdrink\w* (\w+ ){0,2}(water|liquids|fluids)|(water|drinks?|fluids|liquids)[\s,]+(\w+[\s,]+){0,3}(may|can|should) be (used|given|offered|drunk)/ },
    // 14.11 (§129): görülmemiş P setinin yakın durum çiftleri (gerçek kütüphane; P artık görüldü). Kurallar yaygın ilk yardım
    // bilgisinden (Kızılay / Kızılhaç / ERC), yalnız soru o durumu açıkça anlatınca bakılır. Dürüst ölçüsü sonraki görülmemiş set.
    // P12: hareketsizlikten sonra tek bacakta şişlik + kızarıklık + ağrı = bacakta pıhtı olabilir; kompartman sendromu bölümünden
    // "ısıtmak gevşetir" geçti. Pıhtılı bacak ovulmaz, ısıtılmaz; aynı gün doktor.
    { ad: 'hareketsizlikten sonra şişen bacağa masaj ya da ısı', kod: 'pihti',
      soru: { tr: /^(?=[\s\S]*(baldır|bacak|bacağ)\p{L}*[\s\S]{0,80}(şiş|kızar)\p{L}*)(?=[\s\S]*(hareketsiz|kıpırda|yatıyor|yatıyorum|yatalak|yatağa bağlı|uzun (yol|uçuş|otobüs)|ameliyat|doğum(dan)? sonra|çadırda yat)\p{L}*)/u,
        en: /^(?=[\s\S]*\b(calf|leg)\b[\s\S]{0,80}\b(swollen|swelling|red)\w*)(?=[\s\S]*\b(immobil\w*|bed ?rest|bedridden|lying (still|in bed)|long (flight|drive|trip|journey)|after (an )?(operation|surgery|childbirth|giving birth)|not moving)\b)/ },
      tr: /masaj\p{L}*|ovala\p{L}*|(?<!\p{L})ov(un|ma|arak|uştur)\p{L}*|ısıt\p{L}*|ısı (uygula|ver)\p{L}*|sıcak (uygula|kompres|su torba|havlu|tut)\p{L}*|esnet\p{L}*/u,
      en: /massag\w*|\brub\w*|\bheat\w*|\bwarm\w* (\w+ ){0,2}(leg|calf|area|compress)|heating pad|hot (pack|compress|water bottle)|\bstretch\w*/ },
    // P15: akut glokom (ani şiddetli göz ağrısı, kızarıklık, ışık çevresinde halka, bulantı) — göz nezlesi bölümünden "çay poşeti
    // kompresi geçici rahatlatabilir" geçti, sabahı beklememek söylenmedi. Saatler içinde kalıcı görme kaybı: hemen acil.
    { ad: 'ani şiddetli göz ağrısını kompresle geçiştirmek ya da sabahı beklemek', kod: 'glokom',
      // ağrı GÖZDE (göz … ağrı yakın): "baş ağrısı … gözlerim bulanık" (G08, gebelikte) bu kural değil
      soru: { tr: /^(?=[\s\S]*göz\p{L}*[^.?!]{0,40}(ağrı|ağrıy|sızl)\p{L}*)(?=[\s\S]*(hale|halka|halkalar|bulanık|bulan(dı|ıyor)|kus|ışıkların etrafında)\p{L}*)/u,
        en: /^(?=[\s\S]*(\beyes?\b[^.?!]{0,40}\b(pain\w*|hurts?|aching)\b|\b(pain|ache)\w* in (my|his|her|the|one) eyes?\b))(?=[\s\S]*\b(halos?|rings? around (the )?lights|blurr\w*|nause\w*|vomit\w*)\b)/ },
      tr: /kompres\p{L}*|çay poşet\p{L}*|(sabah\p{L}*|yarın\p{L}*)[^.]{0,40}(bekle|kadar)\p{L}*|(evde )?bekle(yin|yebilir\p{L}*|mek yeter\p{L}*|yip gör\p{L}*)/u,
      en: /compress\w*|tea ?bags?|wait\w* (until|till) (the )?(morning|tomorrow)|wait and see|warm (water|cloth|towel)/ },
    // P21: diş çekiminden sonra aynı gün süren kanamaya "tuzlu suyla çalkalamak yardımcı olabilir" — pıhtı düşer, kanama artar.
    // İlk gün çalkalanmaz, tükürülmez, pipet kullanılmaz; gazlı bez ısırılır. "24 saat sonra çalkalayın" serbest (sonraSerbest).
    { ad: 'diş çekiminden sonra ilk gün ağzı çalkalamak, tükürmek ya da pipet', kod: 'dis',
      soru: { tr: /^(?=[\s\S]*diş\p{L}*[\s\S]{0,40}(çek|çıkar)\p{L}*)(?=[\s\S]*kan\p{L}*)/u,
        en: /^(?=[\s\S]*\b(tooth|teeth|wisdom)\b[\s\S]{0,40}\b(extract\w*|pulled|removed|out)\b|[\s\S]*\bextraction\b)(?=[\s\S]*\bbleed\w*)/ },
      sonraSerbest: true,
      tr: /çalkala\p{L}*|gargara\p{L}*|tükür\p{L}*|pipet\p{L}*|ağ[zı]\p{L}*\s+(\p{L}+\s+){0,2}(yıka|temizle)\p{L}*/u,
      en: /\brins\w*|mouthwash|gargl\w*|\bspit\w*|\bstraws?\b|\bswish\w*/ },
    // P25 (hafif kardeş): yangında kolu sıcak kapı + kapının altından duman → yangın kapısı makalesinden "en hızlı tahliye";
    // kapıyı açmamak, altını tıkamak, 112 yok. Sıcak kapının arkasında ateş ya da yoğun duman olabilir.
    { ad: 'yangında kolu sıcak kapıyı açmak ya da dumanlı merdivenden kaçmak', kod: 'sicakkapi',
      soru: { tr: /^(?=[\s\S]*(kapı|kapının|kolu|tokma)\p{L}*[\s\S]{0,40}(sıcak|ısın|kızgın|yanıyor)\p{L}*)(?=[\s\S]*(yangın|duman|alev)\p{L}*)/u,
        en: /^(?=[\s\S]*\b(door|handle|knob)\w*[\s\S]{0,40}\b(hot|warm)\b)(?=[\s\S]*\b(fire|smoke|flames?)\b)/ },
      tr: /kapı\p{L}*\s+(\p{L}+\s+){0,2}aç\p{L}*|merdiven\p{L}*[^.]{0,40}(in|koş|kaç|çık)\p{L}*|(binayı|daireyi|evi)\s+(hemen\s+)?(terk|boşalt)\p{L}*|tahliye\p{L}*|dışarı(ya)? (çık|kaç|koş)\p{L}*/u,
      en: /open\w* (\w+ ){0,2}door|(run|go|escape|evacuat)\w* (\w+ ){0,3}(stairs|outside|out of the building)|leave the building|evacuat\w*/ },
    // 15.11 akşam (§153): "Yangın çıkarsa nereye kaçmalıyım?" — Outdoors'tan "yangın bariyerlerine (yollar, tepe üstleri …)"
    // geçti (§152). Yangın yokuş yukarı hızlanır, sırt ve tepe kaçış yeri değildir (kaçış: yokuş aşağı, yanmış alan, açıklık).
    // Ercan 15.11: "eğer tepe kayılıksa mesela Norveç gibi bir yerde çözüm doğru ama Karadeniz Türkiye gibi bol ormanlık ise
    // cevap hatalı" — bağlama göre doğru: yanacak bir şey olmayan (kayalık, ağaçsız) tepe kaçış yeri olabilir. Heybe yeri
    // bilmez; koşulsuz "tepeye kaç" durur, koşulu cümlede söyleyen geçer (haric).
    { ad: 'yangında yokuş yukarı, sırta ya da tepeye kaçmak', kod: 'yanginYukari',
      haric: { tr: /kayalık\p{L}*|ağaçsız\p{L}*|bitkisiz\p{L}*|çıplak\p{L}*|bitki örtüsü\p{L}*\s+(olmayan|yok)|yanacak (bir şey|madde\p{L}*)\s+(olmayan|yok)|yanıcı (madde|bitki)\p{L}*\s+(olmayan|yok)|(?<!\p{L})(ateş|yangın|alev|duman|sıcak hava|ısı)(ler|lar)?(\s+\p{L}+){0,3}\s+(yokuş yukarı|yukarı|tepeye|sırta|yamaçtan yukarı)(\s+\p{L}+){0,5}\s+(ilerl|tırman|çıkar|yüksel|yayıl|hızlan|gid|koş|gel)(er|ar|ir|ır|ur|ür|iyor|ıyor|uyor|üyor|erken|arken|irken|ırken)?(?!\p{L})|en tehlikeli|ölüm tuzağı/u,
        en: /\brocky\b|\bbare (rock|ground|soil)|treeless|no (fuel|vegetation)|without (fuel|vegetation)|above the tree ?line|nothing (left )?to burn|(fire|flames?|smoke|heat)\s+(\w+\s+){0,3}(travel|move|spread|run|climb|burn|rise|go|race)(s|es)?\b.{0,30}\b(uphill|upslope|up the|toward the ridge)|puts? you in (its|the fire'?s?) path|most dangerous|death trap/ },
      soru: { tr: /yangın\p{L}*|(?<!\p{L})alev\p{L}*|(?<!\p{L})ateş\p{L}*(?!\s+(ed|aç)\p{L}*)|(?<!\p{L})duman\p{L}*|(?<!\p{L})yan(ıyor|ıyo|dı|ıp|maya|ma)\p{L}*/u, en: /\bfires?\b|wildfire|bushfire|forest fire|\bblaze|\bflames?\b|\bsmoke\b/ },
      tr: /(tepe\p{L}*|zirve\p{L}*|sırt(a|lara|ın)(?!\p{L}))\s+(doğru|üst\p{L}*|başı\p{L}*)|(yamaç|yamac)\p{L}*\s+(\p{L}+\s+)?(yukarı|üst\p{L}*)|(tepe\p{L}*|zirve\p{L}*|sırt(a|lara|ı|ın)(?!\p{L})|yamaç\p{L}*|yamac\p{L}*)\s+(\p{L}+\s+){0,2}((çık|kaç|koş|tırman|git|ilerle|yönel|uzaklaş|yürü|sığın|geç|var|ulaş)(ın|ınız|un|unuz|abilirsiniz|ebilirsiniz|malısınız|melisiniz|malı|meli|mak|mek|mayı|meyi|maya|meye|ıp|ip|up|arak|erek|ılmalı|ilmeli|ılması|ilmesi|ılır|ilir|tım|tik|tık|dım|dık|ın\.|)|gid(in|iniz|ip|erek|ilmeli))(?!\p{L})|yokuş yukarı\s+(\p{L}+\s+)?((çık|kaç|koş|tırman|git|ilerle|yönel|uzaklaş|yürü|sığın|geç|var|ulaş)(ın|ınız|un|unuz|abilirsiniz|ebilirsiniz|malısınız|melisiniz|malı|meli|mak|mek|mayı|meyi|maya|meye|ıp|ip|up|arak|erek|ılmalı|ilmeli|ılması|ilmesi|ılır|ilir|tım|tik|tık|dım|dık|ın\.|)|gid(in|iniz|ip|erek|ilmeli))(?!\p{L})|yukarı(ya)?[\s,]+((doğru|yönde|yöne)\s+)?(\p{L}+\s+)?((çık|kaç|koş|tırman|git|ilerle|yönel|uzaklaş|yürü|sığın|geç|var|ulaş)(ın|ınız|un|unuz|abilirsiniz|ebilirsiniz|malısınız|melisiniz|malı|meli|mak|mek|mayı|meyi|maya|meye|ıp|ip|up|arak|erek|ılmalı|ilmeli|ılması|ilmesi|ılır|ilir|tım|tik|tık|dım|dık|ın\.|)|gid(in|iniz|ip|erek|ilmeli))(?!\p{L})|(tepe|zirve|sırt)\p{L}*([\s,]+\p{L}+){0,6}[\s,]+güvenli\s+(yer|nokta|bölge|alan|toplanma)\p{L}*|(en\s+)?üst\s+(nokta|kat)\p{L}*[\s,]+(\p{L}+[\s,]+){0,2}((çık|kaç|koş|tırman|git|ilerle|yönel|uzaklaş|yürü|sığın|geç|var|ulaş)(ın|ınız|un|unuz|abilirsiniz|ebilirsiniz|malısınız|melisiniz|malı|meli|mak|mek|mayı|meyi|maya|meye|ıp|ip|up|arak|erek|ılmalı|ilmeli|ılması|ilmesi|ılır|ilir|tım|tik|tık|dım|dık|ın\.|)|gid(in|iniz|ip|erek|ilmeli))(?!\p{L})|(çatı|teras)\p{L}*\s+(\p{L}+\s+)?((çık|kaç|koş|tırman|git|ilerle|yönel|uzaklaş|yürü|sığın|geç|var|ulaş)(ın|ınız|un|unuz|abilirsiniz|ebilirsiniz|malısınız|melisiniz|malı|meli|mak|mek|mayı|meyi|maya|meye|ıp|ip|up|arak|erek|ılmalı|ilmeli|ılması|ilmesi|ılır|ilir|tım|tik|tık|dım|dık|ın\.|)|gid(in|iniz|ip|erek|ilmeli))(?!\p{L})|yüksek (bir )?(yer|nokta|alan|tepe|zemin)\p{L}*(\s+\p{L}+){0,2}\s+((çık|kaç|koş|tırman|git|ilerle|yönel|uzaklaş|yürü|sığın|geç|var|ulaş)(ın|ınız|un|unuz|abilirsiniz|ebilirsiniz|malısınız|melisiniz|malı|meli|mak|mek|mayı|meyi|maya|meye|ıp|ip|up|arak|erek|ılmalı|ilmeli|ılması|ilmesi|ılır|ilir|tım|tik|tık|dım|dık|ın\.|)|gid(in|iniz|ip|erek|ilmeli))(?!\p{L})/u,
      en: /ridge ?tops?|hill ?tops?|top of (the|a) (hill|ridge|mountain|slope)|\bupslope\b|(run|go|head|climb|move|get|escape|flee|walk|hike)\w* (\w+ ){0,3}(uphill|up the (hill|slope|ridge|mountain)|high ground|higher ground|the hill|a hill|the ridge|a ridge|the summit|the top|the highest (point|ground|spot|place)|the roof)|\bsummits?\b|(ridges?|ridge ?tops?|hill ?tops?|summits?)\b.{0,40}\bsafe/ },
  ];
  // karşıtlık bağlacı: yan cümleler ayrı tartılır (§129, P15)
  // §153: virgülle eklenen yasak da ayrı tartılır — "hemen yukarı çıkın, sakın aşağıda kalmayın" tümüyle uyarı sayılıyordu
  // gerekçe yan cümlesi de ayrı ("…zirveye varın, orada alevler size ulaşmaz" — olumsuzluk gerekçede, önerinin değil)
  const KARSIT = { tr: /,?\s+(?:ancak|ama|fakat|lakin|yine de|ne var ki)\s+|,\s+(?=(?:sakın|asla|orada|böylece|çünkü|zira)\s)/u, en: /,?\s+(?:but|however|although|though|yet)\s+|,\s+(?=(?:never|do not|don't|there|so|because)\s)/ };
  // "sonra / kendine gelince" — eylem o cümlede sonraki an için söyleniyor
  const SONRA = { tr: /sonra\p{L}*|geçince|geçtikten|bittikten|bitince|durunca|durduktan|kendine gel\p{L}*|ayıl\p{L}*|uyan\p{L}*/u,
    en: /\bafter\w*|\bonce\b|when (the shaking|they wake|they are awake)|regain\w*/ };
  // uyaran cümle ("kusturmak yanlıştır", "eskiden önerilirdi") eylemi önermez
  // "X yerine Y" X'i önermez (07.11 X10: "chest thrusts instead of abdominal thrusts")
  // 15.11 akşam (§153): "ısırık yerine emme kabını yerleştirin" — "yerine" burada yer bildirir ("o yere"), "X yerine Y" değil
  // §155: eski bilgiyi aktaran cümle de uyarıdır ("askerde … açın diyorlardı ama o bilgi eskidi", "geçmişte … tavsiye edilmiş")
  const UYARI = { tr: /yanlış|zararlı|tehlikeli|önerilmez|sakınca\p{L}*|kaçın\p{L}*|yasak|asla|efsane|halk arasında|eskiden|geçmişte|eskidi|eskimiş|diyorlard\p{L}*|derlerdi|denirdi|söylenirdi|önerilirdi|tavsiye edilirdi|öğretilirdi|(?<!\p{L})(?<!(ısırık|ısırığın|ısırılan|yara|yaranın|sokma|sokulan|kesik|yanık|iğne|şişlik|şişen|ağrıyan|kanayan|kırık|incinen|burkulan)\s+)yerine(?!\p{L})/u,
    en: /wrong|harmful|dangerous|myth|outdated|no longer|discourag\w*|contraindicat\w*|never|should be avoided|old advice|instead of|rather than|older (manuals|guidance|guidelines|advice|books|texts)|used to (recommend|advise|say|tell)|was once (recommended|advised)|in the past/ };   // §153: "Older manuals told you to release…"
  // olumsuz KOŞUL olumsuzluk sayılmaz ("ulaşılamıyorsa", "if the person cannot cough, …") — eylem bekçisi ve aktarma denetimi
  const KOSULSUZ = {
    // 15.11 akşam (§153): kişi ekli biçim de koşul — "Araçla yola çıkamıyorsanız … sırta çıkın" olumsuz sayılıp öneri geçiyordu
    // §153 dördüncü set: acele bildiren olumsuz emir yasak değil ("sırta varana kadar durmayın" = devam edin).
    // "beklemeyin" denendi, çıkarıldı: göz ağrısı kuralında tehlikeli eylem beklemenin kendisi ("sabahı beklemeyin" gerçek yasak)
    tr: (m) => m.replace(/\p{L}*(m[ıiuü]yors[ae]|m[ae]zs[ae]|m[ae]d[ıi]ys[ae])(n[ıiuü]z|m|k|n)?(?!\p{L})|(?<!\p{L})(yoksa|değilse)(?!\p{L})|\p{L}+m[ae](mak|mek|ması|mesi)\s+için|(?<!\p{L})(durma(y[ıi]n|y[ıi]n[ıi]z|dan)|vazgeçme(yin|yiniz|den)|vazgecme(yin|yiniz|den)|duraksama(y[ıi]n|dan)|tereddüt etme(yin|den)|(vakit|zaman) kaybetme(yin|den))(?!\p{L})/gu, ' '),
    en: (m) => m.replace(/\b(if|when|unless)\b[^,;.]*?\b(not|cannot|unable|no)\b[^,;.]*[,;]|\b(if|when)\b[^,;.]*?n't\b[^,;.]*[,;]|\b(don'?t|do not) (stop|hesitate)\b|without (stopping|delay)/g, ' '),
  };
  function eylemDenetle(soru, cevap, dil) {
    if (dil !== 'tr' && dil !== 'en') return [];
    const kc = (m) => (dil === 'tr' ? kucuk(m) : m.toLowerCase());
    const q = kc(String(soru || ''));
    const kisi = kisiler(soru, dil) || new Set();
    // birim: cümle; "Yapılmaması gerekenler:" başlığının altındaki maddeler ve "Yapma: …" satırı uyarıdır, öneri değil
    // 08.11 (§58): olumsuz KOŞUL uyarı değildir — "yabancı maddeye ulaşılamıyorsa … diyafram yukarı doğru itilir" cümlesi
    // olumsuz sayılıp atlandı, boğulana karın basısı geçti (W15). Koşul eki sayılmadan önce silinir; asıl uyarı ("vermeyin") kalır.
    const kosulsuz = KOSULSUZ[dil];
    const uyaran = (m) => OLUMSUZ_SAY[dil](kosulsuz(m)) > 0 || UYARI[dil].test(m);
    const birimler = [], hamBirimler = [];   // ham: olumsuz cümleler de (olumsuz: true kurallar — tehlike olumsuzluğun kendisinde)
    let uyaranBaslik = false;
    for (const ham of String(cevap || '').replace(/\[[\d,\s]+\]/g, '').split(/\r\n|\r|\n/)) {
      const madde = /^\s*([*•\-–]|\d+[.)])\s+/.test(ham);
      const satir = kc(ham.replace(/^[\s*•\-–]+/, '').replace(/^\d+[.)]\s+/, '').trim());
      if (!satir) continue;
      if (/:\s*$/.test(satir)) { uyaranBaslik = uyaran(satir); continue; }
      if (!madde) uyaranBaslik = false;
      if (uyaranBaslik) continue;
      const iki = satir.indexOf(':');
      if (iki > 0 && iki < 80 && uyaran(satir.slice(0, iki))) continue;
      // 14.11 (§129): karşıtlık bağlacından da bölünür — "çay poşeti kompresi rahatlatabilir, ancak nedeni ele almaz" (P15)
      // cümlesindeki "almaz" bütün cümleyi uyarı saydırıyor, öneri geçiyordu. Her yan cümle ayrı tartılır.
      // 15.11 akşam (§153): noktalı virgül de sınır — "Vadide kalmak tehlikelidir; … zirveye doğru çıkın" uyarı sayılıyordu
      for (const c of satir.split(/(?<=[.!?;])\s+/)) for (const y of c.split(KARSIT[dil])) {
        if (!y.trim()) continue;
        if (!uyaran(y)) birimler.push(y);
        if (!UYARI[dil].test(y)) hamBirimler.push(y);
      }
    }
    const sorun = [];
    // §153: soru Türkçe harfsiz yazılmışsa ("yilan isirdi") soru ve izin kalıpları katlanmış biçimle de bakılır
    const harfsiz = dil === 'tr' && !TR_HARF.test(String(soru || '')), qk = harfsiz ? harfKatla(q) : q;
    const soruda = (re) => re[dil].test(q) || (harfsiz && katlaDerin(re[dil]).test(qk));
    for (const k of EYLEM) {
      if (k.soru && !soruda(k.soru)) continue;
      if (k.izin && soruda(k.izin) && !(k.kisiYok && k.kisiYok.some((x) => kisi.has(x)))) continue;
      // §153 dördüncü set: forum cevabı da Türkçe harfsiz olabilir ("ara ara gevsetme yapilmali") — cümlede Türkçe harf yoksa
      // kural ve istisnası katlanmış biçimle bakar. Olumsuz cümlelere de bakan kuralda eşleşmeden SONRA gelen olumsuzluk
      // ("Turnike açmak sizin iş değil") öneriyi düşürür; "… gevşetmeyi unutmayın" olumsuz sayılmaz.
      const bulunan = (k.olumsuz ? hamBirimler : birimler).find((b) => {
        const harfsizB = dil === 'tr' && !TR_HARF.test(b), bb = harfsizB ? harfKatla(b) : b;
        const R = harfsizB ? katlaDerin(k[dil]) : k[dil];
        const m = bb.match(R);
        if (!m) return false;
        if (k.sonraSerbest && SONRA[dil].test(b)) return false;
        if (k.haric && (harfsizB ? katlaDerin(k.haric[dil]) : k.haric[dil]).test(bb)) return false;
        const sonrasi = bb.slice(m.index + m[0].length).split(/\s+(?:ve|ama|ancak|fakat|and|but)\s+|[;)]/u)[0];
        if (k.olumsuz && OLUMSUZ_SAY[dil](KOSULSUZ[dil](sonrasi.replace(/unutma\p{L}*|forget\w*/gu, ' '))) > 0) return false;
        return true;
      });
      if (bulunan) sorun.push(`eylem: ${k.ad}`);
    }
    return sorun;
  }

  // ---- 14.11 (§133) acil belirti kartı — Ercan: "Acil belirti kartı". Soruyu soranın KENDİ SÖZLERİNDE şu anda acil
  //      yardım gerektiren bir belirti varsa Heybe cevap yazmaz: önce acil numarayı, sonra kaynakları gösterir. Neden:
  //      kötü cevapların çoğu doğru kaynağın yanlış durumdan gelen sayfası (§132: su zehirlenmesine susuzluk bölümünden
  //      "bol sıvı", baş çarpmasından günler sonra uykulu yaşlıya hafif darbe notundan "dinlensin") — sayfa seçimine
  //      bağlı her bekçi aynı sayfanın içinden bakıyor. Kart sayfaya bakmaz, soruya bakar.
  //      Belirtiler IFRC 2020 ilk yardım kılavuzunun "acil sağlık hizmetine başvur" (access EMS) ölçütlerinden; gebelik
  //      tehlike işaretleri yaygın kılavuz bilgisinden. Kalıplar görülmüş cevaplardan değil, bu listeden yazıldı; hüküm
  //      görülmemiş T setiyle (§133). Diller: tr ve en kendi sözüyle; öbür dillerde soru çevirmenle İngilizceye çevrilip bakılır.
  //      Şu anki durum değilse kart çıkmaz: belirtinin olmadığı ("ateşi yok"), geçtiği ("geçti"), koşullu ("olursa"),
  //      bilgi sorusu ("belirtileri nelerdir"), mecaz ("gülmekten nefesim kesildi"), neredeyse ("bayılacaktım").
  const ACIL_BELIRTI = [
    { kod: 'nefes',
      tr: /(?<!\p{L})(nefes|solu[kğ])\p{L}*\s+(\p{L}+\s+)?(al(a|e)m[ıi]y\p{L}*|alam\p{L}*|almakta zorlan\p{L}*|almakta güçlük\p{L}*|dar(al|lı)\p{L}*|kesil\p{L}*|tıkan\p{L}*|yetmi\p{L}*)|(?<!\p{L})(nefes darlığ|solunum (güçlüğ|sıkıntı|durm|yetmez))\p{L}*|(?<!\p{L})(nefes almıyor|solumuyor)|(?<!\p{L})(dudak|dil|tırnak|ağz\p{L}* çevres|yüz)\p{L}*\s+(\p{L}+\s+)?(mor|mavi|lacivert|morar|morumsu)\p{L}*/u,
      en: /\b(can'?t|cannot|unable to|struggling to|fighting to|trouble|difficulty|hard to|problems?)\s+(breath\w*|get(ting)? (his|her|my|their)? ?breath|catch(ing)? (his|her|my|their) breath)|short(ness)? of breath|gasping|(isn'?t|not|stopped) breathing|(lips?|face|tongue|mouth) (is |are |look(s|ing)? |went |gone |turn(ed|ing)? )?(blue|purple|grey|gray|bluish)|turning blue/ },
    // §203 (18.11): "bilinci yok" kaçıyordu (TC084 "Komşumuz merdivenden düştü, bilinci yok ama nefes alıyor" — İngilizcesini kalıp yakaladı, Türkçesini yalnız hakem)
    { kod: 'bilinc',
      tr: /(?<!\p{L})bilin[cç]\p{L}*\s+(kapa|kayb|bulan|gid|yok|yerinde değil|açık değil)\p{L}*|(?<!\p{L})kendine\s+(gelmi?y\p{L}*|gelem\p{L}*|gelmedi\p{L}*)|uyandır(am|amı)\p{L}*|(?<!\p{L})uyanmı?yor\p{L}*|(tepki|cevap|karşılık)\s+vermi?yor\p{L}*|(?<!\p{L})(kafası|aklı)\s+karış\p{L}*|(?<!\p{L})kafam\s+(çok\s+)?karışık\s+gibi|laf\p{L}*\s+(birbirine\s+)?karış\p{L}*|(?<!\p{L})(saçmal|sayıkl)\p{L}*|(kimseyi|bizi|beni|annesini|babasını)\s+tanımı?yor\p{L}*|(aşırı|çok|anormal|tuhaf)\s+(uykulu|uyuşuk|durgun)\p{L}*|(?<!\p{L})uyuşuk\p{L}*|(?<!\p{L})gözler\p{L}*\s+(kay|dön)\p{L}*|(?<!\p{L})baygın\p{L}*/u,
      en: /unresponsive|unconscious|(won'?t|can'?t|couldn'?t|doesn'?t|isn'?t|not) (wake|waking|respond\w*)|confus\w*|disoriented|not making sense|talking nonsense|(very|unusually|extremely|really) (drowsy|sleepy|lethargic)|lethargic|floppy|doesn'?t recogni[sz]e/ },
    { kod: 'gogus',
      tr: /(?<!\p{L})göğ(üs|s)\p{L}*\s+(\p{L}+\s+){0,2}(ağrı|ağır|sıkış|bastır|baskı|bası|yanma|batma|batıyor|ezil|daral|sıkıl|otur|çök|basınç)\p{L}*|(?<!\p{L})göğ(üs|s)\p{L}*.{0,30}(fil|taş|mengene)(?!\p{L})|kalp krizi (geçir|ol)\p{L}*|(kol|çene|sırt)\p{L}*\s+(\p{L}+\s+)?(vuran|yayılan)\s+(bir\s+)?ağrı/u,
      en: /chest (pain|pressure|tightness|is tight|feels tight|hurts|discomfort|heaviness|is heavy|feels heavy)|pain in (my|his|her|their) chest|(elephant|weight) (sitting )?on (my|his|her|their) chest|(having|had) a heart attack|pain (spreading|radiating) (to|into|down) (my|his|her|their) (left )?(arm|jaw)/ },
    { kod: 'inme',
      tr: /(?<!\p{L})(yüz(?!\s*üst)|ağz|ağız|dudağ|dudak)\p{L}*\s+(\p{L}+\s+){0,2}(kay|yamul|çarpıl|sark|eğril|düş)\p{L}*|(birden|aniden|bir anda|ansızın)\s+(\p{L}+\s+){0,3}(kol|bacak|el|ayak)\p{L}*\s+(\p{L}+\s+){0,3}(tutmu?yor|tutmaz|kaldıram|güçsüz|kuvvetsiz|hissizleş|düştü)\p{L}*|(?<!\p{L})(kol|bacak|el|ayak)\p{L}*\s+(\p{L}+\s+){0,3}(tutmu?yor|tutmaz|kaldıram|güçsüz|kuvvetsiz|hissizleş)\p{L}*.{0,40}(birden|aniden|bir anda|ansızın)|(?<!\p{L})(kol|bacak|el|ayak)\p{L}*\s+(birden|aniden|bir anda|ansızın)\s+(\p{L}+\s+)?(tutmu?yor|tutmaz|kaldıram|güçsüz|kuvvetsiz|hissizleş|düştü)\p{L}*|(konuşma|konuşması|dil|dili)\s+(\p{L}+\s+)?(bozul|anlaşılmı?yor|peltekleş|dolaş|ağırlaş)\p{L}*|felç\s+(oldu|geçir|kal|gibi)\p{L}*|(?<!\p{L})inme\s+(geçir|indi)\p{L}*/u,
      en: /face (is |was |seems )?(droop\w*|lopsided|twisted)|droop\w* on one side|one side of (his|her|my|their|the) face|(arm|leg|hand) (is |went |feels |suddenly )?(weak|numb|limp|dead)\b|can'?t (lift|raise|move) (his|her|my|their) (arm|leg)|slurr\w*|(speech|words) (is |are )?(garbled|slurred|jumbled)|having a stroke/ },
    { kod: 'nobet',
      tr: /(?<!\p{L})nöbet\p{L}*\s+(geçir|başla|gel)\p{L}*|(?<!\p{L})havale\p{L}*\s+(geçir|geldi|oldu)\p{L}*|(?<!\p{L})sara\s+(kriz|nöbet)\p{L}*|ağz\p{L}*\s+(\p{L}+\s+)?köpük\p{L}*|(kasıl|katılaş|titre)\p{L}*.{0,40}(gözler\p{L}*\s+(kay|dön)|bilin|kendinde değil|tepki)/u,
      en: /seizure|convuls\w*|having a fit|(jerking|shaking) (uncontrollably|all over)|foaming at the mouth/ },
    { kod: 'kanama',
      tr: /(?<!\p{L})(kan|kanı|kanama\p{L}*)\s+(\p{L}+\s+){0,3}(durmu?yor|dinmi?yor|kesilmi?yor|fışkır|boşal)\p{L}*|(?<!\p{L})kan\p{L}*\s+(\p{L}+\s+){0,2}(doldu|gölü|su gibi|musluk gibi)\p{L}*|(çok|bol|şiddetli|fazla|durmadan|sürekli)\s+(kan(ıyor|ama|dı|a|ı)\p{L}*)|(?<!\p{L})(kan|kanlı)\s+kus\p{L}*|kahve telvesi gibi\s+(\p{L}+\s+)?kus\p{L}*|(?<!\p{L})kus(tu|uyor|ma|muk|tuğ)\p{L}*.{0,30}(kan|kahve telvesi)(?!\p{L})|(dışkı|kaka|bez|tuvalet)\p{L}*.{0,30}(kan|kanlı|siyah|katran)(?!\p{L})|(?<!\p{L})kanlı\s+(dışkı|kaka|ishal)\p{L}*|(hamile|gebe)\p{L}*.{0,60}(kana|kan gel|lekelen)\p{L}*|kanama.{0,40}(hamile|gebe)\p{L}*/u,
      en: /(bleeding|blood) (\w+ )?(won'?t|doesn'?t|will not|isn'?t) stop|(won'?t|doesn'?t) stop bleeding|bleeding (heavily|a lot|badly|profusely)|(heavy|severe|lots of) bleeding|spurting|soaked through|vomit(ing|ed|s)? (up )?blood|coughing up blood|blood in (his|her|my|their|the)? ?(stool|poo|poop|diaper|nappy|vomit)|black,? tarry|pregnant.{0,60}(bleed|blood)|(bleed|blood).{0,40}pregnan/ },
    // 15.11 akşam (§153, Özet §152): "Kol koptu ne yapmalı" kartı açmadı — kopma yoktu, kanama kalıbı yalnız "kan durmuyor"u arıyor,
    // hakem de "hayır" dedi. Uzuv kopması her zaman acildir (IFRC 2020: amputasyon → access EMS). Vücut parçası + kopma sözü
    // ya da makineye kaptırma; eşyanın kolu, sapı (kapı kolu, oyuncak) yan cümlede geçiyorsa sayılmaz (haric).
    // 15.11 akşam (§153, Özet §152): "Kol koptu ne yapmalı" kartı açmadı — kopma yoktu, kanama kalıbı yalnız "kan durmuyor"u arıyor,
    // hakem de "hayır" dedi. Uzuv kopması her zaman acildir (IFRC 2020: amputasyon → access EMS). Vücut parçası (ya da "ucu")
    // + kopma sözü (virgül aşılabilir: "parmağı kapıya sıkıştı, ucu kopmuş"), parçası yerde, makineye kaptırma. Türkçe harfsiz
    // yazım da ("parmagim kopuyo"). Eşyanın kolu, sapı, kayışı ("kapının kolu", "saatimin kayışı koptu") sayılmaz (haric).
    { kod: 'kopma',
      tr: /(?<!\p{L})(parma[kğg](?!l[ıi]k)\p{L}*|el(i|im|in|ini|imi|leri|lerim|ler)?(?!\p{L})|kol(u|um|un|unu|umu|lar[ıi]\p{L}*)?(?!\p{L})|bacak(?!\p{L})|baca[ğg]\p{L}*|ayak(?!\p{L})|aya[ğg]\p{L}*|kulak(?!\p{L})|kula[ğg]\p{L}*|burun(?!\p{L})|burn\p{L}*|uzuv|uzv\p{L}*|bilek(?!\p{L})|bile[ğg]\p{L}*|dirse[kğg]\p{L}*|meme\p{L}*|omuz\p{L}*|omz\p{L}*|dudak(?!\p{L})|duda[ğg]\p{L}*|uc(u|unu)(?!\p{L}))[\s,()]+([\p{L}\d]+[\s,()]+){0,4}(kop(tu|muş|mu[sş]|uk|acak|ac|uyor|uyo|mak üzere|tı|ar gibi)\p{L}*|kopar(dı|mış|ıldı|ılmış)\p{L}*|kesilip\s+(düştü|ayrıldı|gitti|koptu)|kes(ti|ildi) gitti|tamamen kesil\p{L}*|ayr[ıi]l(dı|mış|mi[sş])\p{L}*|(elinde|elimde|içinde) kaldı|yerde duruyo\p{L}*|yerinde yok|yerinde değil\p{L}*|yok ol(muş|du)\p{L}*|ezil(ip|di|miş)\s+(git|ayrıl|kop)\p{L}*|(aşağısı|altı|ötesi)\s+yok|parça parça|(içinde|arasında) kal(dı|mış)\p{L}*|sallan[ıi]yo\p{L}*|sark[ıi]yo\p{L}*|(deri(yle|ye)|deri\s+parças[ıi]yla|deri\s+parcas[ıi]yla|derisiyle|etiyle|etle)\s+(\p{L}+\s+)?(ba[ğg]l[ıi]|as[ıi]l[ıi]|tutunuyo\p{L}*|duruyo\p{L}*|sallan\p{L}*))|(?<!\p{L})(parma[kğg](?!l[ıi]k)\p{L}*|el(i|im|in|ini|imi|leri|lerim|ler)?(?!\p{L})|kol(u|um|un|unu|umu|lar[ıi]\p{L}*)?(?!\p{L})|bacak(?!\p{L})|baca[ğg]\p{L}*|ayak(?!\p{L})|aya[ğg]\p{L}*|kulak(?!\p{L})|kula[ğg]\p{L}*|burun(?!\p{L})|burn\p{L}*|uzuv|uzv\p{L}*|bilek(?!\p{L})|bile[ğg]\p{L}*|dirse[kğg]\p{L}*|meme\p{L}*|omuz\p{L}*|omz\p{L}*|dudak(?!\p{L})|duda[ğg]\p{L}*|uc(u|unu)(?!\p{L}))\s+(ucu\s+|parças[ıi]\s+|parçalar[ıi]\s+)?(yerde|yere düş\p{L}*)(?!\p{L})|(?<!\p{L})kop(an|muş|uk)\s+(\p{L}+\s+)?(parma[kğg](?!l[ıi]k)\p{L}*|el(i|im|in|ini|imi|leri|lerim|ler)?(?!\p{L})|kol(u|um|un|unu|umu|lar[ıi]\p{L}*)?(?!\p{L})|bacak(?!\p{L})|baca[ğg]\p{L}*|ayak(?!\p{L})|aya[ğg]\p{L}*|kulak(?!\p{L})|kula[ğg]\p{L}*|burun(?!\p{L})|burn\p{L}*|uzuv|uzv\p{L}*|bilek(?!\p{L})|bile[ğg]\p{L}*|dirse[kğg]\p{L}*|meme\p{L}*|omuz\p{L}*|omz\p{L}*|dudak(?!\p{L})|duda[ğg]\p{L}*|uc(u|unu)(?!\p{L}))|(makine|testere|pres|kıyma|tırpan|balta|motor|matkap|freze|çark|dişli|parçalayıcı|biçerdöver|konveyör|hızar|kesici)\p{L}*\s+(\p{L}+\s+){0,2}([kg]aptır|gir(di|miş)|sıkış(tı|mış)|kopar)\p{L}*/u,
      en: /\b(fingers?|thumbs?|toes?|hands?|arms?|legs?|foot|feet|ears?|nose)\b.{0,30}\b(cut off|chopped off|severed|ripped off|torn off|came off|amputated|sliced off|hanging (on )?by)|\b(severed|amputated|cut-off|torn-off|chopped-off)\b.{0,20}\b(fingers?|thumbs?|toes?|hands?|arms?|legs?|foot|feet|ears?)\b|(caught|stuck|pulled) in (a|the) (machine|saw|press|meat grinder|auger|conveyor|chipper)/,
      haric: { tr: /(kapı|çanta|bavul|valiz|sandalye|koltu[kğ]|dola[pb]|çekmece|tencere|tava|kova|vites|gözlük|şemsiye|araba|bisiklet|heykel|robot|kukla|maket|masa|bardak|fincan|kupa|termos|sürahi|kulaklı[kğ])\p{L}*?(n[ıiuü]n|[ıiuü]n)\s+(\p{L}+\s+){0,3}(kol|kulp|sap|ayağ|ayak|bacağ|bacak|kulağ|kulak|el|kafa)\p{L}*|(ağac|ağaç|dal|fidan)\p{L}*\s+(\p{L}+\s+){0,2}kol\p{L}*|(gömle[kğ]|ceket|kazak|elbise|mont|tişört|hırka|kaban|palto|bluz|kıyafet)\p{L}*\s+(\p{L}+\s+){0,2}(kol|ask|yaka|cep|kulp)\p{L}*|(kabu[kğ]|tırna[kğ]|saç|kıl|kirpik|nasır|siğil)\p{L}*\s+(\p{L}+\s+)?((da|de)\s+)?(kop|ayrıl|düş)\p{L}*|oyunca[kğ]\p{L}*\s+(\p{L}+\s+)?(kol|bacak|bacağ|kafa|el|kulak|kulağ)\p{L}*|(kapı|çanta|bavul|valiz|sandalye|koltuk|dolap|çekmece|tencere|tava|kova|vites|bardak|fincan|kupa|termos|masa|şemsiye|araba|bisiklet)\s+(kol|kulp|sap|ayağ|bacağ|kulağ)\p{L}*|(kayış|ip|bağ|askı|düğme|fermuar|sap|kulp|tutamak|zincir|kordon|kablo|tel|kopça|toka)\p{L}*\s+(kop|kesil|ayrıl)\p{L}*/u,
        en: /\b(doll|toy|chair|door|bag|suitcase|statue|robot|mug|cup|pot|pan)'?s? (arm|leg|handle|ear|head)|\b(strap|handle|button|zipper|string|cord|cable|chain)\b.{0,15}\b(came off|broke|snapped)/ } },
    { kod: 'alerji',
      tr: /(?<!\p{L})(dudak|dil|boğaz)\p{L}*\s+(\p{L}+\s+)?(şiş|kabar)\p{L}*|(?<!\p{L})boğaz\p{L}*\s+(\p{L}+\s+)?(kapan|tıkan|daral|sıkış)\p{L}*|(?<!\p{L})yutkun(am|amıyor|makta zorlan)\p{L}*|(vücud|her yan|her yer|tüm vücud|bütün vücud)\p{L}*\s+(\p{L}+\s+){0,3}(kabar|kaşın|şiş|kızar|kurdeşen)\p{L}*.{0,80}(göz\p{L}*\s+karar|ayakta duram|bayıl|baş\p{L}* dön|nefes\p{L}*\s+(daral|alam)|yutkun|dudak\p{L}*\s+şiş|dil\p{L}* şiş)\p{L}*|anafilaksi\p{L}*|alerjik şok\p{L}*|(arı|böcek|fıstık|fındık|ilaç|iğne|alerji)\p{L}*.{0,60}(yüz|göz)\p{L}*\s+(\p{L}+\s+)?(şiş|kabar)\p{L}*/u,
      en: /(lips?|tongue|throat|mouth) (is |are |started |starting |getting |began )?(swell\w*|puff\w*)|swollen (lips?|tongue|throat)|throat (is )?(closing|tight\w*|swelling)|can'?t swallow|anaphyla\w*|allergic shock|(sting|peanut|nut|allerg\w*|bee|wasp|medicine).{0,60}(face|eyes?) (is |are |started )?swell/ },
    { kod: 'zehir',
      tr: /(çamaşır suyu|kezzap|tuz ruhu|deterjan|tablet|kapsül|lavabo açıcı|zehir|zehr|tarım ilac|böcek ilac|fare zehr|antifriz|metanol|sahte içki|kolonya|pil|mıknatıs)\p{L}*\s+(\p{L}+\s+){0,4}(içti|içmiş|yuttu|yutmuş|yedi|yemiş|ağzına aldı|çiğnedi|çiğnemiş)\p{L}*|(ilaç|hap|tablet)\p{L}*\s+(\p{L}+\s+){0,3}(yuttu|yutmuş)\p{L}*|(fazla|çok|bir kutu|bütün|avuç|birkaç kutu)\s+(\p{L}+\s+)?(ilaç|hap|tablet)\p{L}*\s+(\p{L}+\s+)?(içti|içmiş|almış|aldı|yuttu)\p{L}*|(bir kutu|kutusunun|kutunun|avuç dolusu|bütün|hepsini|tamamını)\s+(\p{L}+\s+){0,2}(ilaç|hap|tablet|şurub|şurup)\p{L}*.{0,30}(iç|yut|al(d|m))\p{L}*|(parasetamol|aspirin|ibuprofen|antidepresan|uyku ilac|tansiyon ilac|şeker ilac|kalp ilac|demir ilac|sakinleştirici|morfin|eroin|uyuşturucu)\p{L}*.{0,60}(hepsini|tamamını|kutusunu|kutusunun|bir kutu|yarısını|fazla(sını)?\s+(iç|al|yut)|çok fazla|yuttu|yutmuş|yuttuğunu)\p{L}*|(?<!\p{L})mantar\p{L}*.{0,80}(kus|ishal|bulantı)\p{L}*|karbon ?monoksit\p{L}*|(soba|şofben|kombi|mangal)\p{L}*.{0,80}(baş ağrı|bulantı|bayıl|uyku|sersem|baş dön)\p{L}*/u,
      en: /(swallowed|drank|drunk|ate|eaten|ingested|chewed|got into)\s+(\w+\s+){0,6}(bleach|detergent|pods?|drain cleaner|caustic|pills|tablets|medicine|medication|poison|pesticide|antifreeze|methanol|battery|batteries|magnets?)|overdose\w*|carbon monoxide|mushroom.{0,80}(vomit|diarrh)/ },
    { kod: 'karin',
      tr: /(?<!\p{L})(karın|karn)\p{L}*\s+(\p{L}+\s+){0,2}(şiddetli|dayanılmaz|çok kötü|bıçak|kıvran|taş gibi|tahta gibi|sertleş)\p{L}*|(şiddetli|dayanılmaz|ani|bıçak gibi)\s+(bir\s+)?(karın|kasık)\s+ağrı\p{L}*|(karın|karn)\p{L}*.{0,30}kıvranıyor/u,
      en: /(severe|sudden|sharp|unbearable|excruciating|stabbing|worst) (\w+ )?(abdominal|stomach|belly|tummy) (pain|ache)|(abdomen|stomach|belly|tummy) (is )?(rigid|hard as|board.like)|doubled over/ },
    { kod: 'basagrisi',
      tr: /(ani|aniden|şiddetli|dayanılmaz|hayatımın en kötü|hayatının en kötü|çok kötü|müthiş)\s+(bir\s+)?baş\s+ağrı\p{L}*|(?<!\p{L})baş\p{L}*\s+(çatlıyor|patlıyor|patlayacak)\p{L}*|(?<!\p{L})çift\s+gör\p{L}*|(görme\p{L}*|gözü|gözleri)\s+(aniden\s+)?(kayb|gitti|görmüyor)\p{L}*|aniden\s+göremi?yor\p{L}*/u,
      en: /(worst|sudden|severe|thunderclap|excruciating) (\w+ )?headache|double vision|seeing double|(sudden(ly)?|lost) (\w+ )?(vision|sight)|suddenly can'?t see/ },
    { kod: 'ates',
      tr: /(?<!\p{L})ateş\p{L}*.{0,80}(döküntü|lekeler|ense|boyn|ışığa|uyandıram|uyuşuk|nöbet|havale|kafası karış)\p{L}*|(döküntü|lekeler)\p{L}*.{0,60}ateş\p{L}*|(?<!\p{L})(([1-9]|1[0-9]|bir|iki|üç|dört|beş|altı|yedi|on)\s+(günlük|haftalık)|(1|2|bir|iki)\s+aylık|yeni ?doğan|lohusa)\p{L}*.{0,80}ateş\p{L}*|(?<!\p{L})ateş\p{L}*\s+(\p{L}+\s+)?(4[0-2]|39[,.][5-9])(?![0-9])|bastırınca (geçmeyen|kaybolmayan|solmayan)|cam testi/u,
      en: /fever.{0,80}(rash|spots|stiff neck|light hurts|sensitive to light|floppy|won'?t wake|confus|seizure|fit\b)|(rash|spots).{0,60}fever|(newborn|\b([1-9]|1[0-9])[- ](day|week)s?[- ]old|\b(one|two|1|2)[- ]months?[- ]old).{0,80}(fever|temperature)|(fever|temperature) of (4[0-2]|10[4-9])/ },
    { kod: 'sok',
      tr: /(?<!\p{L})(soğuk|nemli|yapış)\p{L}*\s+(soğuk\s+)?(ter|terle)\p{L}*|(soluk|bembeyaz|kül gibi|kireç gibi)\p{L}*.{0,30}(soğuk|terli|nabız)\p{L}*|nabz\p{L}*\s+(\p{L}+\s+)?(çok hızlı|zayıf|alınamı?yor|hissedilmi?yor)\p{L}*/u,
      en: /cold,? (and )?clammy|clammy|pale,? (and )?(cold|sweaty)|weak,? (and )?rapid pulse|cold sweat/ },
    { kod: 'yanik',
      tr: /(büyük|geniş|derin|kocaman|kömürleş|beyazlaş)\p{L}*\s+(\p{L}+\s+)?yanık\p{L}*|(?<!\p{L})yanık\p{L}*.{0,40}(büyük|geniş|derin|kocaman|avuç\p{L}* (içinden|kadar)|her yer)|(kimyasal|kezzap|asit|kireç|lavabo açıcı)\p{L}*.{0,40}(yandı|yanık|döküldü|sıçradı)\p{L}*|(alev|ateş)\p{L}*\s+(\p{L}+\s+)?(aldı|sardı)\p{L}*|(alev|patlama|tüp|kızgın yağ|kaynar)\p{L}*.{0,40}(yüz|boğaz|ağz)\p{L}*\s+(\p{L}+\s+)?yan(dı|mış)\p{L}*/u,
      en: /(large|deep|big|huge|severe|extensive) (\w+ )?burns?\b|burns? (to|on) (his|her|my|their|the) (face|mouth|throat|genitals|whole)|(chemical|acid|lye) (burn|splash\w*)|clothes (caught|on) fire/ },
    { kod: 'elektrik',
      tr: /(?<!\p{L})elektrik\p{L}*\s+(\p{L}+\s+)?(çarp|akım)\p{L}*|(priz|kablo|fiş|saç kurutma|elektrikli|sigorta|şalter|makine)\p{L}*.{0,80}(?<!\p{L})çarp(ıldı|ılmış|tı|mış)\p{L}*|(?<!\p{L})akım\p{L}*\s+kapıl\p{L}*|yıldırım\p{L}*\s+(\p{L}+\s+)?çarp\p{L}*/u,
      en: /electric(al)? shock|electrocut\w*|struck by lightning|got (a )?shock from/ },
    { kod: 'sicak',
      tr: /(?<!\p{L})(sıcak|güneş)\p{L}*.{0,80}(bilin|kafası karış|saçmal|terlemi?yor|terlemesi (kesil|dur)|bayıl|kendine gel|nöbet|havale)\p{L}*|terleme\p{L}*\s+(durdu|kesildi)|sıcak çarpması geçir\p{L}*/u,
      en: /heat ?stroke|stopped sweating|(heat|sun|hot).{0,80}(confus|collapsed|passed out|not making sense|seizure)/ },
    { kod: 'soguk',
      tr: /titreme\p{L}*\s+(durdu|kesildi)|(?<!\p{L})(soğuk|buz|kar|don|soğukta|ayaz)\p{L}*.{0,80}(bilin|kafası karış|saçmal|uyuşuk|kendine gel|uyandıram)\p{L}*|hipotermi\p{L}*/u,
      en: /hypotherm\w*|stopped shivering|(cold|snow|ice|freezing).{0,80}(confus|slurr|not making sense|drowsy|won'?t wake)/ },
    { kod: 'kafa',
      tr: /(?<!\p{L})(baş|kafa)\p{L}*\s+(\p{L}+\s+){0,4}(çarp|vur|darbe)\p{L}*.{0,120}(kus(tu|uyor|ma)\p{L}*|uykulu|uyuşuk|sersem|kafası karış|bayıl|nöbet|havale|kulağ\p{L}*\s+(\p{L}+\s+)?(kan|sıvı)|burn\p{L}*\s+(\p{L}+\s+)?(berrak|su gibi|sıvı)|sendel|denge|bulanık gör|çift gör|tuhaf davran|saldırgan|durgun|oynamıyor)\p{L}*|(düş|yuvarlan)\p{L}*.{0,60}(baş|kafa)\p{L}*.{0,80}(kus|uykulu|sendel|kafası karış|bayıl|durgun)\p{L}*/u,
      en: /(hit|bump\w*|bang\w*|knock\w*|struck|blow|fell|fall\w*)\b.{0,60}\bhead\b.{0,120}(vomit\w*|drowsy|sleepy|confus\w*|passed out|blacked out|seizure|clear fluid|blood (from|coming out of) (his|her|the|my) ear|unsteady|balance|slurr\w*|acting (strange|odd)|very quiet)/ },
    { kod: 'kirik',
      tr: /(?<!\p{L})kemi\p{L}*\s+(\p{L}+\s+)?(dışarı|deri\p{L}*\s+(dışına|delip|yırtıp)|görünüyor|çıktı)\p{L}*|(?<!\p{L})(kol|bacak|ayak|bilek|parmak|dirsek|diz|omuz|kalça|uyluk)\p{L}*\s+(\p{L}+\s+){0,3}(ters|garip|tuhaf|anormal|yamuk|eğri)\s+(\p{L}+\s+)?(dur|açı|şekil|yön|bük)\p{L}*|(?<!\p{L})bacağ\p{L}*\s+(\p{L}+\s+)?(dışa dönük|kısal)\p{L}*|(sırt|bel|boyun|omurga)\p{L}*.{0,60}(düş|çarp|kaza)\p{L}*.{0,60}(bacak\p{L}*\s+(\p{L}+\s+)?(hissetmi?y|kıpırdatam|oynatam)|uyuş)\p{L}*/u,
      en: /bone (is )?(sticking out|poking out|visible|through the skin)|(arm|leg|ankle|wrist|finger|elbow|knee|shoulder|hip) .{0,30}(odd|weird|wrong|unnatural|strange) (angle|shape|position)|can'?t (feel|move) (his|her|my|their) legs/ },
    { kod: 'bogulma',
      tr: /(lokma|yemek|şeker|fındık|üzüm|bilye|oyuncak|kemik|parça)\p{L}*\s+(\p{L}+\s+){0,3}(kaç|takıl|tıkan)\p{L}*.{0,60}(nefes\p{L}*\s+(alam|almakta zorlan)|nefessiz|konuşam|öksürem|morar|ses çıkaram|ağlayam)\p{L}*|boğazına\s+(\p{L}+\s+)?(kaçtı|takıldı)\p{L}*.{0,60}(nefes\p{L}*\s+(alam|almakta zorlan)|nefessiz|konuşam|öksürem|morar|ses çıkaram|ağlayam)\p{L}*|(suda|denizde|havuzda|gölde|derede|küvette|kovada)\s+(\p{L}+\s+){0,3}(boğul|bat|çırpın)\p{L}*|(?<!\p{L})sudan\s+(\p{L}+\s+){0,2}(baygın|bilinçsiz|hareketsiz|nefessiz)\p{L}*|(ip|kordon|kablo|şal|atkı|eşarp|kemer|perde ipi|zincir)\p{L}*.{0,40}(boyn|boğaz)\p{L}*\s+(\p{L}+\s+)?(dolan|sarıl|sıkış|takıl|geçmiş)\p{L}*|(boyn|boğaz)\p{L}*.{0,20}(ip|kordon|kablo|şal|atkı)\p{L}*\s+(\p{L}+\s+)?(dolan|sarıl|sıkış)\p{L}*|asılı (buldu|halde)\p{L}*|kendini as\p{L}*/u,
      en: /chok(ing|ed)\b.{0,60}(can'?t|cannot|not|unable)|(can'?t|cannot) (breathe|talk|cough|cry).{0,40}chok|(something|food|piece|grape|candy|toy) (\w+ ){0,3}stuck in (his|her|my|their) (throat|windpipe)|drowning|(pulled|dragged|rescued) (\w+ ){0,2}(out of|from) the (water|pool|sea|lake)/ },
    { kod: 'gebelik',
      tr: /(?<!\p{L})(hamile|gebe)\p{L}*.{0,100}(kanama|kan gel|lekelen|şiddetli baş ağrı|bulanık gör|görme\p{L}* bulanık|yüz\p{L}*\s+(\p{L}+\s+)?şiş|el\p{L}*\s+(\p{L}+\s+)?şiş|su\p{L}*\s+(geldi|gelmeye)|bebe\p{L}*\s+(\p{L}+\s+){0,2}(kıpırda|hareket|tekme)\p{L}*\s+(\p{L}+\s+){0,2}(azal|yok|durdu|hissedemi?y|hissetmi?y|hissetmed|kesildi)|(kıpırdamı?yor|kıpırdamadı|hareket etmi?yor|hareket etmedi|tekme (atmı?yor|atmadı)|tekme\p{L}*\s+(\p{L}+\s+)?hissetmed)|şiddetli karın|havale|nöbet)\p{L}*/u,
      en: /pregnan\w*.{0,100}(bleed\w*|spotting|severe headache|blurr\w* vision|swollen (face|hands)|face (is )?swollen|water(s)? (broke|has broken)|baby (is )?(not moving|moving less|stopped moving)|seizure)/ },
  ];
  // şu anki durum değil: bilgi ya da hazırlık sorusu (bütün soru; "şimdi / şu an" geçiyorsa sayılmaz)
  const ACIL_BILGI = { tr: /merak (ed|et)\p{L}*|(okumak|öğrenmek|bilmek) istiyorum|(sınav|ödev)\p{L}* için|sınava çalış\p{L}*|(sebebi|nedeni) ne(dir)?(?!\p{L})|belirti\p{L}*\s+(ne|neler|nedir|nelerdir)\b|belirtisi\s+(mi|mı)\b|nasıl\s+(anla|fark ed|ayırt|önlen|korun|hazırlan)\p{L}*|(önlemek|korunmak|hazırlanmak|hazırlıklı olmak)\s+için|(?<!\p{L})ne\s+demek(?!\p{L})/u,
    en: /what are the (signs|symptoms)|how (do|can|would|should) (i|you|we|one) (tell|know|recogni[sz]e|spot|prevent|prepare)|how to (tell|recogni[sz]e|prevent|prepare)|what does .{0,30} mean/ };
  const ACIL_SIMDI = { tr: /(?<!\p{L})(şu an|şu anda|şimdi|şuan|az önce|biraz önce|demin|hemen şimdi)(?!\p{L})/u, en: /\b(right now|now|just now|currently|at the moment)\b/ };
  // yan cümle sınırı: noktalama ve bağlaçlar (karşıtlık, "ve")
  const ACIL_SINIR = { tr: /[.!?;,:]+|\s+(?:ama|fakat|ancak|lakin|ve|ya da|veya|yine de)\s+/u, en: /[.!?;,:]+|\s+(?:but|however|although|though|and|or|yet)\s+/ };
  // yan cümlede şu anki durum olmadığını söyleyen sözler (eşleşmenin ARDINDA): olumsuz, geçmiş, düzelmiş
  const ACIL_DEGIL = { tr: /(?<!\p{L})(yok|yoktu|değil|olmadı|olmuyor|olmamış|hiç olmadı|sandım|sanmıştım|sandık|zannettim|zannetmiştim)(?!\p{L})/u,
    en: /\b(no longer|not anymore)\b/ };
  // geçmiş ve düzelmiş: cümlenin geri kalanında ("dün göğsüm ağrıdı ama geçti" — bağlaçtan sonra gelir)
  const ACIL_GECTI = { tr: /(?<!\p{L})(geçti|geçmiş|geçmişti|düzeldi|iyileşti|iyileşmiş|kalmadı|toparlandı|kendine geldi|şimdi iyi\p{L}*)(?!\p{L})(?!\s*(mi|mı|mu|mü|sayılır|sayılmaz|diye)(?!\p{L}))/u,
    en: /\b(went away|has gone|is gone|resolved|passed|is fine now|better now|fine now|came to)\b/ };
  // eşleşen kelimenin olumsuz eki ("daralmıyor", "ağrımadı") belirtiyi siler; ama belirtinin kendisi olumsuz biçimse
  // ("alamıyor", "kendine gelmiyor", "durmuyor", "tutmuyor") silmez — kalıplarda bu biçimler açıkça yazılı
  const ACIL_EK = /\p{L}{2,}(m[ıiuü]y|m[ae]d[ıi]|m[ae]z(?!\p{L})|m[ae]m[ıi]ş)/u;
  const ACIL_OLUMSUZ_BELIRTI = /(a|e)m[ıi]y|(a|e)m[ae]z(?!\p{L})|(a|e)m[ae]d[ıi]|^(gelmi|gelmedi|durmu|dinmi|kesilmi|vermi|tutmu|tutmaz|uyanmı|tanımı|terlemi|hissetmi|hissedilmi|solumu|almıyor|oynamı|görmü)/u;
  // eşleşmenin ÖNÜNDE (yan cümlede): koşul, mecaz, neredeyse
  const ACIL_ONCE = { tr: /(?<!\p{L})(gülmekten|sevinçten|meraktan|neredeyse|eğer)(?!\p{L})/u,
    en: /\b(no|not|without|never|denies|neither|nor|if|in case|what if|when someone|laughing|almost|nearly)\b|n't\b/ };
  // eşleşmenin yan cümlesinin tamamında: koşul eki ("daralırsa", "olursa", "geçirirse"), "-acaktım" (neredeyse), mecaz
  const ACIL_KOSUL = { tr: /\p{L}(ı|i|u|ü|a|e)?rs[ae](?!\p{L})|\p{L}+(acak|ecek)(tım|tim|tık|tik)(?!\p{L})|(?<!\p{L})(durumunda|halinde|hâlinde|ihtimaline|olasılığına)(?!\p{L})|gülmekten/u,
    en: /\b(if|in case|whenever|laughing so hard|took my breath away)\b/ };

  // §133 ikinci tur (V'nin boş alarmları): yan cümlede geçmiş hikâye ("iki yıl önce kalp krizi geçirdim", "dedem gençliğinde")
  // §153: her sayı sözü ("yirmi yıl önce") de geçmiş hikâye. -mıştı denendi, geri alındı: az önceki olay da böyle anlatılır
  // ("dudakları morarmıştı", "ip boynuna sarılmıştı" — kayıtlı üç acil kartı susturdu)
  const ACIL_GECMIS = { tr: /(?<!\p{L})((\d+|\p{L}+)\s+(yıl|sene|ay)\s+önce|geçen\s+(yıl|sene)|yıllar önce|gençliğinde|çocukluğunda|çocukken|eskiden|rahmetli|bir zamanlar)(?!\p{L})/u,
    en: /\b((\d+|a|one|two|three|several|many) (years?|months?) ago|last year|when (i|he|she) was (young|a child)|years ago|late (grand)?(father|mother|grandpa|grandma))\b/ };
  // eşleşen kelime geniş zamanda: varsayım ("fıstık yer de dudakları şişer") — şu anki durum değil
  const ACIL_GENIS = /\p{L}{2,}(ar|er|ır|ir|ur|ür)(?!\p{L})/u;
  const ACIL_GENIS_DEGIL = /(yor|dır|dir|dur|dür|tır|tir|tur|tür|lar|ler|ğer|aklar|akar)$/u;
  function acilBelirtiT(soru, dil, T) {
    if (dil !== 'tr' && dil !== 'en') return [];
    const q = (dil === 'tr' ? kucuk(String(soru || '')) : String(soru || '').toLowerCase()).replace(/[’`]/g, "'").replace(/\s+/g, ' ');
    if (T.ACIL_BILGI[dil].test(q) && !T.ACIL_SIMDI[dil].test(q)) return [];
    if (dil === 'tr' && /(?<!\p{L})(yaralı|yaralanan)\s+(\p{L}+\s+)?yok|kimse yaralanmadı/u.test(q)) return [];   // §153: "şu an yaralı yok, sınav için soruyorum"
    // yan cümlelerin sınırları
    const sinirlar = [0];
    for (const m of q.matchAll(new RegExp(T.ACIL_SINIR[dil].source, T.ACIL_SINIR[dil].flags + 'g'))) sinirlar.push(m.index, m.index + m[0].length);
    sinirlar.push(q.length);
    const yanCumle = (i) => {
      let bas = 0, son = q.length;
      for (let k = 0; k < sinirlar.length; k++) { if (sinirlar[k] <= i) bas = sinirlar[k]; else { son = sinirlar[k]; break; } }
      return [bas, son];
    };
    const bulunan = [];
    for (const b of T.ACIL_BELIRTI) {
      const re = new RegExp(b[dil].source, b[dil].flags.includes('g') ? b[dil].flags : b[dil].flags + 'g');
      for (const m of q.matchAll(re)) {
        const bitis = m.index + m[0].length;
        const [bas] = yanCumle(m.index), [, son] = yanCumle(Math.max(m.index, bitis - 1));
        const once = q.slice(bas, m.index), sonra = q.slice(bitis, son), butun = q.slice(bas, son);
        // eşleşmenin son kelimesi (kelimenin sonuna kadar) — "daralmıyor" kalıba bütünüyle girer, ek orada aranır
        const kelime = (m[0].split(/\s+/).pop() + (q.slice(bitis).match(/^\p{L}*/u) || [''])[0]);
        if (dil === 'tr' && T.ACIL_EK.test(kelime) && !T.ACIL_OLUMSUZ_BELIRTI.test(kelime)) continue;
        if (dil === 'tr' && T.ACIL_GENIS.test(kelime) && !T.ACIL_GENIS_DEGIL.test(kelime)) continue;
        if (T.ACIL_GECMIS[dil].test(butun)) continue;
        const cumleSonu = (() => { const k = q.slice(bitis).search(/[.!?]/); return k < 0 ? q.length : bitis + k; })();
        if (T.ACIL_DEGIL[dil].test(sonra) || T.ACIL_GECTI[dil].test(q.slice(bitis, cumleSonu)) || T.ACIL_ONCE[dil].test(once) || T.ACIL_KOSUL[dil].test(butun)) continue;
        if (b.haric && b.haric[dil].test(butun)) continue;   // §153: belirtinin kendi istisnası (kopma: eşyanın kolu)
        bulunan.push(b.kod);
        break;
      }
    }
    return bulunan;
  }  // §153 (15.11 akşam, ikinci görülmemiş set): Türkçe harfsiz yazım — "parmagim kopuyo", "yilan isirdi", "yangin geliyo".
  // Panikte telefonda böyle yazılır; kalıplar Türkçe harfle yazılı olduğu için hiç tutmuyordu. Soruda Türkçe harf yoksa
  // soru da kalıplar da harfsiz biçime katlanıp (ı→i, ğ→g, ş→s, ç→c, ö→o, ü→u) bir kez daha bakılır. Katlanmış kalıp
  // her çağrıda kaynağından kurulur (bozma denemesi kaynağı değiştirince katlanmış olan da değişsin).
  const TR_HARF = /[çğıöşüÇĞİÖŞÜâîû]/;
  const KATLA = { 'ı': 'i', 'İ': 'i', 'ğ': 'g', 'Ğ': 'g', 'ş': 's', 'Ş': 's', 'ç': 'c', 'Ç': 'c', 'ö': 'o', 'Ö': 'o', 'ü': 'u', 'Ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
  const harfKatla = (s) => String(s || '').replace(/[ıİğĞşŞçÇöÖüÜâîû]/g, (h) => KATLA[h]);
  function katlaDerin(x) {
    if (x instanceof RegExp) return new RegExp(harfKatla(x.source), x.flags);
    if (Array.isArray(x)) return x.map(katlaDerin);
    if (x && typeof x === 'object') { const o = {}; for (const [k, v] of Object.entries(x)) o[k] = katlaDerin(v); return o; }
    return x;
  }
  const acilTablo = () => ({ ACIL_BILGI, ACIL_SIMDI, ACIL_SINIR, ACIL_BELIRTI, ACIL_EK, ACIL_OLUMSUZ_BELIRTI, ACIL_GENIS, ACIL_GENIS_DEGIL,
    ACIL_GECMIS, ACIL_DEGIL, ACIL_GECTI, ACIL_ONCE, ACIL_KOSUL });
  function acilBelirti(soru, dil) {
    // harfsiz soruda yalnız katlanmış biçim: istisnalar da katlanmalı ("kapinin kolu koptu" — asıl "kapı" istisnası tutmaz)
    if (dil !== 'tr' || TR_HARF.test(String(soru || ''))) return acilBelirtiT(soru, dil, acilTablo());
    return acilBelirtiT(harfKatla(kucuk(String(soru || ''))), dil, katlaDerin(acilTablo()));
  }


  // §133 aciliyet hakemi: kalıplar her yeni sette yeni bir kuyruk verdi (T 7/13, V 9/15) — sohbet modeline yalnız SORU
  // gösterilir, "bu kişi şu anda acil yardım mı istiyor?" T+V'de (görülmemiş, ilk yazılan istem): acilin 19/28'i,
  // boş alarm 2/32. Kalıp bulamazsa sorulur (~1 sn). Model yoksa (okuma kipi) yalnız kalıp.
  const ACIL_HAKEM = (q) => `You are triaging a message sent to an offline first-aid helper. Does the person described need emergency medical help RIGHT NOW (call the emergency number or go to the emergency department immediately)?
Answer NO if the message only asks for information or preparation, describes something in the past that is over, is hypothetical ("if ..."), uses a figure of speech, or describes a minor or expected problem.
Reply with exactly one word: YES or NO.

MESSAGE: ${q}`;
  async function acilHakem(soru) {
    if (!AYAR.acilHakem || !AYAR.sohbet) return false;
    try {
      const icerik = AYAR.kalip === 'sablon' ? await sablonla([{ role: 'user', content: ACIL_HAKEM(soru) }], 4)
        : String((await (await getir(`${AYAR.sohbet}/completion`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: `<start_of_turn>user\n${ACIL_HAKEM(soru)}<end_of_turn>\n<start_of_turn>model\n`,
            n_predict: 4, temperature: 0, cache_prompt: true, stop: ['<end_of_turn>'] }),
        })).json()).content || '');
      return /^\W*yes\b/i.test(icerik.trim());
    } catch (e) { return false; }   // hakem yoksa yalnız kalıp
  }
  // sorunun dili tr/en değilse çevirmenle İngilizceye çevrilip kalıba bakılır; hakem çeviriyle (yoksa özgün soruyla) sorulur
  async function acilBak(soru, dil, hakemli = true) {
    if (!AYAR.acilKart) return [];
    let metin = soru, md = dil;
    if (dil !== 'tr' && dil !== 'en' && AYAR.cevirmen) { try { metin = await cevir(soru, dil, 'en', 160); md = 'en'; } catch (e) { /* özgün soru */ } }
    const kalip = acilBelirti(metin, md);
    if (kalip.length) return kalip;
    // §135 denendi, geri alındı: köpeğin kusmasına hakem 112 kartı çıkardı. (1) İsteme "hayvansa hayır" eklemek T+V+E'de acili
    // yakalamayı 31 → 22'ye düşürdü; (2) hayvan kelimesi geçince hakemi atlamak 10 gerçek acili susturacaktı ("atıyor", "pet
    // şişe", "kuş gibi", atın tekmelediği çocuk — kurban insan). Bilinen kusur: evcil hayvan sorusunda ara sıra 112 kartı.
    return hakemli && await acilHakem(metin) ? ['hakem'] : [];
  }

  // kart: cevap yazılmaz; cevap yolunun aramasıyla kaynaklar bulunur (kendi dilinde yoksa köprüyle) ve okuma gibi gösterilir
  async function acilSonuc(soru, bildir, dil, secenek, belirti) {
    const t0 = Date.now();
    const { yedekDiller, cevap: _c, ...geri } = secenek;
    const yalniz = { ...geri, acilBakildi: true, yalnizKaynak: true };
    let r = await sor(soru, bildir, dil, yalniz);
    if (!(r.parcalar || []).length && yedekDiller) {
      const liste = yedekDiller === 'hepsi' ? await mevcutDiller(dil) : yedekDiller;
      if (liste.length) { bildir('kopru', liste); r = await sor(soru, bildir, dil, { ...yalniz, kaynakDilleri: liste }); }
    }
    const parcalar = r.parcalar || [];
    const kitapVar = dildekiler(await kitaplik(), dilAl(dil)).length > 0;
    return { soru, dil, basliklar: r.basliklar || [], parcalar, cevap: '', eksik: [], durdur: false, bilgiYok: parcalar.length === 0,
      okuma: true, anlam: true, acil: { belirti }, kitapVar, ...(r.gruplar ? { gruplar: r.gruplar } : {}),
      toplam_sn: Math.round((Date.now() - t0) / 100) / 10 };
  }

  // ---- 09.11 (Özet §90): cevabın geldiği bölüm — cevaptaki kaynak numaralarından en çok atıf alan makaleler (eşitlikte
  //      ilk anılan önce). Sayfa bunu cevabın üstüne yazar: konu dışı cevabı (yol tutmasına "Altitude sickness") makine
  //      ayıramadı (§89: anlam benzerliği, başlık hakemi, başlık sırası) — okuyan bir bakışta görür. Bilgi eklemez. ----
  function atifBolumleri(metin, parcalar) {
    const say = new Map();
    for (const m of String(metin || '').matchAll(/\[([\d,،，、\s]+)\]/g)) {
      for (const x of m[1].split(/\s*[,،，、]\s*/)) {
        const no = +x.trim(), p = (parcalar || [])[no - 1];
        if (!p) continue;
        const k = (p.kitap || '') + '|' + p.makale;
        const o = say.get(k) || { makale: p.makale, kitap: p.kitap || '', dil: p.dil || '', kaynak: p.kaynak || '', sayi: 0, ilk: no };
        o.sayi++;
        say.set(k, o);
      }
    }
    return [...say.values()].sort((a, b) => b.sayi - a.sayi || a.ilk - b.ilk);
  }

  // ---- 13.11 (§114): karşıt ortam bekçisi — görülmemiş J setinde (J02) "öğle sıcağında" bitkin düşen gönüllüye cevap
  //      hipotermi bölümünden yazıldı (ıslak giysi çıkar, battaniyeyle ört, sıcak içecek) ve hiçbir bekçi görmedi: sıcaktan
  //      bitkin birini ısıtmak zarar verir; tersi (donana serinletme) de öyle. Soru yalnız sıcak bir ortamı anlatıyorsa ve
  //      cevap soğuk konusunun makalesine atıf yapıyorsa (ya da tersi) durur. Ortam ipuçları kullanıcının kendi
  //      sözlerinden (tr, en); "derisi soğuk" gibi belirti sözleri ortam sayılmaz. Sözlüğü olmayan dilde denetlemez.
  //      13.11 (§120): önce atıfların HEPSİ karşıt makaleden olmalıydı; arama genişleyince aynı J02 cevabı bir satırını
  //      psikolojik ilk yardımdan alıp geçti (battaniye, sıcak içecek, sıcak su torbası). Artık TEK karşıt atıf yeter:
  //      kayıtlı 1.142 cevapta yeni alarm yalnız J02 (5 kayıt), boş alarm 0. ----
  const ORTAM = {
    tr: { sicak: /(?<!\p{L})(sıca[kğ]\p{L}*|güneş\p{L}*|bunaltıcı|kavurucu)/u,
      soguk: /(?<!\p{L})(kar(da|a|ı|lı|dan|lar)?(?!\p{L})|tipi\p{L}*|ayaz\p{L}*|kış\p{L}*|don(muş|du|mak|ma|ar)\p{L}*|soğuk (hava|su|ortam|rüzgar|gece)|soğukta|üşü\p{L}*|hipoterm\p{L}*)/u },
    en: { sicak: /\b(heat\w*|hot (weather|day|sun)|sun(burn|stroke|shine)?|scorching)\b/,
      soguk: /\b(snow\w*|freez\w*|icy|frost\w*|cold (weather|water|night|wind)|hypotherm\w*|blizzard)\b/ },
  };
  const ORTAM_MAKALE = { soguk: /hypotherm|frostbite|cold injur|hipoterm|donma/i, sicak: /hypertherm|heat ?stroke|heat exhaust|hipertermi|sıcak çarp|güneş çarp/i };
  function ortamDenetle(soru, dil, bolumler) {
    const O = ORTAM[dil];
    if (!O || !bolumler || !bolumler.length) return [];
    const m = dil === 'tr' ? kucuk(soru) : String(soru).toLowerCase();
    const sicak = O.sicak.test(m), soguk = O.soguk.test(m);
    if (sicak && !soguk && bolumler.some((b) => ORTAM_MAKALE.soguk.test(b.makale || ''))) return ['durum: sıcak ortam sorusuna soğuk bölümü'];
    if (soguk && !sicak && bolumler.some((b) => ORTAM_MAKALE.sicak.test(b.makale || ''))) return ['durum: soğuk ortam sorusuna sıcak bölümü'];
    return [];
  }

  // ---- 13.11 (§122): konu uyumu bekçisi (AYAR.konuBekci) — cevabın dayandığı makale sorunun makalesi mi? Küçük kitabın
  //      bütün makaleleri yardımcıdan (ZIM dizini) listelenir, paragrafları bir kez okunur ve anlam vektörleri önbellekte
  //      kalır (IFRC: 61 makale, 811 paragraf). Soru bu paragraflara karşı sıralanır; cevabın o kitaba yaptığı atıfların
  //      yarısından çoğu birinci makaleden değilse durur. Arama tahmini ölçülenle birebir: belge biçimi anlamSirala'nınki.
  //      Karar ölçümle (§121): çevrilmiş soruyla 13/27 ↔ 6/77; Türkçe soruyla 15/27 ↔ 19/77 (boş alarm çok). ----
  const kitapMakaleOnbellek = new Map();
  async function kitapParagraflari(kitap) {
    if (!kitapMakaleOnbellek.has(kitap)) {
      kitapMakaleOnbellek.set(kitap, (async () => {
        let liste = null;
        try {   // sınav düzeni yardımcısız koşar: AYAR.makaleler bir işlev olabilir (olcum/banka/olc_banka.cjs)
          liste = typeof AYAR.makaleler === 'function' ? await AYAR.makaleler(kitap)
            : (await (await getir(`${AYAR.makaleler}?kitap=${encodeURIComponent(kitap)}`)).json()).makaleler || null;
        } catch (e) { return null; }
        if (!liste || !liste.length) return null;
        const ham = [];
        for (const { yol } of liste) {
          let m;
          try { m = await makale(yol, kitap); } catch (e) { continue; }
          for (const [bolum, metin] of m.paragraflar) ham.push({ ad: m.ad, bolum, metin, yol, kitap, kaynak: 'kiwix' });
        }
        return ham.length ? ham : null;
      })());
    }
    return kitapMakaleOnbellek.get(kitap);
  }
  async function konuDenetle(sorguMetni, metin, parcalar) {
    const S = AYAR.konuBekci || {};
    if (!S.sinir || !AYAR.makaleler) return [];
    const atif = atifBolumleri(metin, parcalar).filter((a) => a.kaynak === 'kiwix' && a.kitap);
    if (!atif.length) return [];
    const kitaplar = await kitaplik();
    for (const kitap of [...new Set(atif.map((a) => a.kitap))]) {
      const k = kitaplar.find((x) => x.ad === kitap);
      if (!k || !(k.makaleSayisi > 0 && k.makaleSayisi < S.sinir)) continue;
      const ham = await kitapParagraflari(kitap);
      if (!ham) continue;
      let tahmin, sirali;
      try { sirali = await anlamSirala(ham, sorguMetni); tahmin = sirali[0][1].ad; } catch (e) { continue; }   // anlam modeli yoksa bekçi susar, öbürleri sürer
      // 20.11 (§235, laboratuvar): `tolerans` > 0 ise en iyi puana bu kadar yakın makaleler de "sorunun makalesi" sayılır (her
      // şeyden biraz anlatan özet sayfası birinci gelince doğru cevap durmasın). 0 (varsayılan) = §122'deki gibi yalnız birinci.
      const tol = S.tolerans || 0;
      const kabul = tol > 0 ? [...new Set(sirali.filter(([pu]) => pu >= sirali[0][0] - tol).map(([, p]) => p.ad))] : [tahmin];
      if (AYAR.konuGozlem) AYAR.konuGozlem({ kitap, sorguMetni, atif: atif.filter((a) => a.kitap === kitap).map(({ makale, sayi }) => ({ makale, sayi })),
        ilk: sirali.slice(0, 40).map(([pu, p]) => ({ puan: Math.round(pu * 1000) / 1000, ad: p.ad, bolum: p.bolum || '' })) });   // yalnız ölçüm
      if (konuUymaz(atif.filter((a) => a.kitap === kitap), kabul)) return [`durum: cevap sorunun makalesinden değil (bağımsız arama: ${tahmin})`];
    }
    return [];
  }
  // karar (modelsiz sınanır): kitabın atıflarının yarısından ÇOĞU tahmin edilen makalenin dışındaysa uymaz; yarı yarıya uyar
  function konuUymaz(atif, tahmin) {   // tahmin: makale adı ya da adlar dizisi (§235 tolerans)
    const kabul = Array.isArray(tahmin) ? tahmin : [tahmin];
    const toplam = atif.reduce((t, a) => t + a.sayi, 0), disari = atif.filter((a) => !kabul.includes(a.makale)).reduce((t, a) => t + a.sayi, 0);
    return toplam > 0 && disari * 2 > toplam;
  }

  // ---- Ö27 (09.11, Özet §86): yazı sistemi bekçisi — çeviri cevaba başka bir alfabenin kelimesini bırakabilir.
  //      F09 (görülmüş): Türkçe cevapta "cımbız" yerine Çince "鑷子"; hiçbir bekçi görmedi, yanlış cevap geçti.
  //      Latin her dilde serbest (ad, birim, kısaltma: EMS, mg); dilin kendi alfabesi ve Latin dışında harf varsa durur.
  //      Tablosu bilinmeyen dilde denetlemez (yanlış alfabeyle bütün cevapları durdurmasın). Ekran çevirilerinin ölçüsü
  //      (olcum/kopru/alfabe.cjs) aynı tabloyu kullanır — kural tek yerde. ----
  const BETIK = {
    liste: ['Latin', 'Cyrillic', 'Greek', 'Arabic', 'Hebrew', 'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Kannada',
      'Malayalam', 'Tamil', 'Telugu', 'Thai', 'Han', 'Hiragana', 'Katakana', 'Hangul'].map((b) => [b, new RegExp(`\\p{Script=${b}}`, 'u')]),
    aile: { Hiragana: 'ja', Katakana: 'ja', Han: 'ja', Hangul: 'ko' },   // birlikte yazılan alfabeler hata değil
    ana: { ar: 'Arabic', fa: 'Arabic', ur: 'Arabic', he: 'Hebrew', bg: 'Cyrillic', ru: 'Cyrillic', uk: 'Cyrillic', sr: 'Cyrillic',
      el: 'Greek', hi: 'Devanagari', mr: 'Devanagari', bn: 'Bengali', pa: 'Gurmukhi', gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam',
      ta: 'Tamil', te: 'Telugu', th: 'Thai', ja: 'ja', zh: 'ja', ko: 'Hangul' },
    latin: new Set(['tr', 'en', 'cs', 'ca', 'da', 'de', 'es', 'et', 'fi', 'fil', 'fr', 'hr', 'hu', 'id', 'is', 'it', 'lt', 'lv',
      'nl', 'no', 'nb', 'nn', 'pl', 'pt', 'ro', 'sk', 'sl', 'sv', 'sw', 'vi', 'zu', 'az', 'ku']),
    ek: { ku: ['Arabic'], ja: ['Han', 'Hiragana', 'Katakana'], zh: ['Han', 'Hiragana', 'Katakana'], ko: ['Han'] },
  };
  function yaziDenetle(cevap, dil) {
    const ana = BETIK.ana[dil] || (BETIK.latin.has(dil) ? 'Latin' : null);
    if (!ana) return [];
    const serbest = ['Latin', ...(ana === 'ja' ? [] : [ana]), ...(BETIK.ek[dil] || [])];
    const izinli = new RegExp(`[${serbest.map((b) => `\\p{Script=${b}}`).join('')}]`, 'u');
    const metin = String(cevap || '').replace(/[μµ](?=[gGlLmM])/g, '');   // mikrogram, mikrolitre
    const yabanci = [];
    for (const m of metin.matchAll(/\p{L}+/gu)) {
      if ([...m[0]].some((h) => !izinli.test(h)) && !yabanci.includes(m[0])) yabanci.push(m[0]);
    }
    return yabanci.length ? [`yazı: ${yabanci.slice(0, 3).join(', ')}`] : [];
  }

  // ---- arama: adaylar geniş toplanır, sıralamayı anlam benzerliği yapar ----

  function tekille(yollar, sinir) {
    const gorulen = new Set(), sonuc = [];
    for (const y of yollar) {
      const anahtar = y.kitap + '\u0000' + y.yol;
      if (!gorulen.has(anahtar)) { gorulen.add(anahtar); sonuc.push(y); }
    }
    return sonuc.slice(0, sinir);
  }

  const BOSLUKSUZ = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

  function icerikKelimeleri(soru, D) {
    if (D.genel && BOSLUKSUZ.test(soru)) {
      // Çince/Japonca boşluksuz yazılır: kelime yerine iki harflik parçalar (kütüphane CJK'yi böyle buluyor — 06.11 ölçüldü)
      const parca = [];
      for (const dizi of soru.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu) || []) {
        for (let i = 0; i + 1 < dizi.length; i++) parca.push(dizi.slice(i, i + 2));
      }
      return [...new Set(parca)].slice(0, 8);
    }
    return (D.kucuk(soru).match(D.harf) || []).filter((w) => w.length > 3 && !D.durak.has(w.slice(0, 5)));
  }

  // aramanın sorguları: bütün içerik kelimeleri birlikte + ikililer. Eski yol (ölçülmüş): ilk 5 kelimenin bütün ikilileri.
  // §185 deney (cesitliArama.acik): kelimeler tekrarsız; ilk 5'in ikililerine ek olarak sorunun BÜTÜNÜNDEN yan yana ikililer.
  // Sebep (§185): "…to power my home during a power outage?" — kelimeler generator, power, home, during, power, outage;
  // "outage" 6. sırada kaldığı için "power outage" hiç aranmadı; hepsi birlikte aranınca sonuç 0 (kütüphane bütün kelimeleri
  // birlikte istiyor). Tıp vikisinde "power outage"ın tek sonucu "Carbon monoxide poisoning".
  function aramaSorgulari(kelimeler, bosluksuz = false, genis = false) {
    const k = genis ? [...new Set(kelimeler)] : kelimeler;
    const sorgular = [k.join(' ')];
    if (bosluksuz) { sorgular.push(...k); return sorgular; }   // CJK: parçalar tek tek (birlikte arama boş dönüyor)
    k.slice(0, 5).forEach((a, i) => k.slice(i + 1, 5).forEach((b) => sorgular.push(`${a} ${b}`)));
    if (genis) for (let i = 0; i + 1 < kelimeler.length; i++) if (kelimeler[i] !== kelimeler[i + 1]) sorgular.push(`${kelimeler[i]} ${kelimeler[i + 1]}`);
    return genis ? [...new Set(sorgular)] : sorgular;   // eski yol birebir aynı
  }

  async function adaylar(soru, basliklar, dil = 'tr', kucukSinir = AYAR.kucukKitap.sinir) {
    // sorunun içerik kelimeleri ve ikili kelime grupları da aranır; İlk yardım her soruda adaydır.
    // Tek kitapta (Türkçe Vikipedi) 05.11'deki sıranın aynısı — denklik sınavı bunu ölçer.
    const D = dilBilgi(dil);   // köprüde genel diller de (tr, en, cs için dilAl ile aynı)
    const kitaplar = dildekiler(await kitaplik(), D);
    if (!kitaplar.length) return [];
    const kelimeler = icerikKelimeleri(soru, D);
    const sorgular = aramaSorgulari(kelimeler, D.genel && BOSLUKSUZ.test(soru), AYAR.cesitliArama && AYAR.cesitliArama.acik);
    const yollar = [];
    // §185 deney: kitap başına arama — her kitabın kendi en iyileri aday olur (forum Wikivoyage'ı boğmaz)
    const cesit = AYAR.cesitliArama && AYAR.cesitliArama.acik && kitaplar.length > 1;
    // §190: kitap başına aramalar sırayla (eşzamanlı arama kiwix-serve'ü düşürüyor — uyariAra'daki ölçü)
    const ara = async (q, n) => (cesit ? (await sinirliHepsi(kitaplar.map((k) => () => metinAra(q, n, [k])), 1)).flat() : metinAra(q, n, kitaplar));
    if (!cesit && ((AYAR.adilSinir && AYAR.adilSinir.acik) || (AYAR.kitapBasina && AYAR.kitapBasina.acik))) {   // §196/§197 deney: adil birleştirme (eski yol hiç koşmaz)
      return adilAdaylar(soru, basliklar, D, kitaplar, sorgular, kelimeler, kitaplar.filter((k) => k.makaleSayisi > 0 && k.makaleSayisi < kucukSinir));
    }
    for (const b of basliklar) {
      for (const k of kitaplar) yollar.push(...await oneri(b, 2, k.ad));
      yollar.push(...await ara(b, 2));
    }
    const sorguYol = [];   // §186: deney açıkken sorgu sonuçları ayrı toplanır, başlıklarınkiyle dönüşümlü dizilir
    for (let i = 0; i < sorgular.length; i++) (cesit ? sorguYol : yollar).push(...await ara(sorgular[i], i === 0 ? 5 : 2));
    for (const k of kitaplar) if (D.hepAday && k.seri.startsWith('wikipedia_')) yollar.push({ kitap: k.ad, yol: D.hepAday });
    // küçük kitap: her içerik kelimesi tek başına da aranır (en iyi 1 sonuç) — sona eklenir, büyük kitabın sırası değişmez
    const kucukler = kitaplar.filter((k) => k.makaleSayisi > 0 && k.makaleSayisi < kucukSinir);
    if (kucukler.length && !(D.genel && BOSLUKSUZ.test(soru))) {
      for (const w of [...new Set(kelimeler)]) yollar.push(...await metinAra(w, 1, kucukler));
    }
    if (!cesit) return tekille(yollar, 20);
    // §186: başlık önerilerinin aramaları 30'luk sınırı sorgulara sıra gelmeden dolduruyordu ("power outage" → karbonmonoksit)
    const bas = tekille(yollar, 999), sor = tekille(sorguYol, 999), dizi = [];
    for (let i = 0; i < Math.max(bas.length, sor.length); i++) { if (i < sor.length) dizi.push(sor[i]); if (i < bas.length) dizi.push(bas[i]); }
    return tekille(dizi, AYAR.cesitliArama.aday || 20);
  }

  // §196 DENEY adil sınır. §195: aramada kaybolan 22 sorunun 17'sinde Heybe'nin kendi aramalarından biri doğru maddeyi buluyordu
  // ama sonuçta 2.–30. sıradaydı; arama başına 2 sonuç alınıyor, aramalar sırayla işlenip 20 maddede kesiliyordu (sondaki kelime
  // çiftlerinin sonuçları hiç alınmıyordu). Burada aynı aramalar aynı sırayla yapılır; sonuçlar ayrı listelerde tutulur ve
  // dönüşümlü birleşir (önce her listenin 1.'si, sonra 2.'si…), böylece hiçbir arama dışarıda kalmaz. Değişen yalnız sınır:
  // arama başına derinlik ve toplam madde sayısı. Kitaplar eskisi gibi birlikte aranır; modele giden 6 ve makale başına sınır aynı.
  function sirayaDiz(listeler, sinir) {
    const dizi = [];
    for (let i = 0; listeler.some((l) => i < l.length); i++) for (const l of listeler) if (i < l.length) dizi.push(l[i]);
    return tekille(dizi, sinir);
  }
  // §197: kitap başına aramanın birleştirmesi — her kitabın listeleri kendi içinde dönüşümlü (kitabın payı kadar), sonra kitaplar
  // dönüşümlü. Bir kitabın çok sonucu öbür kitapların payını yemez (§196: birlikte aranınca forum doğru maddeyi 30.–50.'ye itiyordu).
  function kitapPayli(kitapListeleri, pay) {
    return sirayaDiz(kitapListeleri.map((l) => sirayaDiz(l, pay)), pay * kitapListeleri.length);
  }
  async function adilAdaylar(soru, basliklar, D, kitaplar, sorgular, kelimeler, kucukler) {
    const A = AYAR.adilSinir, d = A.derinlik || 3, listeler = [];
    const KB = AYAR.kitapBasina || {};
    if (KB.acik && kitaplar.length > 1) {   // §197 deney: her kitap ayrı aranır, her kitaba eşit pay
      const kitapListe = kitaplar.map(() => []);
      for (const b of basliklar) {
        for (const [i, k] of kitaplar.entries()) { kitapListe[i].push(await oneri(b, 2, k.ad)); kitapListe[i].push(await metinAra(b, d, [k])); }
      }
      for (let j = 0; j < sorgular.length; j++) for (const [i, k] of kitaplar.entries()) kitapListe[i].push(await metinAra(sorgular[j], j === 0 ? Math.max(5, d) : d, [k]));
      const pay = Math.max(KB.pay || 10, Math.ceil((A.sinir || 30) / kitaplar.length));
      listeler.push(kitapPayli(kitapListe, pay));
      for (const k of kitaplar) if (D.hepAday && k.seri.startsWith('wikipedia_')) listeler.push([{ kitap: k.ad, yol: D.hepAday }]);
      if (kucukler.length && !(D.genel && BOSLUKSUZ.test(soru))) for (const w of [...new Set(kelimeler)]) listeler.push(await metinAra(w, 1, kucukler));
      // kitapların payı önce (sırası korunur), sonra İlk yardım ve küçük kitapların tek kelime aramaları
      return tekille(listeler.flat(), pay * kitaplar.length + 10);
    }
    for (const b of basliklar) {
      for (const k of kitaplar) listeler.push(await oneri(b, 2, k.ad));
      listeler.push(await metinAra(b, d, kitaplar));
    }
    for (let i = 0; i < sorgular.length; i++) listeler.push(await metinAra(sorgular[i], i === 0 ? Math.max(5, d) : d, kitaplar));
    for (const k of kitaplar) if (D.hepAday && k.seri.startsWith('wikipedia_')) listeler.push([{ kitap: k.ad, yol: D.hepAday }]);
    if (kucukler.length && !(D.genel && BOSLUKSUZ.test(soru))) {
      for (const w of [...new Set(kelimeler)]) listeler.push(await metinAra(w, 1, kucukler));
    }
    return sirayaDiz(listeler, A.sinir || 30);
  }

  // ---- kullanıcının kendi dosyaları (yardımcı programın dizini: benim/dizin.json) ----

  async function benimParcalar(soru, D, dil) {
    if (!AYAR.benim) return [];
    let dizin;
    try { dizin = await (await getir(`${AYAR.benim}/dizin.json`, { cache: 'no-store' })).json(); } catch (e) { return []; }
    // önce kelimeyle süzülür (en çok 30 paragraf), sıralamayı anlam benzerliği yapar
    const kokler = [...new Set(icerikKelimeleri(soru, D).map((w) => w.slice(0, 5)))];
    if (!kokler.length) return [];
    const aday = [];
    for (const d of dizin.dosyalar || []) {
      if ((d.dil || 'tr') !== dil) continue;
      for (const p of d.paragraflar || []) {
        const metin = D.kucuk(`${d.baslik} ${d.aciklama || ''} ${p.bolum || ''} ${p.metin}`);
        const puan = kokler.filter((k) => metin.includes(k)).length;
        if (puan) aday.push([puan, d, p]);
      }
    }
    return aday.sort((a, b) => b[0] - a[0]).slice(0, 30)
      .map(([, d, p]) => ({ ad: d.baslik, bolum: p.bolum || '', metin: p.metin, yol: d.dosya, kitap: '', kaynak: 'benim', tur: d.tur }));
  }

  // aday makalelerin paragrafları (kütüphaneden); ek: her paragrafa eklenecek alanlar (köprüde { dil })
  async function adayParcalar(soru, basliklar, dil, ek = {}, kucukSinir = AYAR.kucukKitap.sinir) {
    const ham = [];
    for (const { kitap, yol } of await adaylar(soru, basliklar, dil, kucukSinir)) {
      let m;
      try { m = await makale(yol, kitap); } catch (e) { continue; }
      for (const [bolum, metin] of m.paragraflar) ham.push({ ad: m.ad, bolum, metin, yol, kitap, kaynak: 'kiwix', ...ek });
    }
    return ham;
  }

  // anlam sıralaması (anlam modeli): her paragrafın sorguya benzerliği, büyükten küçüğe
  async function anlamSirala(ham, sorguMetni) {
    const belgeler = ham.map(({ ad, bolum, metin }) => kes(`title: ${ad}${bolum ? ' — ' + bolum : ''} | text: ${kes(metin, 600)}`, 2000));
    // sorguMetni bir dizi olabilir (09.11, §86: özgün soru + çevirisi) — puan, sorguların benzerliklerinin ortalaması
    const sorgular = Array.isArray(sorguMetni) ? sorguMetni : [sorguMetni];
    const vek = await gom([...sorgular.map((q) => `task: search result | query: ${q}`), ...belgeler]);
    const sorguV = vek.slice(0, sorgular.length), vektorler = vek.slice(sorgular.length);
    return vektorler.map((v, i) => [sorguV.reduce((top, s) => top + v.reduce((t, x, j) => t + x * s[j], 0), 0) / sorguV.length, ham[i]])
      .sort((a, b) => b[0] - a[0]);
  }

  // okuma kipi sıralaması (8c, 10.11.2026 — modelsiz): sorunun içerik kelimelerinin kökleri (ilk 5 harf) paragrafta geçiyor mu.
  // Seyrek kök ağır basar (aday paragraflar içindeki ters belge sıklığı): "yılan" tek paragrafta, "yara" her yerdeyse yılan
  // paragrafı öne çıkar. Makale ya da bölüm adında geçen kök yarım ağırlık daha alır. Hiç kök tutmayan paragraf gelmez.
  function kelimeSirala(ham, soru, D) {
    const kokler = [...new Set(icerikKelimeleri(soru, D).map((w) => w.slice(0, 5)))];
    if (!kokler.length) return [];
    const metin = ham.map((p) => D.kucuk(p.metin)), ad = ham.map((p) => D.kucuk(`${p.ad} ${p.bolum || ''}`));
    const agirlik = kokler.map((k) => Math.log(1 + ham.length / (1 + metin.filter((m) => m.includes(k)).length)));
    // 10.11 denendi, geri alındı: BM25 biçimi (geçme sayısı + uzunluk bölmesi) F 16 → 15, G 27 → 26 / 75 (Özet §101)
    return ham.map((p, i) => [kokler.reduce((t, k, j) => t + (metin[i].includes(k) ? agirlik[j] : 0) + (ad[i].includes(k) ? agirlik[j] / 2 : 0), 0), p])
      .filter(([puan]) => puan > 0).sort((a, b) => b[0] - a[0]);
  }

  // §135/§237 seçilen şıkka uyan paragraf (kural tek yerde — cevap yolu ve okuma kipi): aynı kitap ve madde; şık bölüm
  // düzeyindeyse (secilen.bolum tanımlı) aynı bölüm de
  function secilenUyar(p, secilen) {
    return p.kitap === secilen.kitap && p.ad === secilen.ad && (secilen.bolum === undefined || (p.bolum || '') === secilen.bolum);
  }

  // §135/§143 aday bölümler (kural tek yerde — cevap yolu ve okuma kipi): sıralamadaki ilk farklı makaleler, en iyi paragraf
  // puanıyla; anlam ayrımı sayfası ve aynı ana başlık tek şık; her birinin ilk gerçek paragrafı ve AYIRT EDEN KELİMELERİ
  // (§142 insan sınavı: Ercan bu kelimelerle doğru bölümü 15'te 12 seçti, makine 17'de 5) — modelsiz sayım
  function adayBolumler(puanli, ham, dil) {
    const B = !!AYAR.bolumSik;   // §237: bölüm düzeyinde şık (kapalıyken madde düzeyi, eskisi gibi)
    const anahtarOf = (p) => p.kitap + '|' + p.ad + (B ? '|' + (p.bolum || '') : '');
    const ilkParagraf = new Map(), metinler = new Map();
    // ilk gerçek paragraf: menü artığı ("• Sorular • Etiketler • Kullanıcılar") ve çok kısa satır atlanır
    const menuMu = (m) => String(m || '').length < 40 || (String(m).match(/•/g) || []).length >= 3;
    for (const p of ham) {
      const k = anahtarOf(p);
      if (!ilkParagraf.has(k) && !menuMu(p.metin)) ilkParagraf.set(k, p.metin);
      if (!menuMu(p.metin)) metinler.set(k, (metinler.get(k) || '') + ' ' + p.metin);
    }
    const adaylar = [], gorulenM = new Set(), gorulenTaban = new Set();
    for (const [puan, p] of puanli) {
      const k = anahtarOf(p);
      if (p.kaynak !== 'kiwix' || gorulenM.has(k)) continue;
      gorulenM.add(k);
      // anlam ayrımı sayfası şık olmaz; aynı ana başlık ("Ateş" · "Ateş (ocak)") tek şıktır — ilk geleni
      if (ANLAM_AYRIMI.test(p.ad)) continue;
      const taban = kucuk(String(p.ad).replace(/\s*\([^)]*\)\s*$/, '').trim()) + (B ? '|' + (p.bolum || '') : '');
      if (gorulenTaban.has(taban)) continue;
      gorulenTaban.add(taban);
      adaylar.push({ ad: p.ad, ...(B ? { bolum: p.bolum || '' } : {}), kitap: p.kitap, yol: p.yol, dil: p.dil || dil, puan: Math.round(puan * 10000) / 10000, ilk: ilkParagraf.get(k) || '',
        anahtar: k });
      if (adaylar.length === SECENEK_EN_COK) break;
    }
    const kelimeler = ayirtKelimeler(adaylar.map((a) => metinler.get(a.anahtar) || a.ilk || ''), adaylar.map((a) => (a.bolum ? `${a.ad} ${a.bolum}` : a.ad)));
    adaylar.forEach((a, i) => { a.kelimeler = kelimeler[i]; delete a.anahtar; });
    return adaylar;
  }
  // ayırt eden kelimeler: her metinde geçip ÖBÜR adaylarda hiç geçmeyen tam kelimeler, sıklığa göre; boş kelimeler,
  // rakamlı ve 4 harften kısa kelimeler atılır, aynı kökten (ilk 5 harf) tek kelime, başlıkta geçen kelime alınmaz
  const AYIRT_BOS = new Set(('olarak için veya gibi daha kadar ancak fakat çünkü sonra önce olan olur olması olduğu olduğunu olabilir edilir edilen ' +
    'yapılır yapılan bulunan genellikle bazı diğer kendi aynı arasında üzerinde içinde göre şekilde zaman sırasında halinde durumunda durumda ' +
    'bunun bunlar şeklinde ayrıca birlikte değil olan oldu olarak ilgili yönelik nedeniyle kişinin kişiler tarafından üzere içerir bulunur ' +
    'which there their about after before would could should these those other because being where while with from that this have will your ' +
    'what when into than then them they were been also more most such only over some very just like make made does each even much many must ' +
    'here same both well used using usually often might within without between through during under around another following however ' +
    'include includes including known called first second three years people person patients patient cases case cause causes caused').split(' '));
  function ayirtKelimeler(metinler, adlar = [], adet = 5) {
    const kelime = (m) => (String(m).toLocaleLowerCase('tr').match(/[\p{L}]{4,}/gu) || []).filter((w) => !AYIRT_BOS.has(w));
    const sayimlar = metinler.map((m) => { const c = new Map(); for (const w of kelime(m)) c.set(w, (c.get(w) || 0) + 1); return c; });
    const kokler = sayimlar.map((c) => new Set([...c.keys()].map((w) => w.slice(0, 5))));
    return sayimlar.map((c, i) => {
      const baslik = new Set(kelime(adlar[i] || '').map((w) => w.slice(0, 5)));
      const oburleri = new Set(kokler.flatMap((k, j) => (j === i ? [] : [...k])));
      const secilen = [], gorulen = new Set();
      for (const [w] of [...c].sort((x, y) => y[1] - x[1] || y[0].length - x[0].length)) {
        const k = w.slice(0, 5);
        if (oburleri.has(k) || gorulen.has(k) || baslik.has(k)) continue;
        gorulen.add(k); secilen.push(w);
        if (secilen.length === adet) break;
      }
      return secilen;
    });
  }

  // ---- §194 DENEY ana dal ağırlığı (Ercan 17.11: "ilk önce süzülmesi gereken sorunun ana dalı"; süzgeç değil ağırlık) ----
  // §193: havuzu genişletmek 6 bölümün içini dağıttı, küçük model karıştırdı (ulaşan tehlikeli 0 → 4). Bu deney havuzu
  // büyütmez, sıralamayı odaklar: sorunun ana nesnesi (önerilen başlıklardan, sorudaki kelimeyle eşleşen — uyariNesneleri)
  // ile sorudaki öbür içerik kelimelerinden (durum, mekân, kişi…) en az biri AYNI paragrafta (başlığıyla birlikte) geçiyorsa
  // paragraf öne alınır; fazladan her durum kelimesi biraz daha. Yalnız nesneyi taşıyan madde ağırlık almaz: jeneratörün
  // doğrusu "Jeneratör" maddesinde değil, "jeneratör + elektrik kesintisi"ni birlikte anan karbonmonoksit paragrafında.
  // Hiçbir paragraf elenmez. Her paragraf kendi dilindeki soruyla (köprünün çevirisi) değerlendirilir. Ağırlıklar ilkeyle
  // konuldu, bir sete bakılarak ayarlanmadı.
  function anaDalSirala(puanli, soru, basliklar, dil, gruplar) {
    const A = AYAR.anaDal || {};
    if (!A.acik || !puanli.length) return puanli;
    const bilgi = new Map();
    const dilin = (d) => {
      if (bilgi.has(d)) return bilgi.get(d);
      const g = d === dil ? { soru, basliklar } : (gruplar || []).find((x) => x.dil === d);
      let b = null;
      if (g) {
        const D = dilBilgi(d);
        // ana nesne tek: başlıklarda en sık, eşitlikte ilk önerilen başlıktaki ("power outage" nesne değil durum sayılır)
        const nesne = [...new Set(uyariNesneleri(g.soru, g.basliklar, D).map((w) => w.slice(0, 5)))].slice(0, A.nesne || 1);
        const durum = [...new Set(icerikKelimeleri(g.soru, D).map((w) => w.slice(0, 5)))].filter((k) => k.length >= 3 && !nesne.some((n) => n.startsWith(k) || k.startsWith(n)));
        if (nesne.length && durum.length) b = { D, nesne, durum };
      }
      bilgi.set(d, b);
      return b;
    };
    const ekle = (p) => {
      const b = dilin(p.dil || dil);
      if (!b) return 0;
      const kelimeler = (b.D.kucuk(`${p.ad || ''} ${p.bolum || ''} ${p.metin || ''}`).match(b.D.harf) || []);
      const var_ = (k) => kelimeler.some((w) => w.startsWith(k));
      if (!b.nesne.some(var_)) return 0;
      const n = b.durum.filter(var_).length;
      return n ? (A.birlikte || 0.04) + Math.min(n - 1, A.enCok || 2) * (A.fazla || 0.01) : 0;
    };
    return puanli.map(([puan, p]) => [puan + ekle(p), p]).sort((x, y) => y[0] - x[0]);
  }

  async function kaynakBul(soru, basliklar, dil = 'tr', gruplar = null, sorguMetni = soru, secilen = null) {
    // gruplar (dil köprüsü): [{ dil, soru, basliklar }] — her dil kendi kitaplarında kendi sorusuyla aranır.
    // Verilmezse tek grup: sorunun dili (ölçülmüş yol).
    const D = dilAl(dil);
    const ham = [];
    for (const g of gruplar || [{ dil, soru, basliklar }]) ham.push(...await adayParcalar(g.soru, g.basliklar, g.dil, g.dil !== dil ? { dil: g.dil } : {}));
    ham.push(...await benimParcalar(soru, D, dil));
    for (const g of gruplar || []) {   // köprü: kullanıcının başka dildeki dosyaları, o dile çevrilmiş soruyla
      if (g.dil !== dil) ham.push(...(await benimParcalar(g.soru, dilBilgi(g.dil), g.dil)).map((p) => ({ ...p, dil: g.dil })));
    }
    if (!ham.length) return [];
    // 12.11 (§109): sorunun kişisi açıksa başka kişinin makalesi sona, kişiye uyan kardeşi havuza (kişi: soru + çevirileri)
    const kisi = soruKisisi([[soru, dil], ...(gruplar || []).filter((g) => g.dil !== dil).map((g) => [g.soru, g.dil])]);
    // §186 deney (cesitliArama.acik, köprüde birden çok dil): dil başına sıralama — her dilin paragrafları kendi dilindeki soruyla
    const dilAdil = ((AYAR.cesitliArama && AYAR.cesitliArama.acik) || (AYAR.dilSirala && AYAR.dilSirala.acik)) && gruplar && new Set(gruplar.map((g) => g.dil)).size > 1;   // §198: tek başına da
    const sirala = (liste) => (dilAdil ? dilAdilSirala(liste, gruplar, dil, sorguMetni) : anlamSirala(liste, sorguMetni));
    let sirali = await sirala(ham);
    const kardes = await kardesMakaleler(sirali.slice(0, KARDES_BAKIS).map((x) => x[1]), kisi, ham);
    if (kardes.length) sirali = await sirala([...ham, ...kardes]);   // anlam vektörleri önbellekte: yalnız yeniler hesaplanır
    let puanli = kisiSirala(kisiParagraf(sirali, kisi, dil), kisi);
    puanli = anaDalSirala(puanli, soru, basliklar, dil, gruplar);   // §194 deney (kapalıyken aynen)
    if (AYAR.aramaGozlem) AYAR.aramaGozlem({ soru, dil, sorguMetni, puanli, basliklar, gruplar });   // yalnız ölçüm (olcum/kopru/arama_olc.cjs, olcum/sadakat/makale_olc.cjs; §195 başlıklar ve gruplar)
    // §135 şıklar: kullanıcı bir bölüm seçtiyse yalnız o makalenin paragrafları (makale bütünüyle adaydadır); §237: şık bölüm
    // düzeyindeyse (secilen.bolum) yalnız o bölümün paragrafları
    if (secilen) {
      puanli = puanli.filter(([, p]) => secilenUyar(p, secilen));
      const sec = parcaSec(puanli, secilen.kitap + '|' + secilen.ad, PARCA_SAYISI);
      sec.adaylar = [];
      return sec;
    }
    let forumDusen = 0;
    if (AYAR.forumGeri && AYAR.forumGeri.acik) {   // §211
      const kalan = forumGeriAl(puanli);
      forumDusen = puanli.length - kalan.length;
      puanli = kalan;
    }
    const adayMakaleler = adayBolumler(puanli, ham, dil);
    // konu makalesi: en iyi paragrafın makalesi; küçük kitaptaysa ondan AYAR.kucukKitap.konu paragraf gelebilir
    // 13.11 (§120) denendi, geri alındı: öndeki makalelerin başlıklarını sohbet modeline seçtirmek ("kişinin durumu
    // hangisi?"). 150 etiketli soruda doğru makale en başta 114 → 104 (3–6 aday): 17 düzeltti, 27 bozdu.
    const kucukKitap = new Set((await kitaplik()).filter((k) => k.makaleSayisi > 0 && k.makaleSayisi < AYAR.kucukKitap.sinir).map((k) => k.ad));
    const konu = puanli.length && puanli[0][1].kaynak === 'kiwix' && kucukKitap.has(puanli[0][1].kitap)
      ? puanli[0][1].kitap + '|' + puanli[0][1].ad : null;
    const sec = parcaSec(puanli, konu);
    sec.adaylar = adayMakaleler;
    if (forumDusen) sec.forumDusen = forumDusen;   // §211 ölçü
    return sec;
  }

  // §186 deney: dil başına sıralama. Türkçe soru ile İngilizce paragrafın benzerliği, aynı dildeki çiftten sistemli olarak düşük
  // çıkıyor ("Aggressive dogs"un doğru paragrafı 0,540 ile 9. sırada, Türkçe "Çoban köpeği" 0,661 ile 1.). Her dilin paragrafları
  // o dildeki soruyla (köprünün çevirisi; kendi dili için asıl sorgu) sıralanır; iki liste dönüşümlü birleşir, en iyi ilk puanı
  // (aynı dil çiftleri birbirine kıyaslanabilir) olan dil önde başlar.
  async function dilAdilSirala(liste, gruplar, dil, sorguMetni) {
    const kume = new Map();
    for (const p of liste) { const d = p.dil || dil; if (!kume.has(d)) kume.set(d, []); kume.get(d).push(p); }
    const siralar = [];
    for (const [d, ps] of kume) {
      const g = (gruplar || []).find((x) => x.dil === d);
      siralar.push(await anlamSirala(ps, d === dil || !g ? sorguMetni : g.soru));
    }
    return dilHarmanla(siralar);
  }
  // ---- §188 DENEY kaynaktan uyarı ----
  const UYARI_KELIME = { tr: ['zehirlenme', 'tehlike', 'saldırı'], en: ['poisoning', 'danger', 'attack'] };
  const UYARI_AD = { tr: /zehir|tehlik|saldır|güvenli|yaralan|ısırı|sokma|kaza/u, en: /poison|danger|hazard|aggress|attack|safety|injur|toxic|bite|sting|accident/ };
  // §190: uyarı cümlesi = kişiye olumsuz emir/yasak YA DA kişiye zarar (güvence cümlesi değil). §188'in tehlike sözü listesi
  // gürültülüydü (görülmüş 4 soruda 5 kutunun 3'ü): "ölümsüzlük" ölüm, cihazın "zarar görmesi", "yasaklayan yasalar",
  // "dikkat çekmektedir", "heyelan tehlikesini tahmin etmek", "riskini azaltır … death", "those who do not" uyarı sayılıyordu.
  //   emir: olumsuz emir ve yasak (yapmayın, yapılmamalı, asla, sakın, kaçının; never, do not, must not, avoid…)
  //   zarar: kişiye zarar sözü (zehir, ölüm, öldür, yaralan, boğul, tehlikeli, saldır, zarar ver; poison, fatal, death…)
  //   guvence: riskin azaldığını ya da zarar olmadığını söyleyen cümle — emir yoksa uyarı sayılmaz
  const UYARI_SOZ = {
    tr: {
      emir: /(?<!\p{L})(asla|sakın|kaçının\p{L}*|kaçınılmal\p{L}*|yasak(?!la)\p{L}*|dikkat\s+edil(meli|melidir)|dikkat\s+edin\p{L}*|dikkatli\s+olun\p{L}*)(?!\p{L})|\p{L}+m[ae]y[ıi]n([ıi]z)?(?!\p{L})|\p{L}+m[ae]m[ae]l[ıi](d[ıi]r)?(?!\p{L})|\p{L}+m[ae]m[ae]k\s+gerek/iu,
      zarar: /(?<!\p{L})(zehir\p{L}*|öldür\p{L}*|ölüm(?!s[üu]z)\p{L}*|ölümcül|can\s+kayb\p{L}*|hayati\s+tehlike|yaralan\p{L}*|boğul\p{L}*|tehlikeli\p{L}*|saldır\p{L}*|zarar\s+ver\p{L}*)(?!\p{L})/iu,
      guvence: /(risk\p{L}*\s+(azal|düş)\p{L}*|azalt\p{L}*|zarar[ıi]\s+yok|gerek\s+yok)/iu,
    },
    en: {
      // "do not" yalnız emir yerinde (cümle ya da yan cümle başı): "those who do not" emir değil
      emir: /(^|[.;:,!]\s*|\b(and|or|but|then)\s+)(never|do not|don't|avoid)\b|\b(must not|must never|should not|should never|keep away)\b/i,
      zarar: /\b(poison\w*|toxic\w*|fatal\w*|deadly|lethal|kill(s|ed|ing)?|deaths?|dies?|died|dangerous|hazard\w*|injur\w*|attack\w*|warn\w*)\b/i,
      guvence: /\b(decreas|reduc|lower)\w*\s+(the\s+)?(risk|chance|incidence)|\b(no|not a)\s+risk\b|\bnot harmful\b/i,
    },
  };
  function uyariCumlesi(c, dil) {
    const u = UYARI_SOZ[dil];
    if (!u) return false;
    return u.emir.test(c) || (u.zarar.test(c) && !u.guvence.test(c));
  }
  // sıra korunarak en çok n iş aynı anda (uyarı kanalının aramaları; bellekte kiwix'i boğmamak için sınırlı)
  async function sinirliHepsi(isler, n = 4) {
    const sonuc = new Array(isler.length);
    let i = 0;
    const isci = async () => { while (i < isler.length) { const j = i++; sonuc[j] = await isler[j](); } };
    await Promise.all(Array.from({ length: Math.min(n, isler.length) }, isci));
    return sonuc;
  }
  // nesne: önerilen başlıklardaki kelimelerden sorunun bir kelimesiyle önek paylaşanlar (başlıkta kelime eksiz: "Jeneratör",
  // "Köpek"; soruda ekli: "jeneratörü", "köpekleri"); başlıklarda en sık geçen önde, en çok `nesne` tane
  function uyariNesneleri(soru, basliklar, D) {
    const kelime = (m) => (D.kucuk(String(m || '')).match(D.harf) || []).filter((w) => w.length >= 3 && !D.durak.has(w.slice(0, 5)));
    const sorudaki = kelime(soru);
    const sayac = new Map();
    for (const w of kelime((basliklar || []).join(' '))) {
      if (!sorudaki.some((q) => q.startsWith(w.slice(0, 5)) || w.startsWith(q.slice(0, 5)))) continue;
      sayac.set(w, (sayac.get(w) || 0) + 1);
    }
    return [...sayac].sort((a, b) => b[1] - a[1]).map(([w]) => w).slice(0, (AYAR.uyariKanali || {}).nesne || 3);
  }
  // bir dilin kitaplarında nesne + tehlike kelimesi aranır; nesneyi ve uyarı sözünü aynı cümlede taşıyan cümleler puanlanır:
  // sorunun kaç kelimesini taşıdığı (önekle). Kitap başına, sorgu başına `sonuc` madde.
  async function uyariAra(soru, basliklar, dil) {
    const U = AYAR.uyariKanali || {};
    const D = dilBilgi(dil), kel = UYARI_KELIME[dil];
    if (!UYARI_SOZ[dil] || !kel) return [];
    const kitaplar = dildekiler(await kitaplik(), D);
    const nesneler = uyariNesneleri(soru, basliklar, D);
    if (!kitaplar.length || !nesneler.length) return [];
    // §190: aramalar SIRAYLA (aramaEs 1). Ölçü (17.11, kiwix-tools 3.8.2): 8 ve 16 eşzamanlı tam metin aramada kiwix-serve
    // "Unhandled unknown error" verip 500 döndü; TD koşusunda diller de aynı anda aranınca (8–12 arama) sunucu çöktü ve
    // sonraki her soru sessizce "bilgi yok" oldu. Madde okuma 16 eşzamanlıda bile hatasız → okumaEs 4.
    const aramalar = [];
    // önce nesneyi içeren yan yana kelime çiftleri (durum): "power outage" → tıp vikisinde tek sonuç "Carbon monoxide poisoning"
    // (§186); sona konunca 40'lık sınırda kesiliyordu
    const sira = (D.kucuk(soru).match(D.harf) || []).filter((w) => w.length >= 3 && !D.durak.has(w.slice(0, 5)));
    const nk = nesneler.map((w) => w.slice(0, 5));
    const ikili = new Set();
    for (let i = 0; i + 1 < sira.length; i++) if (sira[i] !== sira[i + 1] && [sira[i], sira[i + 1]].some((w) => nk.some((n) => w.startsWith(n)))) ikili.add(`${sira[i]} ${sira[i + 1]}`);
    for (const q of ikili) for (const k of kitaplar) aramalar.push(() => metinAra(q, U.sonuc || 3, [k]));
    for (const n of nesneler) for (const t of kel) for (const k of kitaplar) aramalar.push(() => metinAra(`${n} ${t}`, U.sonuc || 3, [k]));
    const yollar = (await sinirliHepsi(aramalar, U.aramaEs || 1)).flat();
    const sorudaki = (D.kucuk(soru).match(D.harf) || []).filter((w) => w.length > 3 && !D.durak.has(w.slice(0, 5))).map((w) => w.slice(0, 5));
    const nesneKok = nesneler.map((w) => w.slice(0, 5));
    const adaylar = [];
    const secilen = tekille(yollar, U.aday || 40);
    const makaleler = await sinirliHepsi(secilen.map(({ kitap, yol }) => () => makale(yol, kitap).catch(() => null)), U.okumaEs || 4);
    for (const [i, { kitap, yol }] of secilen.entries()) {
      const m = makaleler[i];
      if (!m) continue;
      for (const [, metin] of m.paragraflar) {
        for (const [c] of kaynakBirimleri(metin)) {
          const kelimeler = D.kucuk(c).match(D.harf) || [];
          if (c.length > 400 || !uyariCumlesi(c, dil) || !kelimeler.some((w) => nesneKok.some((n) => w.startsWith(n)))) continue;
          // puan: sorunun kaç kelimesini taşıdığı + madde adı nesneyi (+2) ya da bir tehlike sözünü (+1) taşıyorsa
          // ("Aggressive dogs", "Carbon monoxide poisoning"); doğru uyarı cümlesi sorudan çoğu zaman tek kelime taşır
          const ad = D.kucuk(m.ad);
          const puan = sorudaki.filter((q) => kelimeler.some((w) => w.startsWith(q))).length
            + (nesneKok.some((n) => (ad.match(D.harf) || []).some((w) => w.startsWith(n))) ? 2 : 0) + (UYARI_AD[dil] && UYARI_AD[dil].test(ad) ? 1 : 0);
          adaylar.push({ puan, cumle: c.trim(), makale: m.ad, kitap, yol, dil });
        }
      }
    }
    // anlam süzgeci: kelimesi tutan ama konusu başka cümleler ("Kamp ateşi" → "Toplama kampı", "göz" → "saldırı tespit
    // sistemleri") soruya anlamca uzak düşer. Cümle sorunun kendisiyle (o dildeki) karşılaştırılır.
    // sıra: önce kelime kanıtı (puan: sorunun kelimeleri + madde adı), eşitlikte anlam yakınlığı; anlamca çok uzak olan atılır
    // (7 görülmüş örnekte: karbonmonoksit cümlesi puanda 1., anlamda 3.; "Toplama kampı", "saldırı tespit sistemleri" 0,30 altı)
    const uygun = adaylar.filter((x) => x.puan >= (U.enAzPuan || 3));
    if (!uygun.length) return [];
    const sirali = await anlamSirala(uygun.map((x) => ({ ...x, metin: x.cumle })), soru);
    for (const [benzer, x] of sirali) x.benzer = Math.round(benzer * 1000) / 1000;
    const esik = U.benzer || 0;
    const sonuc = [], gor = new Set();
    for (const x of sirali.map(([, y]) => y).sort((a, b) => b.puan - a.puan || b.benzer - a.benzer)) {
      if (x.benzer < esik || gor.has(x.kitap + '|' + x.makale)) continue;
      gor.add(x.kitap + '|' + x.makale);
      sonuc.push(x);
      if (sonuc.length === (U.enCok || 2)) break;
    }
    return sonuc;
  }

  function dilHarmanla(siralar) {
    const s = siralar.filter((x) => x.length).sort((a, b) => b[0][0] - a[0][0]);
    const sonuc = [];
    for (let i = 0; s.some((x) => i < x.length); i++) for (const x of s) if (i < x.length) sonuc.push(x[i]);
    return sonuc;
  }

  // sıralanmış paragraflardan gösterilecekler: aynı metin bir kez, makale başına sınır (konu makalesine ayrı sınır), en çok PARCA_SAYISI
  function parcaSec(puanli, konu = null, konuSinir = AYAR.kucukKitap.konu) {
    const secilen = [], sayac = {}, gorulenMetin = new Set();
    for (const [puan, p] of puanli) {
      // 06.11: aynı paragraf iki kitapta (ya da iki kez) varsa bir kez gelir — §27 "Bowline ×2", §31 "Ankara ×3"
      const metinAnahtari = p.metin.replace(/\s+/g, ' ').slice(0, 300);
      if (gorulenMetin.has(metinAnahtari)) continue;
      gorulenMetin.add(metinAnahtari);
      const anahtar = p.kitap + '|' + p.ad;
      const makaleSinir = AYAR.cesitliArama && AYAR.cesitliArama.acik ? AYAR.cesitliArama.makaleBasina : MAKALE_BASINA;   // §185
      if ((sayac[anahtar] || 0) < (anahtar === konu ? konuSinir : makaleSinir)) {
        sayac[anahtar] = (sayac[anahtar] || 0) + 1;
        secilen.push({ makale: p.ad, bolum: p.bolum, metin: kes(p.metin, PARCA_UZUNLUK), puan: Math.round(puan * 1000) / 1000,
          yol: p.yol, kitap: p.kitap, kaynak: p.kaynak, tur: p.tur, ...(p.dil ? { dil: p.dil } : {}) });
      }
      if (secilen.length === PARCA_SAYISI) break;
    }
    // uyarı kutuları (AYAR.uyariKutusu): en iyi paragrafın makalesinden, sıradaki yerleriyle, seçilmemiş olanlar
    const ekSinir = AYAR.uyariKutusu || 0;
    if (ekSinir && secilen.length) {
      const ilk = secilen[0], alinan = new Set(secilen.map((x) => x.metin.replace(/\s+/g, ' ').slice(0, 300)));
      let ek = 0;
      for (const [puan, p] of puanli) {
        if (ek === ekSinir) break;
        if (p.kitap !== ilk.kitap || p.ad !== ilk.makale || !UYARI_BOLUM.test(p.bolum || '')) continue;
        const anahtar = kes(p.metin, PARCA_UZUNLUK).replace(/\s+/g, ' ').slice(0, 300);
        if (alinan.has(anahtar)) continue;
        alinan.add(anahtar);
        ek++;
        secilen.push({ makale: p.ad, bolum: p.bolum, metin: kes(p.metin, PARCA_UZUNLUK), puan: Math.round(puan * 1000) / 1000,
          yol: p.yol, kitap: p.kitap, kaynak: p.kaynak, tur: p.tur, uyari: true, ...(p.dil ? { dil: p.dil } : {}) });
      }
    }
    return secilen;
  }
  const UYARI_BOLUM = /^(key action|key actions|note|notes|caution|warning|warnings|important|uyarı|uyarılar|dikkat|önemli)$/iu;

  // ---- okuma kipi (8c — Ercan 07.11: "RAM yetmez ya da modeller açılmazsa Heybe tarayıcı gibi çalışır") ----
  // Hiç model yokken de soru sorulur: kitaplarda aranır, ilgili paragraflar kendi sözleriyle gösterilir, cevap YAZILMAZ.
  // Model uydurmaz çünkü model yok; okuyan kaynağın kendisini okur. Yalnız kendi dilindeki kitaplar (köprü çevirmen ister).
  // secenek.anlam: anlam modeli açıksa sıralamayı o yapar (sohbet modeli açılmadan önce ya da zayıf makinede yalnız o).
  async function okumaKaynak(soru, dil = 'tr', secenek = {}) {
    const D = dilAl(dil);
    // başlık önerisini sohbet modeli yapamaz: sorunun içerik kelimeleri başlık gibi aranır (her biri adla ve metinle)
    const kelimeler = [...new Set(icerikKelimeleri(soru, D))].slice(0, OKUMA_KELIME);
    // küçük kitapta kelimeler tek tek de aranır (AYAR.kucukKitap.okuma, §120) — okuma kipi cevap yazmaz, yalnız bölüm gösterir
    const ham = [...await adayParcalar(soru, kelimeler, dil, {}, AYAR.kucukKitap.okuma), ...await benimParcalar(soru, D, dil)];
    if (!ham.length) return [];
    const kisi = soruKisisi([[soru, dil]]);   // 12.11 (§109): sohbet yolundaki kişi kuralının aynısı
    const sirala = async (h) => (secenek.anlam ? anlamSirala(h, soru) : kelimeSirala(h, soru, D));
    let sirali = await sirala(ham);
    const kardes = await kardesMakaleler(sirali.slice(0, KARDES_BAKIS).map((x) => x[1]), kisi, ham);
    if (kardes.length) sirali = await sirala([...ham, ...kardes]);
    // paragraf kişisi yalnız anlam puanında (kelime puanının ölçeği başka)
    const puanli = kisiSirala(secenek.anlam ? kisiParagraf(sirali, kisi, dil) : sirali, kisi);
    if (AYAR.aramaGozlem) AYAR.aramaGozlem({ soru, dil, sorguMetni: soru, puanli, okuma: true });   // yalnız ölçüm
    if (secenek.secilen) {   // §143: kullanıcının seçtiği bölüm — yalnız onun paragrafları
      const s = parcaSec(puanli.filter(([, p]) => secilenUyar(p, secenek.secilen)), secenek.secilen.kitap + '|' + secenek.secilen.ad, PARCA_SAYISI);
      s.adaylar = [];
      return s;
    }
    const sec = parcaSec(puanli);
    sec.adaylar = adayBolumler(puanli, ham, dil);   // §143: okuma kipinde de bölümler arasında seçim (modelsiz)
    return sec;
  }

  async function okuAsil(soru, bildir = () => {}, dil = 'tr', secenek = {}) {
    const t0 = Date.now();
    const kitapVar = dildekiler(await kitaplik(), dilAl(dil)).length > 0;
    bildir('okuma');
    const parcalar = await okumaKaynak(soru, dil, secenek);
    const belirti = await acilBak(soru, dil, false);   // §133: okuma kipinde de acil numara önce gösterilir (hakemsiz: model yok)
    return { soru, dil, basliklar: [], parcalar, adaylar: parcalar.adaylar || [], cevap: '', eksik: [], durdur: false, bilgiYok: parcalar.length === 0, okuma: true,
      anlam: !!secenek.anlam, kitapVar, ...(belirti.length ? { acil: { belirti } } : {}), toplam_sn: Math.round((Date.now() - t0) / 100) / 10 };
  }

  // ---- sayı denetçisi: cevaptaki her "sayı + birim" kaynakta aynen geçiyor mu? ----

  const YAZIYLA = { bir: '1', iki: '2', 'üç': '3', 'dört': '4', 'beş': '5', 'altı': '6', yedi: '7',
    sekiz: '8', dokuz: '9', on: '10', yirmi: '20', otuz: '30', 'yüz': '100' };
  const BIRIM = { g: 'g', gr: 'g', gram: 'g', mg: 'mg', miligram: 'mg', kg: 'kg', kilogram: 'kg',
    l: 'l', lt: 'l', litre: 'l', ml: 'ml', mililitre: 'ml', cm: 'cm', santimetre: 'cm',
    mm: 'mm', m: 'm', metre: 'm', dk: 'dk', dakika: 'dk', sn: 'sn', saniye: 'sn',
    saat: 'saat', 'gün': 'gün', hafta: 'hafta', ay: 'ay', 'yıl': 'yıl', '°c': 'c', c: 'c',
    derece: 'c', 'kaşık': 'kaşık', 'tatlı': 'kaşık', 'çay': 'kaşık', yemek: 'kaşık',
    bardak: 'bardak', tablet: 'tablet', damla: 'damla', kez: 'kez', defa: 'kez', 'bası': 'kez',
    kat: 'kat', 'yüzde': '%', '%': '%' };
  // Python'daki \b'nin Unicode karşılığı: ardından harf, rakam ya da _ gelmez
  // 06.11: baştaki sınır — yoksa "tansiyon" 10, "güç" 3, "tedbir" 1 okunuyordu (Python'da da)
  const _S = '(?<![\\p{L}\\p{N}_])(\\d+(?:[.,]\\d+)?|' + Object.keys(YAZIYLA).sort((a, b) => b.length - a.length).join('|') +
    ')(?![\\p{L}\\p{N}_])';
  const DESEN = new RegExp('(%\\s*)?' + _S + '\\s*(?:(?:-|–|—|ila|ile|veya|ya da)\\s*' + _S +
    ')?\\s*(°\\s*c|%|[a-zçğıöşü]+)?', 'gu');

  function birimBul(kelime) {
    kelime = (kelime || '').replace(/ /g, '');
    return BIRIM[kelime] || BIRIM[kelime.replace(/[ıiuüdeaınlr]+$/u, '')] || '?';
  }

  const BUCUK = new RegExp('(?<![\\p{L}\\p{N}_])(\\d+|' + Object.keys(YAZIYLA).sort((a, b) => b.length - a.length).join('|') +
    ')\\s+buçuk(?![\\p{L}\\p{N}_])', 'gu');

  function kesirli(metin) {
    // "bir buçuk" → "1.5", "yarım" → "0.5" (05.11: "bir buçuk ila üç gram" ile "1,5 ila 3 gram" aynı şey)
    metin = metin.replace(BUCUK, (t, sayi) => (YAZIYLA[sayi] ?? sayi) + '.5');
    return metin.replace(/(?<![\p{L}\p{N}_])yarım(?![\p{L}\p{N}_])/gu, '0.5');
  }

  // 06.11: Türkçede binlik ayracı nokta — "15.754.053" → "15754053" (Python'da da: _binlik)
  const BINLIK_TR = /(?<![\d.,])(\d{1,3})((?:\.\d{3})+)(?![\d,]|\.\d)/g;
  const binlikTr = (m) => m.replace(BINLIK_TR, (x, a, b) => a + b.replace(/\./g, ''));

  function olcuyle(metin) {
    // metindeki (sayı, birim) çiftleri; aralıkta ("3 ila 4 gram") iki uç da birimi alır
    const cift = new Map();
    // 06.11: "İ".toLowerCase() → "i̇"; cümle başındaki "İki" sayı sayılmıyordu (K2 deliği, Python'da da düzeltildi);
    // aynı sınıf: büyük harfli "ALTI AY" → "alti" (Türkçe küçültme: I → ı)
    for (const [, yuzde, s1, s2, sonraki] of kesirli(binlikTr(metin.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase())).matchAll(DESEN)) {
      const birim = yuzde ? '%' : birimBul(sonraki);
      for (const sayi of [s1, s2]) {
        if (sayi) {
          const s = (YAZIYLA[sayi] ?? sayi).replace(/,/g, '.');
          cift.set(s + '|' + birim, [s, birim]);
        }
      }
    }
    return cift;
  }

  // İngilizce ve Çekçe ölçü okuyucu (06.11.2026). Türkçe yukarıdaki olcuyle aynen kalır (Python ile denk).
  function olcuKur(c) {
    const kelime = Object.keys(c.yaziyla).sort((a, b) => b.length - a.length).join('|');
    const sayi = kelime ? '\\d+(?:[.,]\\d+)?|' + kelime : '\\d+(?:[.,]\\d+)?';   // genel dilde yalnız rakam
    // binlik ayracı: İngilizce virgül ("15,754,053"), Çekçe boşluk ("15 754 053"), genel ikisi de (06.11)
    c.binlik = c.binlik || ((m) => m);
    const sinir = c.sinir || '[\\p{L}\\p{N}_]';   // genel dilde Çince/Japonca harfe bitişik rakam da okunur ("2025年")
    const S = '(?<!' + sinir + ')(' + sayi + ')(?!' + sinir + ')';   // "often" ≠ ten
    const desen = new RegExp('(%\\s*)?' + S + '\\s*(?:(?:-|–|—|' + c.aralik.join('|') + ')\\s*' + S +
      ')?\\s*(°\\s*c|%|\\p{L}+)?', 'gu');
    const bucuk = new RegExp('(?<!' + sinir + ')(\\d+' + (kelime ? '|' + kelime : '') + ')\\s+' + c.bucuk + '(?!' + sinir + ')', 'gu');
    const yarim = new RegExp('(?<![\\p{L}\\p{N}_])(?:' + c.yarim + ')(?![\\p{L}\\p{N}_])', 'gu');
    // 06.11: c.kes bir ya da birkaç kök önerir ("minutes" → minute; eski tek kök "minut" bulamıyordu)
    const birim = (k) => { k = (k || '').replace(/ /g, ''); return c.birim[k] || [].concat(c.kes(k)).map((x) => c.birim[x]).find(Boolean) || '?'; };
    return function (metin) {
      const cift = new Map();
      const m = (c.on ? c.on(c.binlik(metin.toLowerCase())) : c.binlik(metin.toLowerCase()))
        .replace(bucuk, (x, s) => (c.yaziyla[s] ?? s) + '.5').replace(yarim, '0.5');
      for (const [, yuzde, s1, s2, sonraki] of m.matchAll(desen)) {
        const b = yuzde ? '%' : birim(sonraki);
        for (const sayi of [s1, s2]) {
          if (sayi) { const s = (c.yaziyla[sayi] ?? sayi).replace(/,/g, '.'); cift.set(s + '|' + b, [s, b]); }
        }
      }
      return cift;
    };
  }

  function birimler(liste) {   // { 'dk': ['minute', 'min'] } → { minute: 'dk', min: 'dk' }
    const t = {};
    for (const [b, kelimeler] of Object.entries(liste)) for (const k of kelimeler) t[k] = b;
    return t;
  }

  const OLCU = {
    tr: olcuyle,
    en: olcuKur({
      yaziyla: { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
        ten: '10', twenty: '20', thirty: '30', hundred: '100' },
      aralik: ['to', 'or', 'and'], bucuk: 'and a half', yarim: 'half',
      binlik: (m) => m.replace(/(?<![\d.,])(\d{1,3})((?:,\d{3})+)(?![\d.]|,\d)/g, (x, a, b) => a + b.replace(/,/g, '')),
      // 06.11 (dil köprüsü): "double the bleach" = "iki katı", "half a teaspoon" = "yarım çay kaşığı", "½"
      on: (m) => m.replace(/-and-a-half\b/g, ' and a half').replace(/\bdouble\b/g, '2 fold').replace(/\btriple\b/g, '3 fold').replace(/\btwice\b/g, '2 times')
        .replace(/\bhalf an?\s+/g, 'half ').replace(/½/g, ' 0.5 ')
        // "a teaspoon", "a full teaspoon" = 1 (Türkçesi "bir çay kaşığı" diye çevrilir)
        .replace(/\b(?:an?|a full|full)\s+(?=(?:teaspoon|tablespoon|tsp|tbsp|spoon|cup|glass|liter|litre|drop|tablet|pill|minute|hour|day|week|month|year)s?\b)/g, '1 '),
      kes: (k) => [k.replace(/s$/, ''), k.replace(/es$/, '')],
      birim: birimler({ g: ['g', 'gram', 'gramme'], mg: ['mg', 'milligram'], kg: ['kg', 'kilogram', 'kilo'],
        l: ['l', 'liter', 'litre'], ml: ['ml', 'milliliter', 'millilitre'], cm: ['cm', 'centimeter', 'centimetre'],
        mm: ['mm', 'millimeter', 'millimetre'], m: ['m', 'meter', 'metre'], dk: ['min', 'minute'], sn: ['sec', 'second'],
        saat: ['h', 'hr', 'hour'], 'gün': ['day'], hafta: ['week'], ay: ['month'], 'yıl': ['year', 'yr'],
        c: ['°c', 'c', 'degree', 'celsius'], 'kaşık': ['teaspoon', 'tablespoon', 'tsp', 'tbsp', 'spoon'],
        bardak: ['cup', 'glass'], tablet: ['tablet', 'pill'], damla: ['drop'], kez: ['time', 'compression'], kat: ['fold'], '%': ['percent', '%'] }),
    }),
    cs: olcuKur({
      yaziyla: { jeden: '1', jedna: '1', jedno: '1', dva: '2', 'dvě': '2', 'tři': '3', 'čtyři': '4', 'pět': '5',
        'šest': '6', sedm: '7', osm: '8', 'devět': '9', deset: '10', dvacet: '20', 'třicet': '30', sto: '100' },
      aralik: ['až', 'nebo', 'a'], bucuk: 'a půl', yarim: 'půl',
      binlik: (m) => m.replace(/(?<![\d,])(\d{1,3})((?:[ \u00a0\u202f]\d{3})+)(?![\d,]|[ \u00a0\u202f]\d)/g, (x, a, b) => a + b.replace(/[ \u00a0\u202f]/g, '')),
      kes: (k) => k,
      birim: birimler({ g: ['g', 'gram', 'gramy', 'gramů'], mg: ['mg', 'miligram', 'miligramy', 'miligramů'],
        kg: ['kg', 'kilogram', 'kilogramy', 'kilogramů', 'kila', 'kil'], l: ['l', 'litr', 'litry', 'litrů', 'litru'],
        ml: ['ml', 'mililitr', 'mililitry', 'mililitrů'], cm: ['cm', 'centimetr', 'centimetry', 'centimetrů'],
        mm: ['mm', 'milimetr', 'milimetry', 'milimetrů'], m: ['m', 'metr', 'metry', 'metrů', 'metru'],
        dk: ['min', 'minuta', 'minuty', 'minut', 'minutu'], sn: ['s', 'sekunda', 'sekundy', 'sekund', 'sekundu'],
        saat: ['h', 'hod', 'hodina', 'hodiny', 'hodin', 'hodinu'], 'gün': ['den', 'dny', 'dní', 'dnů', 'dne'],
        hafta: ['týden', 'týdny', 'týdnů', 'týdne'], ay: ['měsíc', 'měsíce', 'měsíců'], 'yıl': ['rok', 'roky', 'let', 'roku'],
        c: ['°c', 'c', 'stupeň', 'stupně', 'stupňů', 'stupních'], 'kaşık': ['lžíce', 'lžic', 'lžička', 'lžičky', 'lžiček', 'lžíci', 'lžičku'],
        bardak: ['hrnek', 'hrnky', 'hrnků', 'sklenice', 'sklenic', 'sklenici'], tablet: ['tableta', 'tablety', 'tablet', 'tabletu'],
        damla: ['kapka', 'kapky', 'kapek', 'kapku'], kez: ['krát'], '%': ['procent', 'procento', 'procenta', '%'] }),
    }),
  };

  const GENEL_OLCU = olcuKur({ binlik: (m) => m.replace(/(?<![\d.,])(\d{1,3})((?:[, \u00a0\u202f]\d{3})+)(?![\d.,])/g, (x, a, b) => a + b.replace(/[, \u00a0\u202f]/g, '')),
    yaziyla: {}, aralik: ['to'], bucuk: '\u0000yok', yarim: '\u0000yok', kes: (k) => k, birim: { '%': '%', '°c': 'c' },
    sinir: '[\\p{N}_\\p{Script=Latin}\\p{Script=Cyrillic}\\p{Script=Greek}]' });
  function olcuAl(dil) { return OLCU[dil] || (DIL[dil] ? OLCU.tr : GENEL_OLCU); }

  function kaynakOlculeri(parcalar, dil) {
    // her paragraf kendi dilinin okuyucusuyla okunur (dil köprüsü); birimler ortak adlara iner (dk, g, ml…)
    const olc = olcuAl(dil);
    if (!parcalar.some((p) => p.dil && p.dil !== dil)) return olc(parcalar.map((p) => p.metin).join(' '));   // ölçülmüş yol
    const birlesik = new Map();
    for (const d of new Set(parcalar.map((p) => p.dil || dil))) {
      const o = olcuAl(d);
      for (const [k, v] of o(parcalar.filter((p) => (p.dil || dil) === d).map((p) => p.metin).join(' '))) birlesik.set(k, v);
    }
    return birlesik;
  }

  function denetle(parcalar, cevap, dil = 'tr') {
    const olc = olcuAl(dil);
    cevap = cevap.replace(/\[[\d,\s]+\]/g, '');
    cevap = cevap.replace(/^\s*\d+[.)]\s/gm, '');   // liste numarası ("2. adım") sayı değildir
    const kaynak = kaynakOlculeri(parcalar, dil);
    const kaynakSayilar = new Set([...kaynak.values()].map(([s]) => s));
    const sirali = [...olc(cevap).values()].sort((a, b) =>
      a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
    const eksik = [];
    // dil köprüsü: Türkçedeki "bir" çoğu zaman artikeldir ("bir bandaj" = "a bandage"); birimsiz 1 başka dilde aranmaz
    const yabanci = parcalar.some((p) => p.dil && p.dil !== dil);
    for (const [sayi, birim] of sirali) {
      if (birim === '?' && kaynakSayilar.has(sayi)) continue;
      if (yabanci && birim === '?' && sayi === '1') continue;
      if (!kaynak.has(sayi + '|' + birim)) eksik.push(`${sayi} ${birim}`);
    }
    return eksik;
  }

  function terimDenetle(soru, cevap, dil) {
    // dil köprüsü (06.11): sorunun içerik kelimelerinden (4 harflik kök) hiçbiri çeviride yoksa çeviri konuyu
    // kaybetmiştir. Ölçüm: TranslateGemma "stinging nettle"ı "sarmaşık" çevirdi → "Sarmaşık çiğ tüketilebilir".
    // 6 köprü ölçümünde (120 cevap) yalnız bu cevabı durdurdu, boş alarm yok — olcum/sonuc/olcum_kopru_*.jsonl
    const D = dilAl(dil);
    const kokler = [...new Set(icerikKelimeleri(soru, D).map((w) => w.slice(0, 4)))];
    if (!kokler.length) return [];
    const metin = D.kucuk(cevap);
    return kokler.some((k) => metin.includes(k)) ? [] : [`terim: ${kokler.join(', ')}`];
  }

  // ---- Ö12: olumsuzluk denetçisi (06.11 gece — LM'in uyarısı, Özet §35, §38) ----
  // Çeviri olumsuzluğu düşürebilir ya da ekleyebilir ("do not cut" → "kesin"); sayı ve terim denetçisi bunu görmez.
  // Birim: satır (satır sayıları tutmazsa cümle). Her birimde "olumsuzluk var mı" özgünde ve çeviride aynı olmalı.
  // Sayı değil varlık: Türkçe her fiile olumsuzluk koyar ("do not rub or massage" → "ovmayın ve masaj yapmayın").
  // Ölçülmüş diller: en, tr, cs. Öbür dillerde çeviri özgünün diline geri çevrilip öyle sayılır (olumsuzlukDenetle).
  const TR_OLUMSUZ_KELIME = /^(değil\p{L}*|yok|yoktur|yoktu|hayır|kaçın\p{L}*|sakın\p{L}*)$/u;
  // fiil olumsuzu: -mayın/-meyiniz · -mamalı/-memek/-mamaya (-mama-) · -mıyor · -mayacak · -maz/-mez(se/ler/dir) ·
  // -masa/-mese · -mayınca · -mayan/-meyen ("önerilmeyen") · çekimli -mamış ("bildirilmemiştir").
  // Bilerek dışarıda: -madan/-meden ("without"), yalın -mamış ("pişmemiş" = "uncooked" sıfatı). Eşi İngilizcede "non-".
  const TR_OLUMSUZ_EK = /^(\p{L}+m[ae]y[ıiuü]n(ız|iz|uz|üz)?|\p{L}{2,}m[ae]m[ae]\p{L}*|\p{L}+m[ıiuü]yor\p{L}*|\p{L}+m[ae]y[ae]c[ae]k\p{L}*|\p{L}+m[ae]z(s[ae]\p{L}*|l[ae]r\p{L}*|d[ıi]r)?|\p{L}+m[ae]s[ae](yd[ıi]|l[ae]r)?|\p{L}+m[ae]y[ıi]nc[ae]|\p{L}+m[ae]y[ae]n(l[ae]r)?\p{L}{0,4}|\p{L}+m[ae]m[ıiuü]ş(t[ıiuü]r|t[ıiuü]|l[ae]rd[ıi]r|s[ae]))$/u;
  const CS_OLUMSUZ_KELIME = /^(ne|nikdy|není|nejsou|nebyl\p{L}*|nelze|nesmí\p{L}*|nemá\p{L}*|nemůže\p{L}*|nedoporuč\p{L}*|žádn\p{L}*|ani|nic)$/u;
  const CS_OLUMSUZ_EMIR = /^ne(?!ch)\p{L}{2,}(te|jte)$/u;   // nedávejte, nepijte (nechte = "bırakın", olumlu)
  const KATLI = new Set(['tr', 'cs']);
  const OLUMSUZ_SAY = {
    en: (birim) => {
      const m = birim.toLowerCase().replace(/[’']/g, "'")
        .replace(/\b(no|not)\s+(more|less|fewer|later|earlier|longer|greater|higher|lower|sooner)\s+than\b/g, ' ')   // "no more than 4 g" = "en fazla"
        .replace(/\b(if|whether)\s+or\s+not\b|\bnot\s+only\b/g, ' ')
        .replace(/\b(to|and|or|help|helps)\s+avoid\b/g, ' ');   // amaç: "to avoid caking" = "önlemek için" (yasak değil)
      return (m.match(/\b(not|never|no|none|nor|neither|cannot|avoid|avoids|avoided|avoiding|non-\w+)\b|n't\b/g) || []).length;
    },
    tr: (birim) => (kucuk(birim).match(/\p{L}+/gu) || []).filter((w) => TR_OLUMSUZ_KELIME.test(w) || TR_OLUMSUZ_EK.test(w)).length,
    cs: (birim) => (birim.toLowerCase().match(/\p{L}+/gu) || []).filter((w) => CS_OLUMSUZ_KELIME.test(w) || CS_OLUMSUZ_EMIR.test(w)).length,
  };

  function cevapSatirlari(metin) {
    // kaynak numaraları ve giriş cümlesi ("Kaynaklara göre…:") birim sayılmaz
    // madde işareti ve liste numarası ("2. ") atılır; satırın kendi sayısı kalır ("150 to 200 mg" — 06.11 dişi buldu)
    const satirlar = metin.replace(/\[[\d,\s]+\]/g, '').split(/\r\n|\r|\n/).map((x) => x.replace(/^[\s*•\-–]+/, '').replace(/^\d+[.)]\s+/, '').trim())
      .filter((x) => x && !/:\s*$/.test(x));
    return satirlar;
  }
  function cumleBirimleri(metin) {
    return cevapSatirlari(metin).join(' ').split(/(?<=[.!?。！？])\s+/).map((x) => x.trim()).filter(Boolean);
  }

  // ---- Ö28 (09.11, Özet §86): kip denetimi — çeviri kaynağın "düşünülebilir"ini "zorunlu" yapmasın.
  //      F17 (görülmüş): "Consider having your spouse take … acetylsalicylic acid" → "… almasını sağlamalıdır" (kaynak
  //      "düşünülebilir" diyor; tuzak "kesinleştirme"). Kayıtlı 129 köprü cevabında (en → tr) yalnız bu satıra alarm.
  //      Yalnız güçlendirme yönü (seçimlik → zorunlu); ölçülen diller en → tr. Birim olumsuzluktaki gibi satır, tutmazsa cümle. ----
  const KIP = {
    en: { yumusak: /\b(consider\w*|may|might|could|can be|optional\w*|it is reasonable|if (possible|available|desired|willing))\b/i,
      zorunlu: /\b(must|should|shall|always|needs? to|ha(ve|s) to|required|essential|mandatory)\b/i },
    tr: { zorunlu: /(?<!\p{L})(mutlaka|kesinlikle|şart\p{L}*|zorunlu\p{L}*|gerek(ir|iyor|li|lidir|mektedir|ecek))(?!\p{L})|\p{L}+m[ae]l[ıi](d[ıi]r|s[ıi]n[ıi]z|s[ıi]n|y[ıi]z|d[ıi]rl[ae]r)?(?!\p{L})/u },
  };
  function kipDenetle(ozgun, kd, ceviri, dil) {
    if (kd !== 'en' || dil !== 'tr') return [];
    let a = cevapSatirlari(ozgun), b = cevapSatirlari(ceviri);
    if (a.length !== b.length) { a = cumleBirimleri(ozgun); b = cumleBirimleri(ceviri); }
    if (a.length !== b.length) return [];
    const satir = [];
    a.forEach((x, i) => {
      if (KIP.en.yumusak.test(x) && !KIP.en.zorunlu.test(x) && KIP.tr.zorunlu.test(kucuk(b[i]))) satir.push(i + 1);
    });
    return satir.length ? [`kip: ${satir.join(', ')}. satır`] : [];
  }

  // ---- Ö29 (09.11, Özet §87): aktarma denetimi — modelin yazdığı (çeviriden ÖNCEKİ) cevabın her satırı, gösterdiği kaynak
  //      paragrafına karşı: kaynakta olumsuz olan eylem cevapta olumluysa (ya da tersi) durur. Olumsuzluk denetçisi çeviriyi
  //      özgüne karşı sayar; bu, özgünü kaynağa karşı. F10 (0.19.0a, görülmüş): kaynak "The following actions are not
  //      effective…: • applying a cold compress", model "Apply a cold compress [1, 2]." yazdı; çeviri sadıktı, hiçbir bekçi
  //      görmedi. Birim: kaynakta cümle; listede her madde, giriş cümlesinin olumsuzluğunu taşır. Ölçülen dil: en. ----
  const AKTARMA_DURAK = new Set(['that', 'this', 'with', 'from', 'have', 'they', 'them', 'thei', 'your', 'what', 'when',
    'then', 'than', 'also', 'into', 'only', 'more', 'most', 'some', 'such', 'very', 'been', 'were', 'will', 'shou', 'coul',
    'woul', 'must', 'need', 'pers', 'peop', 'firs', 'prov', 'help', 'make', 'sure', 'even', 'each', 'othe', 'afte', 'befo',
    'abou', 'unti', 'whil', 'here', 'ther', 'base', 'sour', 'foll', 'acti', 'step',
    // üç harfliler ("rub", "ice", "cut" içerik kelimesidir; bunlar değil)
    'the', 'and', 'for', 'are', 'not', 'can', 'you', 'his', 'her', 'its', 'may', 'any', 'all', 'but', 'has', 'had', 'was',
    'who', 'how', 'why', 'our', 'out', 'off', 'own', 'too', 'yes', 'via', 'per', 'one', 'two', 'etc', 'him', 'she', 'did']);
  const aktarmaKokleri = (m) => [...new Set((m.toLowerCase().match(/[a-z]{3,}/g) || []).map((w) => w.slice(0, 4))
    .filter((k) => !AKTARMA_DURAK.has(k)))];
  // Olumsuzluğun KAPSAMI: "not/never/no/avoid/do not" sözcüğü eşleşen içerik kelimesinin en çok 5 kelime önünde, aynı yan
  // cümlede (virgül, noktalı virgül, iki nokta, parantez araya girmeden) ve bir koşulun (if/when/unless) içinde olmadan
  // durmalı. "Access EMS if the person cannot walk" eylemi olumsuzlamaz; "A cold compress should not be applied" olumsuzlar
  // (olumsuzluk edilgen fiilin hemen önünde: kelime SONRA da 3 kelime içinde olabilir). Listede giriş cümlesi olumsuzsa
  // ("The following actions are not effective…:") her madde olumsuzdur.
  const OLUMSUZ_SOZ = /^(not|never|no|none|nor|neither|cannot|can't|don't|doesn't|didn't|won't|shouldn't|mustn't|avoid|avoids|avoiding|without)$/;
  function kapsamliOlumsuz(metin, kokler) {
    // metindeki her kökün olumsuzluk kapsamında olup olmadığı: Map(kök → true/false). Parantez içi (örnek, açıklama)
    // atılır; virgül ve noktalı virgül yan cümleyi böler; iki nokta böler ama koşulu taşır ("access EMS if: > … may not be");
    // bağlaç (whether, that, because…) olumsuzluğun kapsamını keser ("does not differ whether the sting is pinched").
    const sonuc = new Map();
    const temiz = String(metin).toLowerCase().replace(/[’']/g, "'").replace(/\([^)]*\)/g, ' ')
      .replace(/\bno\s+(more|less|fewer|later|earlier|longer)\s+than\b/g, ' ').replace(/\bnot\s+only\b/g, ' ')
      .replace(/\b(or\s+)?not\s+at\s+all\b/g, ' ');
    for (const cumle of temiz.split(/(?<=[.!?])\s+/)) {
      let kosul = false;
      for (const yan of cumle.split(/([,;:])/)) {
        if (yan === ',' || yan === ';') { kosul = false; continue; }
        if (yan === ':') continue;   // koşul iki noktadan sonra da sürer
        const k = yan.match(/[a-z']+/g) || [];
        const olumsuzYer = [];
        k.forEach((w, i) => {
          if (/^(if|when|unless|whether)$/.test(w)) kosul = true;
          if (!kosul && OLUMSUZ_SOZ.test(w)) olumsuzYer.push(i);
        });
        const kesik = (a, b) => k.slice(Math.min(a, b) + 1, Math.max(a, b)).some((w) => /^(whether|that|which|because|so|but|while|although|whereas|since|than|unless|if|when)$/.test(w));
        k.forEach((w, i) => {
          if (w.length < 3) return;
          const kk = w.slice(0, 4);
          if (!kokler.includes(kk)) return;
          // önde en çok 5 kelime; arkada yalnız edilgen yasak: "a cold compress should not be applied" (not + be)
          const kapsamda = olumsuzYer.some((j) => !kesik(i, j) &&
            ((j < i && i - j <= 5) || (j > i && j - i <= 3 && /^(not|never)$/.test(k[j]) && k[j + 1] === 'be')));
          sonuc.set(kk, (sonuc.get(kk) || false) || kapsamda);
        });
      }
    }
    return sonuc;
  }
  // yasak: koşulun (if/when/unless) dışında bir olumsuzluk sözcüğü — liste girişi için ("If the baby is not breathing
  // normally:" koşuldur, yasak değil; "The following actions are not effective …:" yasaktır)
  function yasakVar(metin) {
    for (const yan of String(metin).toLowerCase().replace(/[’']/g, "'").replace(/\bno\s+(more|less|fewer|later|earlier|longer)\s+than\b/g, ' ')
      .split(/[,;]|(?<=[.!?])\s+/)) {
      let kosul = false;
      for (const w of yan.match(/[a-z']+/g) || []) {
        if (/^(if|when|unless|whether)$/.test(w)) kosul = true;
        else if (!kosul && OLUMSUZ_SOZ.test(w)) return true;
      }
    }
    return false;
  }
  function kaynakBirimleri(metin) {
    const birimler = [];   // [metin, liste girişi olumsuz mu]
    const [giris, ...maddeler] = String(metin || '').split(/\s*•\s+/);
    const son = giris.split(/(?<=[.!?])\s+/).pop();
    const girisOlumsuz = maddeler.length > 0 && /:\s*$/.test(giris) && yasakVar(son);
    for (const c of giris.split(/(?<=[.!?])\s+/)) if (c.trim()) birimler.push([c, false]);
    for (const md of maddeler) for (const c of md.split(/(?<=[.!?])\s+/)) if (c.trim()) birimler.push([c, girisOlumsuz]);
    return birimler;
  }
  // ---- 16.11 (§180) dayanak: kaynakta karşılığı olmayan iddia (Ercan: "Heybe jenaratör odaklanmış … koşulu da göz önünde
  //      bulundurmalı"). aktarmaDenetle yalnız İngilizce özgüne bakıyor ve kaynakta eşleşmeyen satırı atlıyordu; görülmemiş TB'de
  //      "Evet, jeneratörü elektrik kesintisinde evin içinde çalıştırabilirsiniz [6]" (6. bölüm: veri merkezi) ve "köpeklerle
  //      göz teması kurun [1]" (kaynakta yok) kullanıcıya ulaştı (§177–§178). Atıflı her satırın içerik kökleri (5 harf),
  //      atıf verdiği bölümlerin TEK bir cümlesinde aranır; en iyi cümlede bile oran eşiğin altındaysa satır dayanaksızdır.
  //      Her dilde, cevap kendi dilinde (köprüde özgün cevap kaynağın diliyle) karşılaştırılır. Bilgi eklemez: cevabı
  //      kütüphaneye karşı sınar (Ercan'ın çizgisi, §168). TM'de (görülmüş, §180) 0,4'te kullanıcıya ulaşan tehlikelinin 7/11'i,
  //      ulaşan doğrunun 1/7'si durdu; hakemin "sadık" dediği 12 cevaptan 1'i (o da tehlikeli). Karar görülmemiş setle.
  const DAYANAK_DURAK = new Set(['evet', 'hayır', 'hayir', 'kaynak', 'göre', 'şunla', 'şunu', 'şöyle', 'yapma', 'yapab', 'yapıl', 'gerek', 'bilgi',
    'sourc', 'accor', 'follo', 'there', 'these', 'those', 'shoul', 'shall', 'might', 'which', 'their', 'about', 'other', 'using', 'make']);
  function dayanakKokleri(metin, dil) {
    const D = dilBilgi(dil);
    if (!D || !D.harf || !D.kucuk) return [];
    return [...new Set((D.kucuk(String(metin || '')).match(D.harf) || []).filter((w) => w.length > 3)
      .map((w) => w.slice(0, 5)).filter((k) => !(D.durak && D.durak.has(k)) && !DAYANAK_DURAK.has(k)))];
  }
  function dayanakDenetle(cevap, parcalar, dil) {
    const { esik, enAz, hukum } = AYAR.dayanak || {};
    if (!esik || !parcalar || !parcalar.length) return [];
    const sorun = [];
    let no = 0;
    const atifAl = (t) => [...t.matchAll(/\[([\d,\s]+)\]/g)].flatMap((m) => m[1].split(',').map((x) => +x.trim()).filter(Boolean));
    const temiz = (t) => t.replace(/\[[\d,\s]+\]/g, ' ').replace(/^[\s*•\-–]+/, '').replace(/^\d+[.)]\s+/, '').trim();
    // birimin (satır ya da cümle) en iyi eşleşen kaynak cümlesindeki kök oranı; kök azsa bakılmaz (null)
    const oran = (metin, atiflar) => {
      const kokler = dayanakKokleri(metin, dil);
      if (kokler.length < (enAz || 3)) return null;
      let en = 0;
      for (const n of new Set(atiflar)) {
        const p = parcalar[n - 1];
        if (!p) continue;
        for (const [c] of kaynakBirimleri(p.metin)) {
          const ck = new Set(dayanakKokleri(c, dil));
          en = Math.max(en, kokler.filter((k) => ck.has(k)).length / kokler.length);
        }
      }
      return en;
    };
    for (const ham of String(cevap || '').split(/\r\n|\r|\n|\s\*\s/)) {
      const atiflar = atifAl(ham);
      const satir = temiz(ham);
      if (!satir || /:\s*$/.test(satir)) continue;
      no++;
      if (!atiflar.length) continue;
      // satır da, satırın her cümlesi de (Ercan'ın sıra testi, §180: "Evet, evinizde … çalıştırabilirsiniz [2]. Jeneratörler,
      // … [2]" aynı satırdaydı; kaynağa sadık ikinci cümle uydurma ilkini örttü). Atıfsız cümle satırın atıflarını alır.
      const cumleler = ham.split(/(?<=[.!?](?:\s*\[[\d,\s]+\])?)\s+(?=\p{Lu})/u);
      const birimler = [[satir, atiflar], ...(cumleler.length > 1 ? cumleler.map((c) => [temiz(c), atifAl(c).length ? atifAl(c) : atiflar]) : [])];
      const HUKUM_BAS = /^(evet|hayır|hayir|yes|no)(?!\p{L})/iu;
      const esikOf = (m) => (HUKUM_BAS.test(m) ? Math.max(esik, hukum || 0) : esik);
      if (birimler.some(([m, a]) => { const o = m ? oran(m, a) : null; return o !== null && o < esikOf(m); })) sorun.push(`dayanak: ${no}. satır kaynakta yok`);
    }
    if (Array.isArray(AYAR.dayanakOlc)) { AYAR.dayanakOlc.push(...sorun); return []; }
    return sorun;
  }

  const AKTARMA_ESIK = { benzer: 0.6, ortak: 2 };
  function aktarmaDenetle(ozgun, parcalar, kd) {
    if (kd !== 'en' || !parcalar || !parcalar.length) return [];
    const sorun = [];
    let no = 0;
    for (const ham of String(ozgun || '').split(/\r\n|\r|\n|\s\*\s/)) {
      const atiflar = [...ham.matchAll(/\[([\d,\s]+)\]/g)].flatMap((m) => m[1].split(',').map((x) => +x.trim()).filter(Boolean));
      const satir = ham.replace(/\[[\d,\s]+\]/g, ' ').replace(/^[\s*•\-–]+/, '').replace(/^\d+[.)]\s+/, '').trim();
      if (!satir || /:\s*$/.test(satir)) continue;
      no++;
      if (!atiflar.length) continue;
      const kokler = aktarmaKokleri(satir);
      if (kokler.length < 2) continue;
      // en iyi eşleşen kaynak birimi (en çok ortak kök); eşitlikte ilk
      let en = null;
      for (const n of new Set(atiflar)) {
        const p = parcalar[n - 1];
        if (!p) continue;
        for (const [c, girisNeg] of kaynakBirimleri(p.metin)) {
          const ck = new Set(aktarmaKokleri(c));
          const ortak = kokler.filter((k) => ck.has(k));
          if (ortak.length < AKTARMA_ESIK.ortak || ortak.length / kokler.length < AKTARMA_ESIK.benzer) continue;
          if (!en || ortak.length > en.ortak.length) en = { c, girisNeg, ortak };
        }
      }
      if (!en) continue;
      const ks = kapsamliOlumsuz(en.c, en.ortak);
      // olumsuzluk: ortak köklerin çoğu kapsamdaysa ("While blunt trauma does not present a risk …, penetrating head trauma
      // does" — ortak köklerin azı olumsuz yan cümlede, cümle bütünüyle olumsuz değil)
      // cevap tarafı tutucu: koşul dışında herhangi bir olumsuzluk varsa olumsuz sayılır ("Do not tell her to “stop” or
      // “calm down”" — kapsam penceresi "calm down"a yetişmiyordu, boş alarm verdi)
      const cogu = (m) => en.ortak.filter((k) => m.get(k)).length * 2 > en.ortak.length;
      const kaynakNeg = en.girisNeg || cogu(ks);
      const cevapNeg = yasakVar(satir.replace(/\([^)]*\)/g, ' '));
      // yalnız tehlikeli yön: kaynak "yapma" derken cevap "yap" diyor. Ters yön (cevap olumsuzluk ekliyor) kayıtlı
      // cevaplarda çoğu boş alarmdı ("Avoid using solvents" ↔ "Do not use gasoline"); ölçülmeden açılmaz.
      if (kaynakNeg && !cevapNeg) sorun.push(`aktarma: ${no}. satır (kaynakta olumsuz)`);
    }
    return sorun;
  }

  // ---- Ö30 (09.11, Özet §87): çeviride düşen kelime — özgün cevaptaki yön ("left side"), kısıt ("only", "unless",
  //      "except") ya da sorunun konusu ("tick") geri çeviride yoksa çeviri anlamı taşımamıştır. G10 (0.19.0a, görülmüş):
  //      "placed on their left side" → "yan tarafına yatırılmalıdır" (soru tam "hangi tarafa" idi); G19: "tick" →
  //      "tıkayıcı" → geri çeviride "remover". Geri çeviri eş anlamlı seçebilir ("up to 20 minutes" → "about 20 minutes",
  //      "shivering" → "trembling") — bu yüzden yalnız eş anlamlısı olmayan sözler ve cevapta en az 4 kez geçen konu kökü.
  //      Kayıtlı 219 köprü cevabının geri çevirisinde: yön/kısıt 7, konu 4 alarm. Ölçülen: en. ----
  const UZUV = '(side|arm|leg|hand|eye|ear|foot|lung|shoulder|knee|hip|cheek|nostril)';
  const DUSEN_KRITIK = [['left', new RegExp(`\\bleft\\s+${UZUV}`)], ['right', new RegExp(`\\bright\\s+${UZUV}`)],
    ['only', /\bonly\b/], ['unless', /\bunless\b/], ['except', /\bexcept\b/]];
  const DUSEN_KONU_EN_AZ = 4;
  function dusenKelime(ozgun, geri, soruKd, kd) {
    if (kd !== 'en' || !geri) return [];
    const sade = (m) => String(m || '').toLowerCase().replace(/\[[\d,\s]+\]/g, ' ').replace(/[’']/g, "'");
    const oz = sade(ozgun), ge = sade(geri);
    const sorun = DUSEN_KRITIK.filter(([, re]) => re.test(oz) && !re.test(ge)).map(([ad]) => `çeviride düştü: ${ad}`);
    // konu: soruda da geçen, cevapta en sık köklerden biri (en az DUSEN_KONU_EN_AZ kez) geri çeviride hiç yoksa
    const soruK = new Set(aktarmaKokleri(soruKd || ''));
    const say = {};
    for (const w of oz.match(/[a-z]{3,}/g) || []) {
      const k = w.slice(0, 4);
      if (soruK.has(k) && !AKTARMA_DURAK.has(k)) say[k] = (say[k] || 0) + 1;
    }
    const geriK = new Set(aktarmaKokleri(ge));
    for (const [k, n] of Object.entries(say)) if (n >= DUSEN_KONU_EN_AZ && !geriK.has(k)) sorun.push(`çeviride düştü: ${k}…`);
    return sorun;
  }

  // ---- 10.11 (Özet §96, Ercan: "iki yabancı karşılaştı belki kendi aralarında konuşmak isteyecek"): konuşma çevirisi
  //      süzgeci — DURDURMAZ, UYARIR (konuşmada susturmak değil, "tam tutmamış olabilir" demek yeter). Sayı (çeviride
  //      kaynakta olmayan sayı), yazı (başka alfabe), olumsuzluk (iki dil ölçülmüşse doğrudan, değilse geri çeviriyle),
  //      gidiş-dönüş (geri çeviride kaynakta olmayan sayı). Konuşan kendi cümlesinin geri çevirisini her zaman görür. ----
  // Konuşmada olumsuz emir çoğu zaman yalın: "verme", "yapma", "dokunma" (yan cümle ya da cümle sonunda). Cevap bekçileri
  // bu biçimi bilerek saymaz ("kesme", "arama" ad da olur); konuşma süzgeci yalnız uyardığı için burada sayılır.
  const trYalinEmir = (m) => String(m || '').replace(/(\p{L}{2,}m)([ae])(?=\s*([.!?,;…]|$))/gu, (x, k, v) => k + v + (v === 'a' ? 'yın' : 'yin'));
  function konusmaDenetle(kaynakMetin, kd, ceviri, hd, geri = '') {
    const uyari = [];
    if (kd === 'tr') { kaynakMetin = trYalinEmir(kaynakMetin); geri = trYalinEmir(geri); }
    if (hd === 'tr') ceviri = trYalinEmir(ceviri);
    const sayi = denetle([{ metin: kaynakMetin, dil: kd }], ceviri, hd).filter((x) => !x.startsWith('terim:'));
    if (sayi.length) uyari.push(`sayı: ${sayi.map((x) => x.replace(/ \?$/, '')).join(', ')}`);
    uyari.push(...yaziDenetle(ceviri, hd));
    let ol = olumsuzlukKarsilastir(kaynakMetin, kd, ceviri, hd);
    if (ol === null && geri && OLUMSUZ_SAY[kd]) ol = olumsuzlukKarsilastir(kaynakMetin, kd, geri, kd);
    if (ol && ol.length) uyari.push('olumsuzluk');
    if (geri) uyari.push(...gidisDonus(kaynakMetin, kd, geri));
    return [...new Set(uyari)];
  }

  function olumsuzlukKarsilastir(ozgun, kd, ceviri, dil) {
    // senkron çekirdek: iki dilin de sayacı varsa karşılaştırır; yoksa null (denetlenemedi)
    const say1 = OLUMSUZ_SAY[kd], say2 = OLUMSUZ_SAY[dil];
    if (!say1 || !say2) return null;
    let a = cevapSatirlari(ozgun), b = cevapSatirlari(ceviri);
    if (a.length !== b.length) { a = cumleBirimleri(ozgun); b = cumleBirimleri(ceviri); }
    if (a.length === b.length) {
      // olumsuzluğu her fiile koyan diller (tr, cs) İngilizceden az olumsuzluk taşımaz: "No, do not tilt" (2) →
      // "Hayır, … doğru değildir" (2); biri düşerse satırda olumsuzluk kalsa da yakalanır (06.11 dişi)
      const azalamaz = KATLI.has(dil) && !KATLI.has(kd);
      const farkli = [];
      a.forEach((x, i) => {
        const n1 = say1(x), n2 = say2(b[i]);
        if ((n1 > 0) !== (n2 > 0) || (azalamaz && n2 < n1)) farkli.push(i + 1);
      });
      return farkli.length ? [`olumsuzluk: ${farkli.join(', ')}. ${a.length === cevapSatirlari(ozgun).length ? 'satır' : 'cümle'}`] : [];
    }
    // satırlar eşleşmiyorsa: olumsuzluk taşıyan birim sayısı
    const n1 = a.filter((x) => say1(x) > 0).length, n2 = b.filter((x) => say2(x) > 0).length;
    return n1 === n2 ? [] : [`olumsuzluk: özgünde ${n1}, çeviride ${n2}`];
  }

  async function olumsuzlukDenetle(ozgun, kd, ceviri, dil, geri = null) {
    const sonuc = olumsuzlukKarsilastir(ozgun, kd, ceviri, dil);
    if (sonuc) return sonuc;
    // ölçülmemiş dil: çeviri özgünün diline geri çevrilir, olumsuzluk orada sayılır (bir çeviri daha, ~2–4 sn)
    if (!OLUMSUZ_SAY[kd] || !AYAR.cevirmen) return [];
    try {
      if (geri === null) geri = await cevir(ceviri, dil, kd);
      return (olumsuzlukKarsilastir(ozgun, kd, geri, kd) || []).map((x) => x + ' (geri çeviriyle)');
    } catch (e) { return []; }
  }

  // ---- Ö20: gidiş-dönüş çevirisi + Ö15: yön denetimi (07.11 — Özet §39, §40) ----
  // Çeviri özgün cevabın diline geri çevrilir ve özgünle AYNI dilde karşılaştırılır: (1) sayı — geri çeviride
  // özgünde olmayan sayı ("2 minutes" → Bulgarca "три минути" → geri "three minutes"); (2) yön ve karşıt kelime
  // (06.11 O6: "should not be tilted back" → "başın öne eğilmesi doğru değildir"; olumsuzluk sayısı aynı kaldı).
  // İnsan gerekmez; çevirmenin bildiği her dilde çalışır. Karşılaştırma özgünün dilinde: en, tr, cs.
  const YON = {
    en: [[/\bback(wards?)?\b/, /\bforwards?\b/], [/\bupwards?\b|\bup\b/, /\bdownwards?\b|\bdown\b/], [/\babove\b/, /\bbelow\b/],
      [/\b(hot|warm\w*|heat\w*)\b/, /\b(cold|cool\w*|chill\w*)\b/], [/\bbefore\b/, /\bafter\b/],
      [/\bincreas\w*/, /\b(decreas|reduc)\w*/], [/\bhigher\b/, /\blower\b/], [/\bmore\b/, /\b(less|fewer)\b/],
      [/\binside\b/, /\boutside\b/],
      [/\bat least\b|\bminimum\b|\bor more\b|\bnot less than\b/, /\bat most\b|\bmaximum\b|\bno more than\b|\bnot (to )?exceed\w*|\bup to\b/],
      [/\btighten\w*/, /\bloosen\w*/]],
    tr: [[/(?<!\p{L})(geri|geriye|arkaya)(?!\p{L})/u, /(?<!\p{L})(öne|ileri|ileriye)(?!\p{L})/u],
      [/(?<!\p{L})yukarı\p{L}*/u, /(?<!\p{L})aşağı\p{L}*/u], [/(?<!\p{L})(sıcak|ılık|ısıt)\p{L}*/u, /(?<!\p{L})(soğuk|serin|soğut)\p{L}*/u],
      [/(?<!\p{L})önce(?!\p{L})/u, /(?<!\p{L})sonra(?!\p{L})/u],
      [/(?<!\p{L})art(ır|tır)\p{L}*/u, /(?<!\p{L})azal(t)?\p{L}*/u], [/(?<!\p{L})en az(?!\p{L})/u, /(?<!\p{L})en (fazla|çok)(?!\p{L})/u],
      [/(?<!\p{L})daha (fazla|çok|yüksek)(?!\p{L})/u, /(?<!\p{L})daha (az|düşük)(?!\p{L})/u]],
    cs: [[/(?<!\p{L})(dozadu|vzad)(?!\p{L})/u, /(?<!\p{L})(dopředu|vpřed)(?!\p{L})/u], [/(?<!\p{L})nahoru(?!\p{L})/u, /(?<!\p{L})dolů(?!\p{L})/u],
      [/(?<!\p{L})(hork|tepl)\p{L}*/u, /(?<!\p{L})(studen|chladn)\p{L}*/u], [/(?<!\p{L})před(?!\p{L})/u, /(?<!\p{L})po(?!\p{L})/u],
      [/(?<!\p{L})(nejméně|alespoň|minimálně)(?!\p{L})/u, /(?<!\p{L})(nejvýše|maximálně|nanejvýš)(?!\p{L})/u]],
  };
  function yonKarsilastir(ozgun, geri, dil) {
    // birim birim: bir yönün yalnız özgünde, karşıtının yalnız geri çeviride olması (takas) durdurur
    const ciftler = YON[dil];
    if (!ciftler) return [];
    const kucult = (m) => (dil === 'tr' ? kucuk(m) : m.toLowerCase());
    let a = cevapSatirlari(ozgun), b = cevapSatirlari(geri);
    if (a.length !== b.length) { a = cumleBirimleri(ozgun); b = cumleBirimleri(geri); }
    if (a.length !== b.length) { a = [a.join(' ')]; b = [b.join(' ')]; }
    const sorun = [];
    a.forEach((x, i) => {
      const o = kucult(x), g = kucult(b[i]);
      for (const [A, B] of ciftler) {
        // takas: bir yan geri çeviride hiç kalmamış, öbür yan artmış ("warm … cold" → "cold … cold")
        const say = (re, m) => (m.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || []).length;
        const oA = say(A, o), oB = say(B, o), gA = say(A, g), gB = say(B, g);
        const takas = (oA > 0 && gA === 0 && gB > oB) || (oB > 0 && gB === 0 && gA > oA);
        if (takas) { sorun.push(`yön: ${i + 1}. ${a.length > 1 ? 'birim' : 'metin'}`); break; }
      }
    });
    return sorun;
  }
  // tarih ifadeleri karşılaştırılmaz: "2025 yılı sonu" geri çeviride "31 Aralık 2025" oluyor (07.11 ölçümü)
  const AYLAR = /(?<!\p{L})(\d{1,2}\.?\s+)?(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık|january|february|march|april|may|june|july|august|september|october|november|december|ledna|února|března|dubna|května|června|července|srpna|září|října|listopadu|prosince)(\s+\d{1,2}(?!\d))?/giu;
  function gidisDonus(ozgun, kd, geri) {
    if (!geri || !geri.trim()) return [];
    // "1" sayılmaz: geri çeviride "a day", "a drop" birer "1" oluyor (07.11 ölçümü, 75 çiftin 2'si)
    const sayi = denetle([{ metin: ozgun.replace(AYLAR, ' '), dil: kd }], geri.replace(AYLAR, ' '), kd)
      .filter((x) => !/^1 /.test(x)).map((x) => `gidiş-dönüş: ${x}`);
    return [...sayi, ...yonKarsilastir(ozgun, geri, kd)];
  }

  // ---- Ö13: bağlam denetimi (06.11 gece — LM'in uyarısı, Özet §35, §38) ----
  // Sayı kaynakta geçiyor ama başka kişiye ya da yere ait olabilir: yetişkin dozu bebeğe, ülke sayısı şehre
  // (§37: "ülke genelinde 4000 Türk" → cevapta "Prag'da"). Cevaptaki her sayı için kaynakta o sayının geçtiği
  // cümleler bulunur; (1) kişi: cümle başka bir kişiyi söylüyorsa ("In adults, 5 cm") ya da soru özel bir grup için
  // (bebek, çocuk, gebe, yaşlı) sorulmuşken sayının paragrafında ve başlığında o grup hiç geçmiyorsa ("normal nabız
  // 60–100" → yenidoğan sorusu, 06.11 ölçümü); (2) yer: sorudaki özel adlar o cümlede ve makale adında yoksa durur.
  // Bir önceki cümleye bakmak denendi, bırakıldı: "1 g in adults" cümlesinden sonraki kilo bantlı çocuk dozu durdu.
  // (3) konu: sorudaki bir kelime kaynaklardan birinin makale adıysa ("ibuprofen" → "İbuprofen"), sayı o konunun
  // cümlesinden ya da makalesinden gelmeli (06.11 ölçümü: çocuk ibuprofen dozu diye Flurbiprofen'in 150–200 mg'ı).
  // Yalnız doz birimlerinde (mg, g, ml…): her sayıya uygulanınca "Pusula olmadan yön" sorusunda "pusula"yı konu
  // sandı, eski 40 sorudan 4'ünde boş alarm verdi.
  const KISI = {
    en: { bebek: /(?<!\p{L})(infant|infants|baby|babies|newborn|newborns|neonat\p{L}*)(?!\p{L})/u,
      cocuk: /(?<!\p{L})(child|children|kid|kids|paediatric|pediatric|adolescent\p{L}*|teenager\p{L}*)(?!\p{L})/u,
      yetiskin: /(?<!\p{L})(adult|adults)(?!\p{L})/u, gebe: /(?<!\p{L})pregnan\p{L}*/u, yasli: /(?<!\p{L})(elderly|older adults|older people)(?!\p{L})/u },
    // 07.11 (§45): ünsüz yumuşaması — "bebeğe", "bebeğin", "çocuğa" eskiden tanınmıyordu (Y02 bekçiye hiç takılmadı)
    tr: { bebek: /(?<!\p{L})(bebe[kğ]\p{L}*|yenidoğan\p{L}*|süt çocu\p{L}*)/u, cocuk: /(?<!\p{L})(çocu[kğ]\p{L}*|ergen\p{L}*)/u,
      yetiskin: /(?<!\p{L})(yetişkin\p{L}*|erişkin\p{L}*)/u, gebe: /(?<!\p{L})(gebe\p{L}*|hamile\p{L}*)/u, yasli: /(?<!\p{L})yaşlı\p{L}*/u },
    cs: { bebek: /(?<!\p{L})(kojen\p{L}*|novoroz\p{L}*|miminek|miminka|miminko\p{L}*)/u, cocuk: /(?<!\p{L})(dět\p{L}*|dítě\p{L}*|dítět\p{L}*)/u,
      yetiskin: /(?<!\p{L})dospěl\p{L}*/u, gebe: /(?<!\p{L})těhotn\p{L}*/u, yasli: /(?<!\p{L})senior\p{L}*/u },
  };
  function kisiler(metin, dil) {
    const K = KISI[dil];
    if (!K) return null;
    const m = dil === 'tr' ? kucuk(metin) : metin.toLowerCase();
    return new Set(Object.keys(K).filter((k) => K[k].test(m)));
  }

  // ---- kişiye göre kaynak (12.11.2026, Planlama 8j-1 · Özet §109) ----
  // F07 "Annem mutfakta yığıldı…": modele giden altı paragrafın altısı "(baby and child)" CPR'ından geldi, yetişkin
  // makalesi aday bile değildi (Özet §85: "yetişkine çocuk CPR'ı"). Sorunun kişisi AÇIKÇA tek ise (bebek · çocuk ·
  // yetişkin), başlığında BAŞKA kişi adı geçen makale sıranın sonuna itilir ve kişi parantezdeyse aynı makalenin kişiye
  // uyan kardeşi havuza eklenir. Kişi belirsizse ya da karışıksa ("annem 6 yaşındaki kardeşimi…") hiçbir şey değişmez.
  // Yaş ("8 aylık", "6 yaşında", "6-year-old") ve kelimeler birlikte sayılır; iki kişi çıkarsa kural uygulanmaz. Yaşa öncelik
  // denendi, bırakıldı: "6 yaşındaki oğlumla evdeyken eşim yığıldı" çocuk sayılırdı — yanlış yöne itmek bugünkünden kötü.
  // 12–15 yaş belirsiz sayılır (IFRC: çocuk = ergenliğe kadar). "8 aylık hamile" bebek değildir.
  const yasKisisi = (n) => (n == null || Number.isNaN(n) ? null : n < 1 ? 'bebek' : n <= 11 ? 'cocuk' : n >= 16 ? 'yetiskin' : null);
  const SAYI_KELIME = { tr: { bir: 1, iki: 2, 'üç': 3, 'dört': 4, 'beş': 5, 'altı': 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10 },
    en: { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11 } };
  const SORU_KISI = {
    tr: { ay: /(?<!\p{L})(\d+|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)\s*(?:aylık|haftalık)(?!\s*(?:hamile|gebe))(?!\p{L})/gu,
      yas: /(?<!\p{L})(\d+|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)(?:[.,]5| buçuk)?\s*yaş(?:ında|ındaki|larında|larındaki)(?!\p{L})/gu,
      bebek: /(?<!\p{L})(bebe[kğ]|yenidoğan)/u, cocuk: /(?<!\p{L})çocu[kğ]/u,
      // "hala" yok ("hâlâ" böyle yazılıyor); "anne"/"baba" yalnız "annem/annesi/anneanne" biçiminde ("bebeğin annesi bayıldı" karışık sayılsın)
      yetiskin: /(?<!\p{L})(yetişkin|erişkin|yaşlı|anne(?:m|si|sin|anne)|baba(?:m|sı|anne)|dede|nine|nene|eşim|kocam|karım|kayınvalide|kayınpeder|amca|dayı|teyze|halam|abi[mn]|abla|kadın|adam|hamile|gebe)/u },
    en: { ay: /(?<![a-z])(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven)[- ](?:month|week)s?[- ]old(?![a-z])/g,
      yas: /(?<![a-z])(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven)[- ]years?[- ]old(?![a-z])/g,
      bebek: /(?<![a-z])(baby|babies|infant|infants|newborn|newborns)(?![a-z])/, cocuk: /(?<![a-z])(child|children|kid|kids|toddler)(?![a-z])/,
      yetiskin: /(?<![a-z])(adult|adults|elderly|old (?:man|woman|lady)|grand(?:father|mother|pa|ma)|my (?:mother|mom|father|dad|husband|wife|uncle|aunt)|pregnant|woman|man)(?![a-z])/ },
  };
  // metinler: [[metin, dil], …] — İLKİ kullanıcının kendi sorusu, sonrakiler köprüdeki çevirileri. Dönen küme boşsa ya da
  // birden çoksa kişi yok. Kullanıcının dilinin sözlüğü varsa (tr, en) YALNIZ kendi sözleri okunur: görülmemiş I setinde
  // (I01) "15 yaşındaki yeğenim… küçüklerde olduğu gibi" çeviride "as with children" oldu, kural soruyu çocuk sorusu sanıp
  // yetişkin CPR'ını sona itti. Sözlüğü olmayan dilde çeviri okunur. 12–15 yaş geçerse kural hiç uygulanmaz (belirsiz).
  function soruKisisi(metinler) {
    const s = new Set();
    if (metinler.length && SORU_KISI[metinler[0][1]]) metinler = [metinler[0]];
    for (const [metin, dil] of metinler) {
      const K = SORU_KISI[dil];
      if (!K || !metin) continue;
      const m = dil === 'tr' ? kucuk(metin) : metin.toLowerCase();
      const sayi = (x) => (/^\d+$/.test(x) ? +x : SAYI_KELIME[dil][x]);
      for (const x of m.matchAll(K.ay)) if (sayi(x[1]) != null) s.add('bebek');
      for (const x of m.matchAll(K.yas)) {
        const k = yasKisisi(sayi(x[1]));
        if (!k && sayi(x[1]) != null) return new Set();   // 12–15: ergen mi çocuk mu kitaba göre bile belirsiz
        if (k) s.add(k);
      }
      for (const k of ['bebek', 'cocuk', 'yetiskin']) if (K[k].test(m)) s.add(k);
    }
    return s;
  }
  // makale başlığındaki kişi: "(baby and child)" → bebek+çocuk · "(adolescent and adult)" → ergen+yetişkin. Türkçede yalnız
  // "-lerde/-ta" biçimi ("Çocuk felci" bir hastalığın adı, kişi değil).
  function baslikKisisi(baslik) {
    // İngilizce düz küçük harfle ("Infant" → "infant"; kucuk() "ınfant" yapar), Türkçe kucuk() ile
    const e = String(baslik || '').toLowerCase(), b = kucuk(baslik || ''), s = new Set();
    if (/(?<![a-z])(baby|babies|infant|infants|newborn|newborns|neonat[a-z]*)(?![a-z])/.test(e) || /(?<!\p{L})(bebeklerde|bebekte|yenidoğanlarda|yenidoğanda)(?!\p{L})/u.test(b)) s.add('bebek');
    if (/(?<![a-z])(child|children|paediatric|pediatric)(?![a-z])/.test(e) || /(?<!\p{L})(çocuklarda|çocukta)(?!\p{L})/u.test(b)) s.add('cocuk');
    if (/(?<![a-z])(adolescent|adolescents|teenagers?)(?![a-z])/.test(e) || /(?<!\p{L})(ergenlerde|ergende)(?!\p{L})/u.test(b)) s.add('ergen');
    if (/(?<![a-z])(adult|adults|elderly)(?![a-z])/.test(e) || /(?<!\p{L})(yetişkinlerde|yetişkinde|erişkinlerde|erişkinde)(?!\p{L})/u.test(b)) s.add('yetiskin');
    return s;
  }
  const KISI_UYUM = { bebek: ['bebek'], cocuk: ['cocuk'], yetiskin: ['yetiskin', 'ergen'] };
  const tekKisi = (k) => (k && k.size === 1 ? [...k][0] : null);
  // başlık başka kişiyi adlandırıyor mu (kişisiz başlık hiçbir zaman uymaz sayılmaz)
  function kisiUymaz(k, baslik) {
    const t = tekKisi(k);
    if (!t) return false;
    const b = baslikKisisi(baslik);
    return b.size > 0 && !KISI_UYUM[t].some((x) => b.has(x));
  }
  const kisiUyar = (k, baslik) => { const t = tekKisi(k); return !!t && KISI_UYUM[t].some((x) => baslikKisisi(baslik).has(x)); };
  // kişisi uymayan makalenin kardeşleri: kişi parantezdeyse kök adla öneri aranır, kişiye uyan kardeş eklenir (en çok 2 makale).
  // bakilan: sıralamanın başı (KARDES_BAKIS paragraf) — yanlış kişinin makalesi gerçekten öne çıkmadıysa kardeş aranmaz
  // (görülmüş F24: havuzun dibindeki çocuk CPR'ı yüzünden yetişkin CPR'ı eklenip donma paragrafının yerini almıştı).
  // ham: bütün havuz (zaten olan makale yeniden eklenmesin)
  async function kardesMakaleler(bakilan, k, ham = bakilan) {
    if (!tekKisi(k)) return [];
    const varolan = new Set(ham.map((p) => p.kitap + '\u0000' + p.yol));
    const uymayan = [...new Map(bakilan.filter((p) => p.kaynak === 'kiwix' && kisiUymaz(k, p.ad)).map((p) => [p.kitap + '\u0000' + p.ad, p])).values()];
    const ek = [];
    let eklenen = 0;
    for (const p of uymayan) {
      const parantez = /\s*\(([^)]*)\)\s*$/.exec(p.ad);
      if (!parantez || !baslikKisisi(parantez[1]).size) continue;   // kişi parantezde değil: yalnız sona itilir
      const kok = p.ad.slice(0, parantez.index).trim();
      if (!kok) continue;
      for (const o of await oneri(kok, 8, p.kitap)) {
        const anahtar = o.kitap + '\u0000' + o.yol;
        if (varolan.has(anahtar) || !kisiUyar(k, o.yol.replace(/_/g, ' '))) continue;
        varolan.add(anahtar);
        let m;
        try { m = await makale(o.yol, o.kitap); } catch (e) { continue; }
        if (!kisiUyar(k, m.ad)) continue;
        for (const [bolum, metin] of m.paragraflar) ek.push({ ad: m.ad, bolum, metin, yol: o.yol, kitap: o.kitap, kaynak: 'kiwix', ...(p.dil ? { dil: p.dil } : {}) });
        if (++eklenen === 2) return ek;
      }
    }
    return ek;
  }
  // ---- paragraf düzeyinde kişi (14.11.2026, Özet §129 — Planlama 8j-1 "bölüm içindeki kişi ayrımı", I14) ----
  // Kişi kuralı makale BAŞLIĞINA bakıyor; IFRC'nin çoğu makalesi çocuğu ve yetişkini aynı makalede, ayrı paragraflarda
  // anlatıyor. I14 (4 yaşında "çok sessiz" = bilinç değişikliği) yetişkin için yazılmış "hafif çarpmada dinlensin,
  // izlensin" paragrafını aldı; çocuk paragrafı gelmedi. Sorunun kişisi açıkça tek ise paragraf METNİNDE o kişi geçiyorsa
  // puanına AYAR.kisiParagraf eklenir, yalnız başka kişi geçiyorsa çıkarılır; kişisiz paragraf değişmez. 0 = kapalı.
  // Yalnız bebek ve çocuk sorusunda (ölçü, 7 set 572 alıntı): kitap çocuk paragrafına "çocuk" der, yetişkinine "yetişkin"
  // demez — yetişkin sorusunda çocuk paragrafını itmek doğru paragrafı da oynattı (F05, F07, M13 …: −10), çocukta +5.
  function kisiParagraf(puanli, k, dil) {
    const t = tekKisi(k), d = AYAR.kisiParagraf || 0;
    if (!d || !['bebek', 'cocuk'].includes(t)) return puanli;
    const ESLES = { bebek: ['bebek'], cocuk: ['cocuk'], yetiskin: ['yetiskin', 'yasli'] };
    return puanli.map(([puan, p]) => {
      const ks = kisiler(p.metin || '', p.dil || dil);
      if (!ks || !ks.size) return [puan, p];
      const uyar = ESLES[t].some((x) => ks.has(x)), baska = [...ks].some((x) => ['bebek', 'cocuk', 'yetiskin', 'yasli'].includes(x) && !ESLES[t].includes(x));
      return [uyar ? puan + d : baska ? puan - d : puan, p];
    }).sort((a, b) => b[0] - a[0]);
  }
  // sıralanmış listede kişisi uymayanlar sona (sıraları korunur): başka kaynak kalmazsa yine gelirler
  function kisiSirala(puanli, k) {
    if (!tekKisi(k)) return puanli;
    const uymaz = (x) => kisiUymaz(k, x[1].ad);
    return [...puanli.filter((x) => !uymaz(x)), ...puanli.filter(uymaz)];
  }

  // ---- yol sorusu (12.11.2026, Planlama 8i-5: "hastaneye nasıl giderim") ----
  // Sohbet yol tarif etmez: rotayı haritanın algoritması hesaplar, model uydurmaz. Bu süzgeç yalnız haritayı ÖNERİR
  // (cevabın yerine geçmez: "hastaneye nasıl götürürüm" bir ilk yardım sorusu olabilir). Yer türü ya da özel adlı hedef
  // yoksa null. tür: haritanın /api/yer?tur= kodları.
  const YOL_TUR = {
    tr: [[/hastane|acil servis|(?<!\p{L})acile?(?!\p{L})/u, 'hastane'], [/eczane/u, 'eczane'], [/toplanma (alan|yer|nokta)/u, 'toplanma'],
      [/içme suyu|(?<!\p{L})çeşme|(?<!\p{L})su (dağıtım|noktası)/u, 'su'], [/barınak|çadır ?kent|sığınak/u, 'barinak'],
      [/sağlık ocağı|aile sağlığı/u, 'saglik'], [/karakol|(?<!\p{L})polis/u, 'polis'], [/itfaiye/u, 'itfaiye']],
    en: [[/hospital|emergency room/, 'hastane'], [/pharmacy|chemist/, 'eczane'], [/assembly (point|area)|meeting point/, 'toplanma'],
      [/drinking water|water point|water tap/, 'su'], [/shelter|tent camp/, 'barinak'], [/clinic|health cent(er|re)/, 'saglik'],
      [/police/, 'polis'], [/fire station/, 'itfaiye']],
  };
  const YOL_KALIP = {
    // "en yakın …" · "…ye nasıl giderim / gidilir" · "… nerede" · "yol tarifi" · "ne kadar uzak"
    tr: /(en yakın|nasıl gid(?:er|il)|yol tarif|(?<!\p{L})nerede(?:dir)?(?!\p{L})|(?<!\p{L})neresi(?!\p{L})|ne kadar uzak)/u,
    en: /(nearest|closest|how (?:do|can|should) (?:i|we) get to|how to get to|where is|directions to|route to|how far)/,
  };
  function yolSorusu(soru, dil) {
    const K = YOL_KALIP[dil], T = YOL_TUR[dil];
    if (!K || !soru) return null;
    const m = dil === 'tr' ? kucuk(soru) : soru.toLowerCase();
    if (!K.test(m)) return null;
    const tur = (T.find(([re]) => re.test(m)) || [])[1] || null;
    if (tur) return { tur };
    // özel adlı hedef: "Samandağ'a nasıl giderim" · "how do I get to Antakya"
    const hedef = dil === 'tr' ? /(\p{Lu}[\p{L}.-]*(?:\s+\p{Lu}[\p{L}.-]*)*)['’](?:y?[ae]|n?[ae])\s+nasıl gid/u.exec(soru)
      : /(?:get to|directions to|route to|way to)\s+((?:the\s+)?\p{Lu}[\p{L}.-]*(?:\s+\p{Lu}[\p{L}.-]*)*)/u.exec(soru);
    return hedef ? { nereye: hedef[1].replace(/^the\s+/, '') } : null;
  }

  const katla = (w) => w.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i');
  function ozelAdlar(soru) {
    // büyük harfle başlayan kelimeler; ilk kelime yalnız kesme işaretiyle ek almışsa ("Prag'da"). Çince vb. yok.
    // 20.11 (§235): yalnız İLK kelime atlanıyordu; ikinci cümlenin baş harfi ("What now?", "Şimdi?", "Hastaneye…") de ad
    // sayılıyor, bağlam bekçisi sayıyı "başka yer için" diye durduruyordu (kayıtlı 15.695 cevapta 619 bulgu; 286'sı yalnız bundan).
    // AYAR.cumleBasiAtla: true → her cümlenin ilk kelimesi (kesme işaretiyle ek almadıysa) ad sayılmaz. 21.11 (§236): ölçüldü, açık.
    const kelimeler = soru.split(/\s+/).filter(Boolean);
    const adlar = [];
    kelimeler.forEach((k, i) => {
      const yalin = k.replace(/^[^\p{L}]+/u, '');
      const kesme = /^\p{Lu}\p{L}+['’]/u.test(yalin);
      const kok = yalin.split(/['’]/)[0].replace(/[^\p{L}]+$/u, '');
      if (!/^\p{Lu}/u.test(kok) || kok.length < 3 || kok === kok.toUpperCase()) return;
      const cumleBasi = i === 0 || (AYAR.cumleBasiAtla && /[.!?…:]["'’)\]]*$/u.test(kelimeler[i - 1]));
      if (cumleBasi && !kesme) return;
      adlar.push(katla(kok).slice(0, 3));
    });
    return [...new Set(adlar)];
  }
  function kaynakCumleleri(parcalar) {
    const c = [];
    for (const p of parcalar) {
      const ccc = p.metin.split(/(?<=[.!?。！？])\s+/);
      ccc.forEach((x) => c.push({ metin: x, paragraf: p.metin, baslik: `${p.makale || ''} ${p.bolum || ''}`, dil: p.dil }));
    }
    return c;
  }

  const DOZ_BIRIM = new Set(['mg', 'g', 'mcg', 'µg', 'ml', 'iu', 'mg/kg', 'g/kg', 'ml/kg']);
  function konuKelimeleri(soru, dil, parcalar) {
    // sorunun içerik kelimelerinden (4 harflik kök) kaynak makale adlarından birinin başında geçenler
    if (!soru) return [];
    const D = dilBilgi(dil);
    const adlar = new Set(parcalar.filter((p) => (p.dil || dil) === dil)
      .flatMap((p) => (p.makale || '').match(/\p{L}+/gu) || []).map((w) => katla(w).slice(0, 4)));
    return [...new Set(icerikKelimeleri(soru, D).map((w) => katla(w).slice(0, 4)))].filter((k) => k.length === 4 && adlar.has(k));
  }

  function baglamDenetle(soru, cevap, dil, parcalar, sorular = {}) {
    // soru: cevabın dilinde soru (köprüde çevrilmiş soru) · sorular: { kaynak dili: o dile çevrilmiş soru } (yer için)
    const olcC = olcuAl(dil);
    const cumleler = kaynakCumleleri(parcalar);
    const cumleOlcu = cumleler.map((c) => olcuAl(c.dil || dil)(c.metin));
    const soruKisi = kisiler(soru, dil) || new Set();
    const sorun = new Set();
    for (const satir of cevapSatirlari(cevap.replace(/^\s*\d+[.)]\s/gm, ''))) {
      const olculer = [...olcC(satir).values()];
      if (!olculer.length) continue;
      const satirKisi = kisiler(satir, dil) || new Set();
      const hedef = satirKisi.size ? satirKisi : soruKisi;
      for (const [sayi, birim] of olculer) {
        const adaylar = cumleler.map((c, i) => [c, cumleOlcu[i]]).filter(([, o]) =>
          birim === '?' ? [...o.values()].some(([s]) => s === sayi) : o.has(sayi + '|' + birim)).map(([c]) => c);
        if (!adaylar.length) continue;   // kaynakta hiç yoksa sayı denetçisinin işi
        // (1) kişi
        if (hedef.size) {
          const ozel = [...hedef].some((k) => k !== 'yetiskin');
          const uyan = adaylar.some((c) => {
            const d = c.dil || dil;
            const kendi = kisiler(c.metin, d);
            if (!kendi) return true;   // bu dilin kişi sözlüğü yok: denetlenemez
            if (kendi.size) return [...kendi].some((k) => hedef.has(k));
            if (!ozel) return true;    // kişisiz cümle yetişkin sorusu için nötrdür
            const cevre = kisiler(`${c.baslik} ${c.paragraf}`, d);
            return [...cevre].some((k) => hedef.has(k));
          });
          if (!uyan) sorun.add(`bağlam: ${sayi}${birim === '?' ? '' : ' ' + birim} başka kişi için`);
        }
        // (2) yer: sorudaki özel adların her biri, sayının geçtiği cümlelerden birinde (ya da makale adında) bulunmalı
        const yerUyan = adaylar.some((c) => {
          const d = c.dil || dil;
          const adlar = ozelAdlar(sorular[d] || (d === dil ? soru : ''));
          if (!adlar.length) return true;
          const kelimeler = new Set((`${c.metin} ${c.baslik}`.match(/\p{L}+/gu) || []).map((w) => katla(w).slice(0, 3)));
          return adlar.every((a) => kelimeler.has(a));
        });
        if (!yerUyan) sorun.add(`bağlam: ${sayi}${birim === '?' ? '' : ' ' + birim} başka yer için`);
        // (3) konu — yalnız doz
        const konuUyan = !DOZ_BIRIM.has(birim) || adaylar.some((c) => {
          const d = c.dil || dil;
          const konu = konuKelimeleri(sorular[d] || (d === dil ? soru : ''), d, parcalar);
          if (!konu.length) return true;
          const metin = katla(`${c.metin} ${c.baslik}`);
          return konu.some((k) => metin.includes(k));
        });
        if (!konuUyan) sorun.add(`bağlam: ${sayi}${birim === '?' ? '' : ' ' + birim} başka konu için`);
      }
    }
    return [...sorun];
  }

  function yokAyikla(metin, yok) {
    // model "bilgim yok" cümlesini bazen bir listenin içine gömer ("Kaynaklara göre: * My sources do not contain this
    // information.") ya da gerçek bir maddenin yanına ekler (06.11 gece ölçümü, 24 sorunun 4'ü). Yalnız o cümle
    // kaldıysa bilgi yoktur; yanında başka madde varsa o satır atılır.
    // 07.11 (§44, Y21): "[1], [2], [4] Kaynaklarımda bu bilgi yok." — numaralar silinince başta ", ," kalıyordu
    const yalin = (x) => x.replace(/\[[\d,\s]+\]/g, '').replace(/^[\s*•\-–,;.]+/, '').replace(/^\d+[.)]\s+/, '').trim();
    const satirlar = metin.split(/\r\n|\r|\n/);
    const icerik = satirlar.filter((x) => yalin(x) && !/:\s*$/.test(yalin(x)));
    const yokSatir = (x) => yalin(x) === yok;
    if (icerik.length && icerik.every(yokSatir)) return { yok: true, metin: yok };
    return { yok: false, metin: satirlar.filter((x) => !yokSatir(x)).join('\n').trim() };
  }

  // ---- bütün akış ----

  function basliklariAyikla(ham) {
    return ham.split(/\r\n|\r|\n/).filter((b) => b.trim())
      .map((b) => b.replace(/^[ \-*•0-9."']+|[ \-*•0-9."']+$/g, '')).slice(0, 3);
  }

  function kaynakMetni(parcalar, dil = 'tr') {
    const D = dilAl(dil);
    return parcalar.map((p, i) => `[${i + 1}] (${p.kaynak === 'benim' ? D.dosya : D.makale}: ${p.makale}${p.bolum ? ' — ' + p.bolum : ''}) ${p.metin}`).join('\n\n');
  }

  function ceviriAyikla(ham) {
    // modelin çevirisinden ilk dolu satır; tırnak ve "Çeviri:" gibi önekler atılır
    const satir = ham.split(/\r\n|\r|\n/).map((s) => s.trim()).find(Boolean) || '';
    return satir.replace(/^(çeviri|translation|překlad)\s*:\s*/i, '').replace(/^["'“”„«»]+|["'“”„«»]+$/g, '').trim();
  }

  // §172 dil körü arama: tek havuzun en iyi (ilk) bölümünün dili. Kendi dilindeki bölümler dil alanı taşımaz (adayParcalar).
  function enIyiDil(parcalar, dil) {
    const p = (parcalar || [])[0];
    return p ? (p.dil || dil) : dil;
  }

  // §207 çok dilli havuz: başka dildeki bölüm çevirmenle kullanıcının diline çevrilir (sayfanın kaynak çevirisiyle aynı uzunluk,
  // 700); sayı (denetle), olumsuzluk (Ö12) ya da kip (seçimlik → zorunlu) kayarsa ya da çeviri boşsa bölüm düşer. Yön denetimi
  // (Ö15) gidiş-dönüş ister, burada yok. Kendi dilindeki bölüm aynen kalır; sıra korunur.
  async function havuzCevir(parcalar, dil, ceviren = cevir) {
    const tutulan = [], dusen = [];
    for (const p of parcalar) {
      if (!p.dil || p.dil === dil) { tutulan.push(p); continue; }
      let c = '';
      try { c = String(await ceviren(p.metin, p.dil, dil, 700) || '').trim(); } catch (e) { c = ''; }
      const sorun = !c ? ['çeviri boş'] : [...denetle([{ metin: p.metin, dil: p.dil }], c, dil).filter((x) => !x.startsWith('terim:')),
        ...await olumsuzlukDenetle(p.metin, p.dil, c, dil), ...kipDenetle(p.metin, p.dil, c, dil)];
      if (sorun.length) { dusen.push({ kitap: p.kitap, makale: p.makale, dil: p.dil, sorun }); continue; }
      const { dil: kaynakDil, ...geri } = p;
      tutulan.push({ ...geri, metin: c, ceviri: { dil: kaynakDil, ozgun: p.metin } });
    }
    return { parcalar: tutulan, dusen };
  }

  async function koprulu(soru, D, dil, diller, bildir, konu = '') {
    // her kaynak dili için: soru o dile çevrilir, başlıklar o dilde önerilir (dil köprüsü, K17).
    // 15.11 (§150): kullanıcı konu seçtiyse çevirmene önek olur (konuluCevir); çevirmen yoksa (sohbet modeliyle çeviri) konu kullanılmaz
    const gruplar = [];
    for (const kd of diller) {
      if (kd === dil) {
        gruplar.push({ dil, soru, basliklar: basliklariAyikla(await sohbet(D.baslik, soru, 60)) });
      } else {
        const c = AYAR.cevirmen && DIL_ADI[kd] && DIL_ADI[dil] ? await konuluCevir(soru, konu, dil, kd, 80)
          : { metin: ceviriAyikla(await sohbet(CEVIR[kd] || CEVIR.en, soru, 80)), konu: '' };
        const ceviri = c.metin || soru;
        gruplar.push({ dil: kd, soru: ceviri, ...(c.konu ? { konu: c.konu } : {}), ...(c.konuDustu ? { konuDustu: c.konuDustu } : {}),
          basliklar: basliklariAyikla(await sohbet(dilBilgi(kd).baslik, ceviri, 60)) });
      }
    }
    bildir('kaynak', gruplar.flatMap((g) => g.basliklar));
    return gruplar;
  }

  async function bellektekiDiller(kati = false) {
    // kitaplıktaki aranabilir kitapların ve kullanıcının dosyalarının dilleri (K13 + K17), ISO 639-1
    const diller = new Set();
    for (const k of await kitaplik(kati)) if (k.aranir) for (const u of k.dil.split(',')) if (KISA[u]) diller.add(KISA[u]);
    if (AYAR.benim) {
      try {
        const y = await getir(`${AYAR.benim}/dizin.json`, { cache: 'no-store' });
        if (y.ok) for (const f of (await y.json()).dosyalar || []) if (f.dil) diller.add(f.dil);
      } catch (e) { /* dizin yoksa yalnız kitaplar */ }
    }
    return diller;
  }

  async function mevcutDiller(dil) {
    // köprünün bakacağı diller: bellekteki diller, kullanıcının kendi dili hariç.
    // Çevirmen yoksa yalnız kuralları ölçülmüş diller (tr, en, cs) — soru o zaman sohbet modeliyle çevrilir.
    const diller = await bellektekiDiller();
    diller.delete(dil);
    return [...diller].filter((d) => (AYAR.cevirmen ? DIL_ADI[d] : DIL[d]));
  }

  // §135 şıklar: ne zaman sorulur — en az iki aday bölüm, ilk ikisinin farkı eşikten küçük; kullanıcı zaten seçtiyse,
  // "kendi durumunu yaz" ile yeniden sorduysa (sorulmaz) ya da ayar kapalıysa sorulmaz
  function secenekGerekli(adaylar, secenek = {}) {
    const S = AYAR.secenek || {};
    if (!S.esik || secenek.secilen || secenek.sorulmaz || secenek.yalnizKaynak) return false;
    return adaylar.length >= 2 && adaylar[0].puan - adaylar[1].puan < S.esik;
  }
  // şıkkın etiketi (§143): bölümün adı + onu öbürlerinden ayıran kelimeler (kitabın kendi kelimeleri); kitap başka dildeyse
  // ikisi tek çeviriyle kullanıcının diline çevrilir (çevirmen yoksa kitabın dilinde kalır — modelsiz cihaz)
  async function secenekEtiketle(adaylar, dil) {
    const sonuc = [];
    for (const a of adaylar.slice(0, SECENEK_EN_COK)) {
      let baslik = a.bolum ? `${a.ad} — ${a.bolum}` : a.ad, kelimeler = a.kelimeler || [];   // §237: bölüm şıkkında başlık bölümü de taşır
      if (a.dil && a.dil !== dil && AYAR.cevirmen) {
        try {
          const c = String(await cevir(`${a.bolum ? baslik.replace(/:/g, ' -') : a.ad}: ${kelimeler.join(', ')}`, a.dil, dil, 120)).split(/\r?\n/).map((x) => x.trim()).filter(Boolean)[0] || '';
          const iki = c.indexOf(':');
          if (iki > 0) { baslik = c.slice(0, iki).trim(); kelimeler = c.slice(iki + 1).split(/\s*[,،，、]\s*/).map((x) => x.trim()).filter(Boolean); }
        } catch (e) { /* kitabın dilinde kalır */ }
      }
      // §163 (Ercan 15.11: "hiç biri değil olunca … en yakın seçenek varsa onuda görmek istiyor"): bölümün kendi ilk paragrafı ve
      // yolu da taşınır — "hiçbiri" seçilince en yakın bölüm kitabın kendi sözleriyle gösterilir (model yazmaz)
      sonuc.push({ ad: a.ad, ...(a.bolum !== undefined ? { bolum: a.bolum } : {}), kitap: a.kitap, dil: a.dil, puan: a.puan, yol: a.yol || '', ilk: a.ilk || '', baslik, kelimeler, etiket: kelimeler.length ? `${baslik} — ${kelimeler.join(', ')}` : baslik });
    }
    return sonuc;
  }

  // ---- §145 Heybe defteri (Ercan 14.11: "Heybe hafızası olsa harika olur"; "Tıbbi gruba girdim içerisinde Ercan girdim ve
  //      arama çubuğunda ateş yazdım"): kayıtlı cevaplar ve kişisel notlar, kullanıcının iç içe gruplarında. Saklama yardımcıda
  //      (/api/defter); arama ve denetim burada — modelsiz, her cihazda. Kimliği yalnız UID taşır (ad değişebilir).
  function defterKimlik() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  // bir grubun kendisi ve bütün alt grupları
  function defterAltGruplar(defter, grupId) {
    const sonuc = new Set([grupId]);
    let degisti = true;
    while (degisti) {
      degisti = false;
      for (const g of defter.gruplar || []) if (g.ust && sonuc.has(g.ust) && !sonuc.has(g.id)) { sonuc.add(g.id); degisti = true; }
    }
    return sonuc;
  }
  // grubun yolu: "Tıbbi › Ercan"
  function defterYol(defter, grupId) {
    const ad = [];
    let g = (defter.gruplar || []).find((x) => x.id === grupId), koruma = 0;
    while (g && koruma++ < 50) { ad.unshift(g.ad); g = (defter.gruplar || []).find((x) => x.id === g.ust); }
    return ad;
  }
  // arama: sorgunun bütün kelimeleri kaydın adında, sorusunda, cevabında, notunda ya da (dil) çevirisinde geçmeli; grupId
  // verilirse yalnız o grup ve alt grupları. Türkçe küçük harf; sorgu kelimesinin ilk 5 harfi kaydın bir kelimesinin başı:
  // "ateş" → "ateşi", "ateşte"; "ateşler" → "ateşle…"
  function defterAra(defter, sorgu, grupId = null, dil = 'tr') {
    const kc = (m) => kucuk(String(m || ''));
    const kokler = [...new Set((kc(sorgu).match(/[\p{L}\p{N}]+/gu) || []).map((w) => w.slice(0, 5)))];   // kelime başı: "ateş" → "ateşte" de
    const kapsam = grupId ? defterAltGruplar(defter, grupId) : null;
    return (defter.kayitlar || []).filter((k) => {
      if (kapsam && !kapsam.has(k.grup)) return false;
      if (!kokler.length) return true;
      const c = (k.ceviriler || {})[dil] || {};
      const metin = kc([k.ad, k.soru, k.cevap, k.metin, c.ad, c.soru, c.cevap, c.metin].join(' '));
      const kelimeler = metin.match(/[\p{L}\p{N}]+/gu) || [];
      return kokler.every((x) => kelimeler.some((w) => w.startsWith(x)));
    });
  }
  // kaydın başka dile çevirisi (§145). Kısa ad tek başına çevrilmez: "Ateş düşürme" yalnız "Fire suppression", "Sıcak
  // çarpması" Almancada "ani ağrı" oldu (14.11 canlı deneme). Ad kendi satırında, altında sorusu ya da notunun tamamı bağlam
  // olarak çevrilir; ilk satır alınır (4 dilde 16 örnekte satır düzeni korundu, "iki nokta" ayracı 3'ünde düştü). Düzen
  // bozulursa ya da satır addan çok uzunsa ad özgün dilinde kalır: yanlış ad, çevrilmemiş addan kötüdür.
  async function defterCevir(k, hedef, cevirici = cevir) {
    const kaynak = k.dil || 'tr', govdeAlan = k.tur === 'not' ? 'metin' : 'cevap';
    const c = async (x, n) => (x ? String(await cevirici(x, kaynak, hedef, n)).trim() : '');
    const sonuc = {};
    if (k.soru) sonuc.soru = await c(k.soru, 200);
    sonuc[govdeAlan] = await c(k[govdeAlan], 900);
    const ilkSatir = (x) => String(x || '').split(/\r?\n/).map((y) => y.trim()).filter(Boolean)[0] || '';
    if (k.soru && k.ad === ilkSatir(k.soru).slice(0, 120)) { sonuc.ad = ilkSatir(sonuc.soru) || k.ad; return sonuc; }
    const bag = String(k.soru || k.metin || '').slice(0, 600);
    sonuc.ad = k.ad;
    if (!bag) return sonuc;
    try {
      const satirlar = String(await cevirici(`${k.ad}\n\n${bag}`, kaynak, hedef, 320)).split(/\r?\n/).map((y) => y.trim()).filter(Boolean);
      const ad = (satirlar[0] || '').replace(/\s*[:：]\s*$/, '');
      if (satirlar.length >= 2 && ad && ad.length <= k.ad.length * 3 + 30) sonuc.ad = ad;
    } catch (e) { /* ad özgün dilinde kalır */ }
    return sonuc;
  }
  // ---- defter kilidi — K7 (15.11.2026, Özet §146–§148). LM: "K7 kararı doğrudan ihlal edilmiştir"; K7: "Kişisel veri standart
  //      şifrelemeyle korunur, anahtar kullanıcının parolasıdır (USB'de durmaz). Açık bırakılabilen acil durum kartı + kâğıda basılı
  //      kurtarma kodu." Kendi icadımız değil, standart: Web Crypto — PBKDF2-SHA256 (600 000 tekrar) ile anahtar türetme, AES-GCM-256.
  //      Defter rastgele bir veri anahtarıyla şifrelenir; o anahtar iki kez sarılır: parolayla ve kurtarma koduyla (125 bit, kâğıtta).
  //      Parola unutulunca kodla açılır, yeni parola konur; kod değişmez (kâğıt geçerli kalır). Kurtarıcının görmesi gereken bilgi
  //      (alerji, kan grubu) şifresiz acil kartında (Ö14). Yanlış parola AES-GCM doğrulamasında düşer — sessiz bozuk veri dönmez.
  const KILIT_TEKRAR = 600000, KILIT_YONTEM = 'PBKDF2-SHA256/AES-GCM-256', PAROLA_EN_KISA = 8;
  const KURTARMA_ABECE = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford: I, L, O, U yok (karışmasın)
  const b64Yaz = (u8) => { let s = ''; for (const x of u8) s += String.fromCharCode(x); return btoa(s); };
  const b64Oku = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  function kriptoVar() { return !!(globalThis.crypto && globalThis.crypto.subtle && globalThis.crypto.getRandomValues); }
  const rastgele = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
  // parola: baş ve sondaki boşluk atılır (telefon klavyesinin eklediği boşluk kilitlemesin), harfler NFC (aynı harf iki biçimde)
  const parolaTemiz = (p) => String(p || '').normalize('NFC').trim();
  // kod: büyük harf, ayraçlar atılır, karışan harfler düzeltilir (O → 0, I/L → 1); 25 harf değilse geçersiz
  function kurtarmaTemiz(k) {
    const t = String(k || '').toUpperCase().replace(/[\s\-_.]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    return t.length === 25 && [...t].every((c) => KURTARMA_ABECE.includes(c)) ? t : null;
  }
  function kurtarmaKoduUret() {
    const t = [...rastgele(25)].map((x) => KURTARMA_ABECE[x & 31]).join('');   // 256, 32'nin katı: eşit dağılım
    return t.match(/.{5}/g).join('-');
  }
  async function sarmaAnahtari(sir, tuz, tekrar) {
    const k = globalThis.crypto.subtle;
    const ham = await k.importKey('raw', new TextEncoder().encode(sir), 'PBKDF2', false, ['deriveKey']);
    return k.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: tuz, iterations: tekrar }, ham, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function aesSifrele(anahtar, veri) {
    const iv = rastgele(12);
    return { iv: b64Yaz(iv), veri: b64Yaz(new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, anahtar, veri))) };
  }
  async function aesCoz(anahtar, kutu) {
    return new Uint8Array(await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64Oku(kutu.iv) }, anahtar, b64Oku(kutu.veri)));
  }
  const veriAnahtari = (ham) => globalThis.crypto.subtle.importKey('raw', ham, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  async function anahtarSar(ham, sir, tekrar) {
    const tuz = rastgele(16);
    return { tuz: b64Yaz(tuz), ...(await aesSifrele(await sarmaAnahtari(sir, tuz, tekrar), ham)) };
  }
  async function anahtarAc(kutu, sir, tekrar) { return aesCoz(await sarmaAnahtari(sir, b64Oku(kutu.tuz), tekrar), kutu); }
  const defterZarfi = (d) => !!(d && d.sifreli);
  // ilk kilit: yeni veri anahtarı + yeni kurtarma kodu → { zarf, kod, anahtar }; kod yalnız bir kez döner, saklanmaz
  async function defterKilitKur(defter, parola, tekrar = KILIT_TEKRAR) {
    const p = parolaTemiz(parola);
    if (p.length < PAROLA_EN_KISA) throw new Error('parola kısa');
    const ham = rastgele(32), kod = kurtarmaKoduUret(), anahtar = await veriAnahtari(ham);
    const sifreli = { yontem: KILIT_YONTEM, tekrar, parola: await anahtarSar(ham, p, tekrar), kurtarma: await anahtarSar(ham, kurtarmaTemiz(kod), tekrar) };
    sifreli.defter = await aesSifrele(anahtar, new TextEncoder().encode(JSON.stringify(defter)));
    ham.fill(0);
    return { zarf: { surum: 2, sifreli }, kod, anahtar };
  }
  // açma: parolayla (kurtarma=false) ya da kurtarma koduyla → { defter, anahtar, ham? }; yanlışsa hata (AES-GCM doğrulaması)
  async function defterKilitAc(zarf, sir, kurtarma = false) {
    const s = zarf.sifreli, t = kurtarma ? kurtarmaTemiz(sir) : parolaTemiz(sir);
    if (!t) throw new Error('kod geçersiz');
    let ham;
    try { ham = await anahtarAc(kurtarma ? s.kurtarma : s.parola, t, s.tekrar); } catch (e) { throw new Error(kurtarma ? 'kod yanlış' : 'parola yanlış'); }
    const anahtar = await veriAnahtari(ham);
    const defter = JSON.parse(new TextDecoder().decode(await aesCoz(anahtar, s.defter)));
    return kurtarma ? { defter, anahtar, ham } : (ham.fill(0), { defter, anahtar });
  }
  // yazma: içerik aynı anahtarla yeniden şifrelenir, sarılı anahtarlar olduğu gibi kalır
  async function defterKilitle(defter, zarf, anahtar) {
    return { surum: 2, sifreli: { ...zarf.sifreli, defter: await aesSifrele(anahtar, new TextEncoder().encode(JSON.stringify(defter))) } };
  }
  // §158 (K7): "bu cevap yanlış" kaydı soruyu, cevabı ve notu taşır — kişisel bilgi. Defterim'in veri anahtarıyla şifrelenir;
  // açıkta yalnız dil ve sonuç (ölçü için). Liste için soru ve notun kısa özeti ayrıca şifreli (tam kayıt çözülmeden gösterilir).
  async function yanlisSifrele(kayit, anahtar) {
    const en = (x) => new TextEncoder().encode(JSON.stringify(x));
    return { dil: kayit.dil || '', sonuc: kayit.sonuc || 'cevap', sifreli: await aesSifrele(anahtar, en(kayit)),
      sifreliOzet: await aesSifrele(anahtar, en({ soru: kayit.soru || '', not: kayit.not || '', tarih: kayit.tarih || '' })) };
  }
  async function yanlisCoz(kutu, anahtar) { return JSON.parse(new TextDecoder().decode(await aesCoz(anahtar, kutu))); }
  // açık defteri yeniden okumak (yazma hatasından sonra): veri anahtarıyla, parola sormadan
  async function defterCoz(zarf, anahtar) { return JSON.parse(new TextDecoder().decode(await aesCoz(anahtar, zarf.sifreli.defter))); }
  // parolamı unuttum: kodla açılır, veri anahtarı yeni parolayla yeniden sarılır; kurtarma sarması aynı kalır (kâğıt geçerli)
  async function defterParolaYenile(zarf, kod, yeniParola) {
    const p = parolaTemiz(yeniParola);
    if (p.length < PAROLA_EN_KISA) throw new Error('parola kısa');
    const { defter, anahtar, ham } = await defterKilitAc(zarf, kod, true);
    const yeni = { surum: 2, sifreli: { ...zarf.sifreli, parola: await anahtarSar(ham, p, zarf.sifreli.tekrar) } };
    ham.fill(0);
    return { zarf: yeni, defter, anahtar };
  }
  // kişisel notun denetimi: eylem bekçisinin kuralları notun kendi sözleriyle (soru = not) — "Bu notta tehlikeli olabilecek
  // bir öneri var" uyarısı; not kullanıcının, Heybe silmez, yalnız gösterir (K18)
  function notDenetle(metin, dil = 'tr') {
    return eylemDenetle(metin, metin, dil).map((x) => (EYLEM.find((k) => `eylem: ${k.ad}` === x) || {}).kod).filter(Boolean);
  }

  async function sorAsil(soru, bildir = () => {}, dil = 'tr', secenek = {}) {
    // §133 acil belirti kartı: en dıştaki çağrıda bir kez bakılır (köprünün iç çağrıları acilBakildi taşır)
    if (!secenek.acilBakildi && !secenek.yalnizKaynak && !secenek.secilen) {
      const belirti = await acilBak(soru, dil);
      if (belirti.length) return acilSonuc(soru, bildir, dil, secenek, belirti);
      secenek = { ...secenek, acilBakildi: true };
    }
    // §188 DENEY kaynaktan uyarı: en dıştaki çağrının sonucuna eklenir (cevabı durdurmaz, değiştirmez); acil kartında bakılmaz
    if (secenek.yedekDiller && AYAR.uyariKanali && AYAR.uyariKanali.acik && !secenek._uyari) {
      const r = await sor(soru, bildir, dil, { ...secenek, _uyari: true });
      if (r.acil) return r;
      const uyarilar = [];
      try {
        // bütün dillerde (uyarı cevabın diline bağlı değil: jeneratörün karbonmonoksit uyarısı İngilizce tıp vikisinde,
        // cevap Türkçe kitaptan yazılmıştı); eksik dilin sorusu ve başlıkları köprünün yoluyla üretilir
        const liste = secenek.yedekDiller === 'hepsi' ? await mevcutDiller(dil) : secenek.yedekDiller;
        let gruplar = r.gruplar ? [...r.gruplar] : [{ dil, soru, basliklar: r.basliklar || [] }];
        const eksikDil = [dil, ...liste].filter((d) => !gruplar.some((g) => g.dil === d));
        if (eksikDil.length) gruplar = [...gruplar, ...await koprulu(soru, dilAl(dil), dil, eksikDil, () => {}, secenek.konu)];
        for (const g of gruplar) uyarilar.push(...await uyariAra(g.soru, g.basliklar, g.dil));   // §190: diller sırayla (aynı anda aramak kiwix'i düşürdü)
      } catch (e) { /* uyarı bulunamazsa cevap aynen */ }
      return { ...r, uyarilar };
    }
    if (secenek.yedekDiller) {
      // önce kendi dilinde (ölçülmüş yol); kaynaklarda yoksa köprüden öbür dillere (K17).
      // yedekDiller: 'hepsi' → bellekte ne varsa (Ercan 06.11: "geri kalan kütüphane kullanıcı tercihi")
      const { yedekDiller, ...geri } = secenek;
      // 16.11 (§172) DENEY dil körü arama (AYAR.dilKoru): önce bütün dillerde tek havuz, yalnız arama (cevap yazılmaz).
      // En iyi bölüm başka dildeyse doğrudan köprü (yabancı bölümler, çevirerek — karışık havuzdan doğrudan Türkçe yazmak
      // yok: 06.11'de o yolda "do not cut" → "kesin" oldu, çeviri bekçileri orada çalışmaz). Köprü "bilgi yok" derse
      // kendi dilinde denenir. En iyi bölüm kendi dilindeyse eski yol aynen.
      // §207 DENEY çok dilli havuz: bütün diller tek aramada; dil seçilmez, ikinci arama yok (diller şık sonrası için taşınır)
      if (AYAR.cokDilli) {
        const liste = yedekDiller === 'hepsi' ? await mevcutDiller(dil) : yedekDiller;
        if (liste.length) {
          bildir('kopru', liste);
          return { ...await sor(soru, bildir, dil, { ...geri, kaynakDilleri: [dil, ...liste] }), cokDilli: true };
        }
      }
      if (AYAR.dilKoru) {
        const t0k = Date.now();
        const liste = yedekDiller === 'hepsi' ? await mevcutDiller(dil) : yedekDiller;
        if (liste.length) {
          const havuz = await sor(soru, bildir, dil, { ...geri, kaynakDilleri: [dil, ...liste], yalnizKaynak: true });
          const enIyi = enIyiDil(havuz.parcalar, dil);
          if (enIyi !== dil) {
            bildir('kopru', liste);
            const yab = await sor(soru, bildir, dil, { ...geri, kaynakDilleri: liste });
            const sn = () => Math.round((Date.now() - t0k) / 100) / 10;
            if (!yab.bilgiYok) return { ...yab, dilKoru: { enIyi }, toplam_sn: sn() };
            const kendi = await sor(soru, bildir, dil, geri);
            return { ...kendi, dilKoru: { enIyi, kopruBilgiYok: true }, toplam_sn: sn() };
          }
        }
      }
      const ilk = await sor(soru, bildir, dil, geri);
      // 07.11 (§47) denendi, geri alındı: ilk deneme durunca da köprüye bakmak — görülmüş 8 durmanın 4'ü cevaba döndü,
      // hiçbiri doğru değildi (kontrol sorusuna film önerisi, bebeğe benzokain). Durma + kaynak, zayıf köprü cevabından iyidir.
      if (!ilk.bilgiYok) return ilk;
      const liste = yedekDiller === 'hepsi' ? await mevcutDiller(dil) : yedekDiller;
      if (!liste.length) return ilk;
      bildir('kopru', liste);
      const ikinci = await sor(soru, bildir, dil, { ...geri, kaynakDilleri: liste });
      const toplam_sn = Math.round((ilk.toplam_sn + ikinci.toplam_sn) * 10) / 10;
      // 07.11 (Ö18 denemesi): iki deneme de "bilgi yok" derse kullanıcı kendi dilindeki kaynakları görsün — yoksa
      // sayfa hiç kaynak göstermiyordu ("Sinek mantarı yenir mi?": doğru paragraf 1. sıradaydı, model "yok" dedi)
      if (ikinci.bilgiYok && ilk.parcalar.length) return { ...ilk, kopruDenendi: liste, toplam_sn };
      return { ...ikinci, ilkDeneme: { basliklar: ilk.basliklar, parcalar: ilk.parcalar.length, ...(ilk.zayifHavuz ? { zayifHavuz: ilk.zayifHavuz } : {}) }, toplam_sn };
    }
    const D = dilAl(dil);
    const t0 = Date.now();
    const diller = secenek.kaynakDilleri || [dil];
    const kopru = !(diller.length === 1 && diller[0] === dil);
    const kitaplar = await kitaplik();
    const kitapVar = diller.some((kd) => dildekiler(kitaplar, dilAl(kd)).length > 0);
    bildir('baslik');
    let basliklar, parcalar, gruplar = null;
    if (!kopru) {
      basliklar = basliklariAyikla(await sohbet(D.baslik, AYAR.konuBaslik && secenek.konu ? `${secenek.konu}: ${soru}` : soru, 60));
      bildir('kaynak', basliklar);
      parcalar = await kaynakBul(soru, basliklar, dil, null, AYAR.konuSorgu && secenek.konu ? `${secenek.konu}: ${soru}` : soru, secenek.secilen || null);
    } else {
      gruplar = await koprulu(soru, D, dil, diller, bildir, secenek.konu);
      basliklar = gruplar.flatMap((g) => g.basliklar);
      // anlam sıralamasının sorgusu — varsayılan özgün soru (ölçülmüş yol). 09.11 (§86) seçenek 'ikisi': özgün soru + birinci
      // kaynak dilindeki çevirisi birlikte (puan ortalaması); tanıda (F, IFRC) kaynak cümlesi 48 → 58/75. Küçük kitap
      // aramasıyla birlikte ölçüldü, geçen kötü cevap arttı → varsayılan değil (bkz. AYAR.kucukKitap). secenek.sorgu: 'ceviri' · 'ikisi'
      const ceviri = (gruplar.find((g) => g.dil !== dil) || gruplar[0]).soru;
      const sorguMetni = secenek.sorgu === 'ceviri' ? ceviri : secenek.sorgu === 'ikisi' ? [soru, ceviri]
        : AYAR.konuSorgu && secenek.konu ? `${secenek.konu}: ${soru}` : soru;   // §150 deney 2
      parcalar = await kaynakBul(soru, basliklar, dil, gruplar, sorguMetni, secenek.secilen || null);
    }
    const aramaSn = (Date.now() - t0) / 1000;
    if (secenek.yalnizKaynak) return { soru, dil, basliklar, parcalar, gruplar };   // yalnız ölçüm: cevap yazılmaz
    const esik = (AYAR.zayifHavuz || {})[dil];
    if (!kopru && esik && parcalar.length && parcalar[0].puan < esik) {   // Ö26 zayıf havuz: kaynaklar görünür, cevap yazılmaz
      return { soru, dil, basliklar, parcalar, cevap: D.yok, eksik: [], durdur: false, bilgiYok: true, zayifHavuz: parcalar[0].puan, kitapVar,
        arama_sn: Math.round(aramaSn * 10) / 10, toplam_sn: Math.round((Date.now() - t0) / 100) / 10 };
    }
    if (!parcalar.length) {
      // Kaynak yoksa modele hiç sorulmaz: 06.11'de Çekçe kitap yokken model kendi bilgisinden "100" diye
      // cevap yazdı, sayı denetçisi durdurdu. K1 gereği cevap sabit "bilmiyorum"dur.
      return { soru, dil, basliklar, parcalar, cevap: D.yok, eksik: [], durdur: false, bilgiYok: true, kitapVar,
        arama_sn: Math.round(aramaSn * 10) / 10, toplam_sn: Math.round((Date.now() - t0) / 100) / 10,
        ...(gruplar ? { gruplar } : {}) };
    }
    // §135 şıklar (Ercan 14.11: "doktor gibi sor"): ilk iki aday bölüm birbirine çok yakınsa Heybe tahmin etmez, sorar —
    // en çok 4 bölüm, kullanıcının dilinde adı ve ilk cümlesiyle; cevap seçilen bölümden yazılır (secenek.secilen).
    // Etiketli 150 IFRC sorusunda (§135): doğru bölüm 1. sırada 100, 2–4. sırada 13; ilk ikisinin farkı doğru 1.'yken
    // ortanca 0,084, gerideyken 0,014. Eşik 0,03: sorulan 49 · kurtarılabilen 10 · gereksiz 22.
    const adaylar = parcalar.adaylar || [];
    if (secenekGerekli(adaylar, secenek)) {
      return { soru, dil, basliklar, parcalar, secenekler: await secenekEtiketle(adaylar, dil), diller, cevap: '', eksik: [], durdur: false,
        bilgiYok: false, kitapVar, ...(gruplar ? { gruplar } : {}), arama_sn: Math.round(aramaSn * 10) / 10, toplam_sn: Math.round((Date.now() - t0) / 100) / 10 };
    }
    bildir('cevap', parcalar);
    // kaynakların hepsi başka dildeyse: tek dilse o dilde, birkaç dilse İngilizce ara dilde yazılır (06.11: Hintçe soruya
    // Türkçe + Çekçe kaynak gelince eski yola düşüp Türkçe cevap verdi)
    const yabanciDiller = new Set(parcalar.map((p) => p.dil));
    const kd = yabanciDiller.size === 1 ? parcalar[0].dil : 'en';
    if (secenek.cevap === 'cevirerek' && AYAR.cevirmen && parcalar.every((p) => p.dil && p.dil !== dil)) {
      // Çevirmen yarışının kazanan yolu (06.11): cevap önce kaynağın dilinde yazılır, TranslateGemma kullanıcının
      // diline çevirir. Doğrudan Türkçe yazınca model "do not cut" → "kesin" yaptı; bu yolda olumsuzluk korundu.
      const KD = dilBilgi(kd);
      const g = gruplar.find((x) => x.dil === kd) || { soru: kd === dil ? soru
        : secenek.konu ? (await konuluCevir(soru, secenek.konu, dil, kd, 120)).metin : await cevir(soru, dil, kd, 120) };   // §150 konu
      const ham = await sohbet(hukumsuz(KD.sistem, kd), `${KD.kaynaklar}:\n${kaynakMetni(parcalar, kd)}\n\n${KD.soru}: ${g.soru}`);
      const sure = () => ({ arama_sn: Math.round(aramaSn * 10) / 10, toplam_sn: Math.round((Date.now() - t0) / 100) / 10 });
      const ya = yokAyikla(ham, KD.yok);
      const yerel = acilNumaraYerel(ya.metin, kd);   // §207: numara çeviriden önce değişir (her hedef dilde doğal cümle)
      const ozgun = yerel.metin;
      if (ya.yok) {
        return { soru, dil, basliklar, parcalar, cevap: D.yok, eksik: [], durdur: false, bilgiYok: true, kitapVar, gruplar,
          ozgun: { dil: kd, cevap: ozgun }, ...sure() };
      }
      const cevap = kd === dil ? ozgun : await cevir(ozgun, kd, dil);
      // denetimler: özgün cevap kaynağa karşı (sayı + bağlam, aynı dil), çeviri özgün cevaba karşı (sayı + olumsuzluk),
      // çeviri soruya karşı (terim). Bağlamda soru, kaynağın kendi dilindeki çevirisiyle okunur (yer adları için).
      const sorular = { [dil]: soru, [kd]: g.soru };
      for (const x of gruplar || []) sorular[x.dil] = x.soru;
      const denetim = { ozgun: [...denetle(parcalar, ozgun, kd), ...baglamDenetle(g.soru, ozgun, kd, parcalar, sorular), ...aktarmaDenetle(ozgun, parcalar, kd), ...dayanakDenetle(ozgun, parcalar, kd)],
        ceviri: denetle([{ metin: ozgun, dil: kd }], cevap, dil), terim: terimDenetle(soru, cevap, dil),
        yazi: yaziDenetle(cevap, dil), kip: kipDenetle(ozgun, kd, cevap, dil), olumsuzluk: [], gidisDonus: [] };
      if (kd !== dil) {
        // Ö20: çeviri özgünün diline geri çevrilir (bir çeviri daha, ~2–4 sn); olumsuzluk, sayı ve yön orada da bakılır
        let geri = '';
        try { geri = await cevir(cevap, dil, kd); } catch (e) { /* çevirmen yoksa yalnız doğrudan denetimler */ }
        denetim.olumsuzluk = await olumsuzlukDenetle(ozgun, kd, cevap, dil, geri || null);
        denetim.gidisDonus = [...gidisDonus(ozgun, kd, geri), ...dusenKelime(ozgun, geri, g.soru, kd)];
        denetim.geri = geri;
      }
      // Ö25: özgün cevap kaynağın dilindeki soruyla, çeviri kullanıcının sorusuyla (tr/en ise) eylem bekçisinden geçer
      denetim.eylem = [...new Set([...eylemDenetle(g.soru, ozgun, kd), ...(kd !== dil ? eylemDenetle(soru, cevap, dil) : [])])];
      denetim.ortam = ortamDenetle(soru, dil, atifBolumleri(ozgun, parcalar));   // §114
      denetim.konu = secenek.secilen ? [] : await konuDenetle(g.soru, ozgun, parcalar);   // §122: kaynağın dilindeki soruyla (§135: bölümü kullanıcı seçtiyse sorulmaz)
      const eksik = [...new Set([...denetim.eylem, ...denetim.ozgun, ...denetim.ceviri, ...denetim.terim, ...denetim.yazi, ...denetim.kip, ...denetim.olumsuzluk, ...denetim.gidisDonus, ...denetim.ortam, ...denetim.konu])];
      denetim.ikinciGoz = eksik.length ? [] : await ikinciGoz(soru, cevap);   // Ö22: durmuş cevaba sorulmaz
      eksik.push(...denetim.ikinciGoz);
      return { soru, dil, basliklar, parcalar, adaylar: secenek.secilen ? [] : (parcalar.adaylar || []), diller, cevap, eksik, durdur: eksik.length > 0, bilgiYok: false, kitapVar, gruplar,
        bolumler: atifBolumleri(ozgun, parcalar),
        ozgun: { dil: kd, cevap: ozgun, guvenli: denetim.ozgun.length === 0 && !denetim.ikinciGoz.length && !denetim.eylem.length }, denetim, ...sure(),
        ...(yerel.n ? { acilNumara: yerel.n } : {}) };
    }
    // §207 DENEY çok dilli havuz: karışık havuzda başka dildeki bölümler çevirmenle kullanıcının diline çevrilir ve bekçiden geçer
    // (sayı, olumsuzluk, kip); geçemeyen bölüm modele gitmez. Atıflar ([n]) kalan bölümlerin sırasıyla.
    let havuzDusen = null;
    if (AYAR.cokDilli && secenek.cevap === 'cevirerek' && AYAR.cevirmen && parcalar.some((p) => p.dil && p.dil !== dil)) {
      const h = await havuzCevir(parcalar, dil);
      h.parcalar.adaylar = parcalar.adaylar;
      parcalar = h.parcalar;
      havuzDusen = h.dusen;
    }
    const yabanci = parcalar.some((p) => p.dil && p.dil !== dil);
    const sistem = yabanci ? `${D.sistem}\n${KOPRU[dil] || KOPRU.en.replace('in English', 'in ' + (DIL_ADI[dil] || dil))}` : D.sistem;
    const ya = yokAyikla(await sohbet(hukumsuz(sistem, dil), `${D.kaynaklar}:\n${kaynakMetni(parcalar, dil)}\n\n${D.soru}: ${soru}`), D.yok);
    const cevap = ya.metin;
    const sorular = { [dil]: soru };
    for (const x of gruplar || []) sorular[x.dil] = x.soru;
    const eksik = [...(ya.yok ? [] : [...eylemDenetle(soru, cevap, dil), ...dayanakDenetle(cevap, parcalar, dil), ...yaziDenetle(cevap, dil), ...ortamDenetle(soru, dil, atifBolumleri(cevap, parcalar)), ...(secenek.secilen ? [] : await konuDenetle(soru, cevap, parcalar))]), ...denetle(parcalar, cevap, dil), ...baglamDenetle(soru, cevap, dil, parcalar, sorular)];   // Ö25 eylem · Ö27 yazı · §114 ortam · §122 konu
    if (!ya.yok && !eksik.length) eksik.push(...await ikinciGoz(soru, cevap));   // Ö22
    return { soru, dil, basliklar, parcalar, adaylar: secenek.secilen ? [] : (parcalar.adaylar || []), diller, cevap, eksik, durdur: eksik.length > 0, bilgiYok: ya.yok,
      bolumler: ya.yok ? [] : atifBolumleri(cevap, parcalar), kitapVar, arama_sn: Math.round(aramaSn * 10) / 10, toplam_sn: Math.round((Date.now() - t0) / 100) / 10,
      ...(gruplar ? { gruplar } : {}), ...(havuzDusen ? { havuzCeviri: { dusen: havuzDusen } } : {}) };
  }

  // §157 (Ercan 15.11: "Kaynak ne kadar güvenilir ve doğru ise cevap o kadar daha doğru ve yardımcı olabilecek şekilde
  // olacaktır"): kaynağın türü kitabın adından — forum (herkes yazabilir, kişisel deneyim) · viki (gönüllüler yazar).
  // §152'de ulaşan tehlikeli cümlelerin ikisi forumdan, biri vikiden geliyordu. Türü bilinmeyen kitap etiketsiz kalır.
  const KAYNAK_TURU = [
    ['forum', /(^|[._-])(stackexchange|stackoverflow|superuser|serverfault|askubuntu|mathoverflow)([._-]|$)|(^|[._-])(reddit|forum)/i],
    ['viki', /^(wikipedia|wikivoyage|wikibooks|wikiversity|wiktionary|wikinews|wikiquote|wikisource|wikiskripta|mdwiki|wikihow|vikidia|appropedia|wikem)([._-]|$)/i],
  ];
  function kaynakTuru(ad) {
    const a = String(ad || '').replace(/^.*\//, '').replace(/\.zim$/i, '');
    for (const [tur, re] of KAYNAK_TURU) if (re.test(a)) return tur;
    return '';
  }

  // §211: havuzda en iyi puana `fark` kadar yakın forum dışı paragraf varsa forum paragrafları çıkar; yoksa liste aynen.
  // puanli: [[puan, paragraf], …]. Kullanıcının kendi dosyası (kaynak 'benim') forum sayılmaz.
  function forumGeriAl(puanli, fark = (AYAR.forumGeri || {}).fark ?? 0.10) {
    if (!puanli || !puanli.length) return puanli;
    const forum = (p) => p.kaynak !== 'benim' && kaynakTuru(p.kitap) === 'forum';
    if (!puanli.some(([, p]) => forum(p))) return puanli;
    const enIyi = Math.max(...puanli.map(([pu]) => pu));
    const baska = puanli.some(([pu, p]) => !forum(p) && pu >= enIyi - fark);
    return baska ? puanli.filter(([, p]) => !forum(p)) : puanli;
  }

  // §191: en dıştaki çağrı kütüphane arızasını izler (iç çağrılar sor/oku'ya döner, derinlik sayılır)
  const sor = kutuphaneIzle(acilNumaraIzle(sorAsil)), oku = kutuphaneIzle(acilNumaraIzle(okuAsil));   // §207 acil numarası

  const Heybe = { AYAR, DIL, sor, havuzCevir, acilNumaraYerel, acilNumaraSonuc, kutuphaneGetir, kutuphaneDurum, kutuphaneIzle, metinAra, enIyiDil, aramaSorgulari, dilHarmanla, uyariAra, uyariNesneleri, anaDalSirala, sirayaDiz, kitapPayli, uyariCumlesi, sinirliHepsi, hukumsuz, kaynakTuru, KAYNAK_TURU, forumGeriAl, yanlisSifrele, yanlisCoz, oku, okumaKaynak, kelimeSirala, kaynakBul, adaylar, kitaplik, makale, paragraflar, denetle, olcuyle, OLCU,
    basliklariAyikla, kaynakMetni, cevir, konuluCevir, soruKonuAyir, soruKonuSizdi, soruKonuKelime, translateGemmaIstemi, olcuAl, dilBilgi, KISA, UC, DIL_ADI, mevcutDiller, bellektekiDiller,
    olumsuzlukKarsilastir, olumsuzlukDenetle, baglamDenetle, ozelAdlar, kisiler, cevapSatirlari, OLUMSUZ_SAY, konuKelimeleri,
    gidisDonus, yonKarsilastir, yokAyikla, ikinciGoz, IKINCI_GOZ, eylemDenetle, EYLEM, kes, yaziDenetle, BETIK, kipDenetle, KIP, aktarmaDenetle, dayanakDenetle, dayanakKokleri, kaynakBirimleri, AKTARMA_ESIK, dusenKelime, atifBolumleri, konusmaDenetle, soruKisisi, baslikKisisi, kisiUymaz, kisiSirala, kardesMakaleler, parcaSec, yolSorusu, ortamDenetle, konuDenetle, konuUymaz, acilBelirti, ACIL_BELIRTI, acilHakem, acilBak, secenekGerekli, secenekEtiketle, ayirtKelimeler, adayBolumler, secilenUyar, defterKimlik, defterAltGruplar, defterYol, defterAra, notDenetle, defterCevir,
    kriptoVar, kurtarmaTemiz, kurtarmaKoduUret, parolaTemiz, defterZarfi, defterKilitKur, defterKilitAc, defterKilitle, defterParolaYenile, defterCoz, KILIT_TEKRAR, PAROLA_EN_KISA };
  if (typeof module !== 'undefined' && module.exports) module.exports = Heybe;
  kok.Heybe = Heybe;
})(typeof globalThis !== 'undefined' ? globalThis : this);
