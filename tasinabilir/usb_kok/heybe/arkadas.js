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
    // VARSAYILAN KAPALI (sinir 0). Ölçüm: aramayı görülmemiş G setinde de iyileştirdi (kaynak cümlesi 32 → 42/75, sorgu
    // 'ikisi' ile birlikte), ama daha çok cevap durmadan geçti ve geçenlerin kötüsü arttı (G: yanlış/tehlikeli geçen 0 → 4).
    // Bekçiler yeni cevap türlerini (çevirinin düşürdüğü kelime, yanlış bölüm) görene dek açılmaz. Ölçmek için: sinir 5000.
    kucukKitap: { sinir: 0, konu: 5 },
  };

  const PARCA_SAYISI = 6;       // modele giden paragraf sayısı
  const PARCA_UZUNLUK = 900;    // her paragraf en çok bu kadar harf
  const MAKALE_BASINA = 3;      // bir makaleden en çok kaç paragraf
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
    if (!yanit.ok) throw new Error(`${yanit.status} ${url}`);
    return yanit;
  }

  function yolKodla(yol) {
    return yol.split('/').map(encodeURIComponent).join('/');
  }

  // ---- kitaplık: kütüphane sunucusunun kendi kataloğundan (06.11.2026 — K13) ----

  async function kitaplik(kati = false) {
    // her soruda yeniden okunur (yerel, birkaç milisaniye): yeni inen kitap hemen aranır
    // kati: kütüphane açılmadıysa yedek kitabı uydurma, hata ver (dil ekranındaki tik için — 06.11)
    try {
      const xml = await (await getir(`${AYAR.kutuphane}/catalog/v2/entries?count=1000`)).text();
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
      const liste = await (await getir(u)).json();
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
      const xml = await (await getir(u)).text();
      const yollar = [];
      for (const m of xml.matchAll(/<item>[\s\S]*?<link>([^<]*)<\/link>/g)) {
        const link = /\/content\/([^/]+)\/(.*)$/.exec(varlikCoz(m[1]));
        if (link) yollar.push({ kitap: decodeURIComponent(link[1]), yol: decodeURIComponent(link[2]) });
      }
      return yollar.slice(0, adet);
    } catch (e) { return []; }
  }

  async function makale(yol, kitap = AYAR.kitap) {
    const html = await (await getir(`${AYAR.kutuphane}/raw/${encodeURIComponent(kitap)}/content/${yolKodla(yol)}`)).text();
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

  async function sohbet(sistem, mesaj, uzunluk = 350) {
    if (AYAR.kalip === 'sablon') return sablonla([{ role: 'system', content: sistem }, { role: 'user', content: mesaj }], uzunluk);
    const yanit = await (await getir(`${AYAR.sohbet}/completion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: gemmaIstemi(sistem, mesaj), n_predict: uzunluk, temperature: 0, seed: 1,
        stop: ['<end_of_turn>'] }),
    })).json();
    return yanit.content.trim();
  }

  async function cevir(metin, kaynak, hedef, uzunluk = 450) {
    // dil köprüsü: TranslateGemma sunucusuyla çeviri (AYAR.cevirmen)
    const yanit = await (await getir(`${AYAR.cevirmen}/completion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: translateGemmaIstemi(metin, kaynak, hedef), n_predict: uzunluk, temperature: 0, seed: 1,
        stop: ['<end_of_turn>'] }),
    })).json();
    return yanit.content.trim();
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
      tr: /turnike|(dakikada bir|dakika sonra|saatte bir)(\s+\p{L}+){0,3}\s+(gevşet|açıl|açın|aç)|şerit(\s+\p{L}+){0,4}\s+sık|boğma işlem|yara ile kalp arasın|kalp ile yara arasın/u,
      en: /tourniquet|constricting band|between the (wound|bite) and the heart|loosen\w* (it )?every \d+/ },
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
      tr: /(?<!\p{L})(em(erek|ip|ilmeli|ilir|mek|ilerek)|emme yöntem\p{L}*)(?!\p{L})|ağz\p{L}* ile (em|çek)|(yara|ısırı[kğ]|deri)\p{L}*(\s+\p{L}+){0,2}\s+kes\p{L}*|kesik at\p{L}*|çentik|(?<!\p{L})buz(?!\p{L})|(?<!\p{L})buz(la|lu|u|a)(?!\p{L})|soğuk (kompres|paket|uygula)\p{L}*/u,
      // 09.11 (F10, 0.19.0 ölçümü, görülmüş, §86): model kaynağın "cold compress should not be applied"ını "Apply a cold
      // compress" yazdı, Türkçesi geçti (tehlikeli) — soğuk kompres ve soğuk paket de buzlamaktır
      en: /\bsuck\w*|incision|cut (into|across|open)|\bice\b|cold (compress|pack)|electric shock/ },
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
    { ad: 'bilinçsize ya da inme geçirene ağızdan bir şey vermek', kod: 'bilincsiz',   // inme: yutma bozulur (07.11 X29, görülmüş)
      soru: { tr: /bilin[çc]\p{L}*\s+(kapalı|yok|kayb\p{L}*|gitti\p{L}*)|bilinçsiz\p{L}*|baygın\p{L}*|kendinde değil|tepki vermiyor|(?<!\p{L})inme(?!\p{L})|inme (geçir|şüphe)\p{L}*|felç\p{L}*|beyin kanam\p{L}*/u,
        en: /unconscious\w*|unresponsive|passed out|(?<!(heat|sun)\s)\bstroke|brain (bleed|haemorrhage|hemorrhage)/ },
      sonraSerbest: true,
      tr: /(su|suyu|sıvı|ila[çc]\p{L}*|yiyece[kğ]\p{L}*|yemek|şeker\p{L}*|şerbet|çay|kahve|alkol\p{L}*)\s+(\p{L}+\s+)?(ver|içir|yedir)\p{L}*/u,
      en: /(giv|offer)\w* (\w+ ){0,2}(water|food|drinks?|fluids|liquids|anything|sugar)|\bdrink\w* (\w+ ){0,2}(water|liquids|fluids)|(water|drinks?|fluids|liquids)[\s,]+(\w+[\s,]+){0,3}(may|can|should) be (used|given|offered|drunk)/ },
  ];
  // "sonra / kendine gelince" — eylem o cümlede sonraki an için söyleniyor
  const SONRA = { tr: /sonra\p{L}*|geçince|geçtikten|bittikten|bitince|durunca|durduktan|kendine gel\p{L}*|ayıl\p{L}*|uyan\p{L}*/u,
    en: /\bafter\w*|\bonce\b|when (the shaking|they wake|they are awake)|regain\w*/ };
  // uyaran cümle ("kusturmak yanlıştır", "eskiden önerilirdi") eylemi önermez
  // "X yerine Y" X'i önermez (07.11 X10: "chest thrusts instead of abdominal thrusts")
  const UYARI = { tr: /yanlış|zararlı|tehlikeli|önerilmez|sakınca\p{L}*|kaçın\p{L}*|yasak|asla|efsane|halk arasında|eskiden|(?<!\p{L})yerine(?!\p{L})/u,
    en: /wrong|harmful|dangerous|myth|outdated|no longer|discourag\w*|contraindicat\w*|never|should be avoided|old advice|instead of|rather than/ };
  // olumsuz KOŞUL olumsuzluk sayılmaz ("ulaşılamıyorsa", "if the person cannot cough, …") — eylem bekçisi ve aktarma denetimi
  const KOSULSUZ = {
    tr: (m) => m.replace(/\p{L}*(m[ıiuü]yors[ae]|m[ae]zs[ae]|m[ae]d[ıi]ys[ae])(?!\p{L})|(?<!\p{L})(yoksa|değilse)(?!\p{L})/gu, ' '),
    en: (m) => m.replace(/\b(if|when|unless)\b[^,;.]*?\b(not|cannot|unable|no)\b[^,;.]*[,;]|\b(if|when)\b[^,;.]*?n't\b[^,;.]*[,;]/g, ' '),
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
    const birimler = [];
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
      for (const c of satir.split(/(?<=[.!?])\s+/)) if (c.trim() && !uyaran(c)) birimler.push(c);
    }
    const sorun = [];
    for (const k of EYLEM) {
      if (k.soru && !k.soru[dil].test(q)) continue;
      if (k.izin && k.izin[dil].test(q) && !(k.kisiYok && k.kisiYok.some((x) => kisi.has(x)))) continue;
      const bulunan = birimler.find((b) => k[dil].test(b) && !(k.sonraSerbest && SONRA[dil].test(b)) && !(k.haric && k.haric[dil].test(b)));
      if (bulunan) sorun.push(`eylem: ${k.ad}`);
    }
    return sorun;
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

  async function adaylar(soru, basliklar, dil = 'tr') {
    // sorunun içerik kelimeleri ve ikili kelime grupları da aranır; İlk yardım her soruda adaydır.
    // Tek kitapta (Türkçe Vikipedi) 05.11'deki sıranın aynısı — denklik sınavı bunu ölçer.
    const D = dilBilgi(dil);   // köprüde genel diller de (tr, en, cs için dilAl ile aynı)
    const kitaplar = dildekiler(await kitaplik(), D);
    if (!kitaplar.length) return [];
    const kelimeler = icerikKelimeleri(soru, D);
    const sorgular = [kelimeler.join(' ')];
    if (D.genel && BOSLUKSUZ.test(soru)) sorgular.push(...kelimeler);   // CJK: parçalar tek tek (birlikte arama boş dönüyor)
    else kelimeler.slice(0, 5).forEach((a, i) => kelimeler.slice(i + 1, 5).forEach((b) => sorgular.push(`${a} ${b}`)));
    const yollar = [];
    for (const b of basliklar) {
      for (const k of kitaplar) yollar.push(...await oneri(b, 2, k.ad));
      yollar.push(...await metinAra(b, 2, kitaplar));
    }
    for (let i = 0; i < sorgular.length; i++) yollar.push(...await metinAra(sorgular[i], i === 0 ? 5 : 2, kitaplar));
    for (const k of kitaplar) if (D.hepAday && k.seri.startsWith('wikipedia_')) yollar.push({ kitap: k.ad, yol: D.hepAday });
    // küçük kitap: her içerik kelimesi tek başına da aranır (en iyi 1 sonuç) — sona eklenir, büyük kitabın sırası değişmez
    const kucukler = kitaplar.filter((k) => k.makaleSayisi > 0 && k.makaleSayisi < AYAR.kucukKitap.sinir);
    if (kucukler.length && !(D.genel && BOSLUKSUZ.test(soru))) {
      for (const w of [...new Set(kelimeler)]) yollar.push(...await metinAra(w, 1, kucukler));
    }
    return tekille(yollar, 20);
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

  async function kaynakBul(soru, basliklar, dil = 'tr', gruplar = null, sorguMetni = soru) {
    // gruplar (dil köprüsü): [{ dil, soru, basliklar }] — her dil kendi kitaplarında kendi sorusuyla aranır.
    // Verilmezse tek grup: sorunun dili (ölçülmüş yol).
    const D = dilAl(dil);
    const ham = [];
    for (const g of gruplar || [{ dil, soru, basliklar }]) {
      const ek = g.dil !== dil ? { dil: g.dil } : {};
      for (const { kitap, yol } of await adaylar(g.soru, g.basliklar, g.dil)) {
        let m;
        try { m = await makale(yol, kitap); } catch (e) { continue; }
        for (const [bolum, metin] of m.paragraflar) ham.push({ ad: m.ad, bolum, metin, yol, kitap, kaynak: 'kiwix', ...ek });
      }
    }
    ham.push(...await benimParcalar(soru, D, dil));
    for (const g of gruplar || []) {   // köprü: kullanıcının başka dildeki dosyaları, o dile çevrilmiş soruyla
      if (g.dil !== dil) ham.push(...(await benimParcalar(g.soru, dilBilgi(g.dil), g.dil)).map((p) => ({ ...p, dil: g.dil })));
    }
    if (!ham.length) return [];
    const belgeler = ham.map(({ ad, bolum, metin }) => kes(`title: ${ad}${bolum ? ' — ' + bolum : ''} | text: ${kes(metin, 600)}`, 2000));
    // sorguMetni bir dizi olabilir (09.11, §86: özgün soru + çevirisi) — puan, sorguların benzerliklerinin ortalaması
    const sorgular = Array.isArray(sorguMetni) ? sorguMetni : [sorguMetni];
    const vek = await gom([...sorgular.map((q) => `task: search result | query: ${q}`), ...belgeler]);
    const sorguV = vek.slice(0, sorgular.length), vektorler = vek.slice(sorgular.length);
    const puanli = vektorler.map((v, i) => [sorguV.reduce((top, s) => top + v.reduce((t, x, j) => t + x * s[j], 0), 0) / sorguV.length, ham[i]])
      .sort((a, b) => b[0] - a[0]);
    if (AYAR.aramaGozlem) AYAR.aramaGozlem({ soru, dil, sorguMetni, puanli });   // yalnız ölçüm (olcum/kopru/arama_olc.cjs)
    const secilen = [], sayac = {}, gorulenMetin = new Set();
    // konu makalesi: en iyi paragrafın makalesi; küçük kitaptaysa ondan AYAR.kucukKitap.konu paragraf gelebilir
    const kucukKitap = new Set((await kitaplik()).filter((k) => k.makaleSayisi > 0 && k.makaleSayisi < AYAR.kucukKitap.sinir).map((k) => k.ad));
    const konu = puanli.length && puanli[0][1].kaynak === 'kiwix' && kucukKitap.has(puanli[0][1].kitap)
      ? puanli[0][1].kitap + '|' + puanli[0][1].ad : null;
    for (const [puan, p] of puanli) {
      // 06.11: aynı paragraf iki kitapta (ya da iki kez) varsa bir kez gelir — §27 "Bowline ×2", §31 "Ankara ×3"
      const metinAnahtari = p.metin.replace(/\s+/g, ' ').slice(0, 300);
      if (gorulenMetin.has(metinAnahtari)) continue;
      gorulenMetin.add(metinAnahtari);
      const anahtar = p.kitap + '|' + p.ad;
      if ((sayac[anahtar] || 0) < (anahtar === konu ? AYAR.kucukKitap.konu : MAKALE_BASINA)) {
        sayac[anahtar] = (sayac[anahtar] || 0) + 1;
        secilen.push({ makale: p.ad, bolum: p.bolum, metin: kes(p.metin, PARCA_UZUNLUK), puan: Math.round(puan * 1000) / 1000,
          yol: p.yol, kitap: p.kitap, kaynak: p.kaynak, tur: p.tur, ...(p.dil ? { dil: p.dil } : {}) });
      }
      if (secilen.length === PARCA_SAYISI) break;
    }
    return secilen;
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
  const katla = (w) => w.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i');
  function ozelAdlar(soru) {
    // büyük harfle başlayan kelimeler; ilk kelime yalnız kesme işaretiyle ek almışsa ("Prag'da"). Çince vb. yok.
    const kelimeler = soru.split(/\s+/).filter(Boolean);
    const adlar = [];
    kelimeler.forEach((k, i) => {
      const yalin = k.replace(/^[^\p{L}]+/u, '');
      const kesme = /^\p{Lu}\p{L}+['’]/u.test(yalin);
      const kok = yalin.split(/['’]/)[0].replace(/[^\p{L}]+$/u, '');
      if (!/^\p{Lu}/u.test(kok) || kok.length < 3 || kok === kok.toUpperCase()) return;
      if (i === 0 && !kesme) return;
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

  async function koprulu(soru, D, dil, diller, bildir) {
    // her kaynak dili için: soru o dile çevrilir, başlıklar o dilde önerilir (dil köprüsü, K17)
    const gruplar = [];
    for (const kd of diller) {
      if (kd === dil) {
        gruplar.push({ dil, soru, basliklar: basliklariAyikla(await sohbet(D.baslik, soru, 60)) });
      } else {
        const ceviri = ceviriAyikla(AYAR.cevirmen && DIL_ADI[kd] && DIL_ADI[dil]
          ? await cevir(soru, dil, kd, 80)
          : await sohbet(CEVIR[kd] || CEVIR.en, soru, 80)) || soru;
        gruplar.push({ dil: kd, soru: ceviri, basliklar: basliklariAyikla(await sohbet(dilBilgi(kd).baslik, ceviri, 60)) });
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

  async function sor(soru, bildir = () => {}, dil = 'tr', secenek = {}) {
    if (secenek.yedekDiller) {
      // önce kendi dilinde (ölçülmüş yol); kaynaklarda yoksa köprüden öbür dillere (K17).
      // yedekDiller: 'hepsi' → bellekte ne varsa (Ercan 06.11: "geri kalan kütüphane kullanıcı tercihi")
      const { yedekDiller, ...geri } = secenek;
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
      basliklar = basliklariAyikla(await sohbet(D.baslik, soru, 60));
      bildir('kaynak', basliklar);
      parcalar = await kaynakBul(soru, basliklar, dil);
    } else {
      gruplar = await koprulu(soru, D, dil, diller, bildir);
      basliklar = gruplar.flatMap((g) => g.basliklar);
      // anlam sıralamasının sorgusu — varsayılan özgün soru (ölçülmüş yol). 09.11 (§86) seçenek 'ikisi': özgün soru + birinci
      // kaynak dilindeki çevirisi birlikte (puan ortalaması); tanıda (F, IFRC) kaynak cümlesi 48 → 58/75. Küçük kitap
      // aramasıyla birlikte ölçüldü, geçen kötü cevap arttı → varsayılan değil (bkz. AYAR.kucukKitap). secenek.sorgu: 'ceviri' · 'ikisi'
      const ceviri = (gruplar.find((g) => g.dil !== dil) || gruplar[0]).soru;
      const sorguMetni = secenek.sorgu === 'ceviri' ? ceviri : secenek.sorgu === 'ikisi' ? [soru, ceviri] : soru;
      parcalar = await kaynakBul(soru, basliklar, dil, gruplar, sorguMetni);
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
    bildir('cevap', parcalar);
    // kaynakların hepsi başka dildeyse: tek dilse o dilde, birkaç dilse İngilizce ara dilde yazılır (06.11: Hintçe soruya
    // Türkçe + Çekçe kaynak gelince eski yola düşüp Türkçe cevap verdi)
    const yabanciDiller = new Set(parcalar.map((p) => p.dil));
    const kd = yabanciDiller.size === 1 ? parcalar[0].dil : 'en';
    if (secenek.cevap === 'cevirerek' && AYAR.cevirmen && parcalar.every((p) => p.dil && p.dil !== dil)) {
      // Çevirmen yarışının kazanan yolu (06.11): cevap önce kaynağın dilinde yazılır, TranslateGemma kullanıcının
      // diline çevirir. Doğrudan Türkçe yazınca model "do not cut" → "kesin" yaptı; bu yolda olumsuzluk korundu.
      const KD = dilBilgi(kd);
      const g = gruplar.find((x) => x.dil === kd) || { soru: kd === dil ? soru : await cevir(soru, dil, kd, 120) };
      const ham = await sohbet(KD.sistem, `${KD.kaynaklar}:\n${kaynakMetni(parcalar, kd)}\n\n${KD.soru}: ${g.soru}`);
      const sure = () => ({ arama_sn: Math.round(aramaSn * 10) / 10, toplam_sn: Math.round((Date.now() - t0) / 100) / 10 });
      const ya = yokAyikla(ham, KD.yok);
      const ozgun = ya.metin;
      if (ya.yok) {
        return { soru, dil, basliklar, parcalar, cevap: D.yok, eksik: [], durdur: false, bilgiYok: true, kitapVar, gruplar,
          ozgun: { dil: kd, cevap: ozgun }, ...sure() };
      }
      const cevap = kd === dil ? ozgun : await cevir(ozgun, kd, dil);
      // denetimler: özgün cevap kaynağa karşı (sayı + bağlam, aynı dil), çeviri özgün cevaba karşı (sayı + olumsuzluk),
      // çeviri soruya karşı (terim). Bağlamda soru, kaynağın kendi dilindeki çevirisiyle okunur (yer adları için).
      const sorular = { [dil]: soru, [kd]: g.soru };
      for (const x of gruplar || []) sorular[x.dil] = x.soru;
      const denetim = { ozgun: [...denetle(parcalar, ozgun, kd), ...baglamDenetle(g.soru, ozgun, kd, parcalar, sorular), ...aktarmaDenetle(ozgun, parcalar, kd)],
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
      const eksik = [...new Set([...denetim.eylem, ...denetim.ozgun, ...denetim.ceviri, ...denetim.terim, ...denetim.yazi, ...denetim.kip, ...denetim.olumsuzluk, ...denetim.gidisDonus])];
      denetim.ikinciGoz = eksik.length ? [] : await ikinciGoz(soru, cevap);   // Ö22: durmuş cevaba sorulmaz
      eksik.push(...denetim.ikinciGoz);
      return { soru, dil, basliklar, parcalar, cevap, eksik, durdur: eksik.length > 0, bilgiYok: false, kitapVar, gruplar,
        ozgun: { dil: kd, cevap: ozgun, guvenli: denetim.ozgun.length === 0 && !denetim.ikinciGoz.length && !denetim.eylem.length }, denetim, ...sure() };
    }
    const yabanci = parcalar.some((p) => p.dil && p.dil !== dil);
    const sistem = yabanci ? `${D.sistem}\n${KOPRU[dil] || KOPRU.en.replace('in English', 'in ' + (DIL_ADI[dil] || dil))}` : D.sistem;
    const ya = yokAyikla(await sohbet(sistem, `${D.kaynaklar}:\n${kaynakMetni(parcalar, dil)}\n\n${D.soru}: ${soru}`), D.yok);
    const cevap = ya.metin;
    const sorular = { [dil]: soru };
    for (const x of gruplar || []) sorular[x.dil] = x.soru;
    const eksik = [...(ya.yok ? [] : [...eylemDenetle(soru, cevap, dil), ...yaziDenetle(cevap, dil)]), ...denetle(parcalar, cevap, dil), ...baglamDenetle(soru, cevap, dil, parcalar, sorular)];   // Ö25 eylem · Ö27 yazı
    if (!ya.yok && !eksik.length) eksik.push(...await ikinciGoz(soru, cevap));   // Ö22
    return { soru, dil, basliklar, parcalar, cevap, eksik, durdur: eksik.length > 0, bilgiYok: ya.yok,
      kitapVar, arama_sn: Math.round(aramaSn * 10) / 10, toplam_sn: Math.round((Date.now() - t0) / 100) / 10,
      ...(gruplar ? { gruplar } : {}) };
  }

  const Heybe = { AYAR, DIL, sor, kaynakBul, adaylar, kitaplik, makale, paragraflar, denetle, olcuyle, OLCU,
    basliklariAyikla, kaynakMetni, cevir, translateGemmaIstemi, olcuAl, dilBilgi, KISA, UC, DIL_ADI, mevcutDiller, bellektekiDiller,
    olumsuzlukKarsilastir, olumsuzlukDenetle, baglamDenetle, ozelAdlar, kisiler, cevapSatirlari, OLUMSUZ_SAY, konuKelimeleri,
    gidisDonus, yonKarsilastir, yokAyikla, ikinciGoz, IKINCI_GOZ, eylemDenetle, EYLEM, kes, yaziDenetle, BETIK, kipDenetle, KIP, aktarmaDenetle, kaynakBirimleri, AKTARMA_ESIK, dusenKelime };
  if (typeof module !== 'undefined' && module.exports) module.exports = Heybe;
  kok.Heybe = Heybe;
})(typeof globalThis !== 'undefined' ? globalThis : this);
