# CLE Heybe

**An offline knowledge bag** · *İnternetsiz bilgi heybesi* — [Türkçe aşağıda](#turkce)

### ⬇️ [Download Heybe — latest version](https://github.com/esdesen-star/CLE-Heybe/releases/latest) · [Heybe'yi indir — son sürüm](https://github.com/esdesen-star/CLE-Heybe/releases/latest)

*Ready to use, no programming: download, unzip, double-click. Steps: [Download and install](#download-and-install) · Adımlar: [İndir ve kur](#turkce)*

Heybe ("saddlebag" in Turkish) is a knowledge system that fits on a USB stick and works without internet or mains power. **You choose what goes into its library:** books, guides, PDF and text files. A small AI runs on the computer's own processor and answers **by reading that library, not from its own memory**. It shows the source of every answer and says "I don't know" when the library doesn't say. In our tests we use open-licensed Kiwix books (Wikipedia, a medical encyclopedia, outdoor and disaster guides) — only as examples.

Heybe is a multilingual translator: it reads whichever language has the richest free sources and translates the answer into the asker's language at question time. Books are not pre-translated. The interface speaks 49 languages.

Free of charge. **CLE — Can · LM · Ercan.**

> ⚠️ Heybe is not medical advice. In an emergency, call your local emergency number. This is a test release (0.17).

## Download and install

No programming needed. You need internet once, for the first setup; after that Heybe works offline.

1. **Download** `CLE-Heybe-0.17.0.zip` (about 325 MB) from the [latest release](https://github.com/esdesen-star/CLE-Heybe/releases/latest).
   - *Windows:* before unzipping, right-click the zip → **Properties** → tick **Unblock** → OK.
2. **Unzip it.** You get a folder named `CLE-Heybe`. Copy that folder to a USB stick (16 GB or more is comfortable; exFAT format) — or simply keep it on your computer.
3. **Start Heybe** from inside the folder:
   - **Mac:** double-click `Heybe_Mac.command`. The first time, macOS blocks it: open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. (Older macOS: right-click the file → Open.)
   - **Windows 10/11:** double-click `Heybe_Windows.bat`. If Windows warns you: **More info → Run anyway**.
   - **Linux** (x86_64, or 64-bit ARM such as Raspberry Pi 4/5): open a terminal in the folder and type `sh Heybe_Linux.sh`.
4. A page opens in your browser. The first time it says the models are not installed: open **Library & settings → First setup**, read and accept the Gemma terms, and click **Download the models** (about 5 GB). If the download is cut, click again — it continues where it stopped. When it finishes, Heybe starts by itself.
5. On the same page, add books: a ready-made list (for example *First aid and survival*, about 1.2 GB) or your own PDF and text files.
6. Done. From now on Heybe works without internet. To close it, press Enter (Mac, Linux) or any key (Windows) in its window.

**Space and memory:** core 0.5 GB + models 5 GB + your books. About 8 GB of RAM is recommended (estimate, not measured yet). Windows, Intel Mac and Linux are **not tested yet** — please tell us how it went in an issue.

## Runs on

| System | Launcher | Status |
|---|---|---|
| Mac (Apple chip) | `Heybe_Mac.command` — double-click | tested |
| Mac (Intel chip) | `Heybe_Mac.command` — double-click | ready, **not tested yet** |
| Windows 10/11, 64-bit | `Heybe_Windows.bat` — double-click | ready, **not tested yet** |
| Linux x86_64 and 64-bit ARM (such as Raspberry Pi 4/5) | `sh Heybe_Linux.sh` in a terminal | ready, **not tested yet** |

If you try one, please report it in an issue — that is the help we need most. For Android and phones, see the roadmap (item 9).

## How it works

- **It reads from sources.** When a question comes in, the library is searched, the best paragraphs are chosen and only those are given to the model. The model is bound not to add its own knowledge.
- **Checkers stop the answer.** Before an answer is shown, it passes checkers that never add information:
  - **numbers:** every number and unit in the answer appears in the source exactly;
  - **context:** the number does not belong to another person (baby ↔ adult), another place or another drug;
  - **negation and direction:** translation did not turn "don't" into "do" or "lukewarm" into "hot" (round-trip translation);
  - **second look:** the answer belongs to the situation that was asked about;
  - **actions:** a dangerous suggestion — tourniquet, abdominal thrusts, inducing vomiting — is only allowed when the question's situation allows it;
  - **weak pool:** if even the best paragraph is far from the question, no answer is written.

  If a checker trips, the answer is not shown; the user reads the sources instead.
- **The library belongs to the user.** The package carries only the core (programs, page); models are downloaded at first setup. Books come from ready-made lists or links the user chooses; the user can also add their own files (PDF, text).
- **Personal data stays on the stick.** "This answer is wrong" reports and the emergency card stay on the stick and are never sent anywhere.

## Offline map and directions *(new in 0.15–0.17)*

- **Map and directions without internet.** A map page shows OpenStreetMap and finds walking or driving routes (one-way streets, ferries) with turn-by-turn directions, plus "nearest hospital, assembly point, pharmacy, drinking water, shelter, aid distribution". **The route is computed by an algorithm on real map data, never guessed by the AI.** The map's date and the warning *"collapsed buildings and closed roads after a disaster are not on this map"* are always shown. Everything is served from the stick — no request leaves the computer.
- **Download any region.** Country, region or the whole world (overview 560 MB · full detail about 139 GB, without directions). Heybe shows the sizes and the memory needed first, downloads only after you confirm, and continues where it left off. Map tiles are cut from the [Protomaps](https://protomaps.com) world map (our own Go code, checked tile by tile against Protomaps' tool: 15,211 of 15,211 identical); road data comes from [Geofabrik](https://download.geofabrik.de) extracts (checksum verified); directions are prepared on your own computer (Turkey: 46 s, about 3 GB of memory).
- **The organisation's own points.** Civil protection, municipalities and aid organisations can add their lists of assembly points, drinking water, shelters… as **Excel, CSV, KML or GeoJSON**, from a file or a link. Every point shows the name of its list. Why: in our test the assembly points of Hatay — the province hit hardest by the 2023 earthquake — were missing from OpenStreetMap, and "nearest assembly point" pointed 181 km away. Now Heybe says "not found within reach" instead, and anyone can mark their own point (for example the assembly area they learned from the authorities).

**Components:** a small helper program written in Go (`tasinabilir/yardimci/`) · the [Kiwix](https://kiwix.org) book server · three models run with [llamafile](https://github.com/Mozilla-Ocho/llamafile) (chat: Gemma 3 4B · semantic search: EmbeddingGemma · translation: TranslateGemma) · a page and a "companion" that run in the browser (`tasinabilir/usb_kok/heybe/`) · the map page with [MapLibre GL JS](https://maplibre.org), PMTiles and Protomaps basemaps, bundled (`heybe/harita.html`, `heybe/harita_kit/`).

## Model-free test suite

```
sh olcum/modelsiz.sh
```

Needs Go, Node and Python 3; no models or books. It runs on every contribution (`.github/workflows/`). It checks: the helper program's tests, the page build, the syntax of every script and launcher, **the checkers' teeth** (each checker is fed deliberately broken examples; if it misses them, the suite fails), a **mutation pass** (the checker's rules are blinded one by one; if the tests don't notice, the suite fails), alphabet mix-ups in interface translations, and the exam bank.

## Open scorecard

For every release: the wrong and dangerous answers Heybe gave **without stopping** on that release's exam. An answer that stopped and showed its sources does not count as "passed". Unseen sets were written before measuring; the last two were written by a separate author who never saw the code and kept them deliberately hard.

| Release | 30 unseen questions | Correct | Stopped | Wrong but passed | Dangerous but passed |
|---|---|---|---|---|---|
| 0.9.0 | Y | 12 | 1 | 6 | 1 (adult Heimlich for a choking baby) |
| 0.10.0 | Z | 10 | 12 | 3 | 0 |
| 0.11.0 | X (separate author, near-situation traps) | 5 | 13 | 3 | 1 (heatstroke's "give water" for a stroke question — closed in 0.11.1) |
| 0.12.0 | W (separate author, "what should I do" traps) | 3 | 18 | 5 | 0 |

The sets differ, so rows compare only roughly. Exam questions and graded notes with reasons are in `olcum/banka/`.

## Roadmap — for developers

Where the measurements say work is needed:

1. **Language-blind search.** Today Heybe first looks in books in the question's language and only moves to other languages when that attempt fails. All books should compete in one pool. Some of the remaining wrong answers come from this: the answer was in an English book that was never looked at.
2. **Answers that match the topic but not the question.** "Where should I not pitch a tent?" gets an answer about storing a first-aid kit. The small model, acting as judge, mostly cannot see these.
3. **Dropping the source's warning.** The source says "ventilate now and then — carbon monoxide"; the answer leaves the warning out. Candidate: a "is the source's warning in the answer?" checker.
4. **Myth lists.** Some sources list "myths" point by point; the model can mistake a myth for advice ("don't touch someone struck by lightning").
5. **False alarms of the negation checker.** In some languages verbs of avoidance ("avoid" ↔ Czech "vyhněte se") are not counted, so correct translations get stopped too.
6. **Install script; real tests on Windows, Intel Mac and Linux.** A single script that downloads the models and tools and sets up the stick for someone coming from GitHub. The Linux launcher first copies the programs to the computer (a plugged-in stick often has no permission to run programs); this needs testing on real distributions and on a Raspberry Pi.
7. **Personal health data** (optional): only on the stick and encrypted, offline two-step verification, a way back for someone who forgets. The sources propose a medicine; Heybe filters by the person's data and warns (e.g. penicillin allergy). Basic stockpile suggestions and expiry tracking.
8. **Siblings: Heybe by the machine's strength.** Today Heybe opens three models and needs a few GB of memory. For weak machines: a **light sibling** with one small model, and a **reading mode** that opens no model at all (search, read, emergency card). Heybe checks the machine at start and chooses; the user can change it. Candidate models face the same exam: correct, stopped, wrong and dangerous passed, time, memory. Pass condition: zero dangerous answers passed.
9. **Android and use over a network.** The no-install way: Heybe runs on one computer, and phones or TV boxes on the same Wi-Fi connect with their browser. The phone runs no model; one laptop is enough for a whole tent. A "share on network" switch comes off by default; personal records are not shared. Later: Heybe's own Android app.
10. **Voice and blind users.** A screen-reader friendly page (the answer is read out when it arrives, every button reachable by keyboard) · offline "read aloud" with the computer's own voices (macOS has voices for 38 of the 49 languages) · an offline speech engine for languages without a voice · asking by voice (offline speech recognition). The goal: Heybe used not only with the eyes but with the ears too.
11. **Maps.** Lower memory for preparing directions in large countries (Norway needs ~7 GB today) · cutting a region by its real border instead of a box · turn restrictions · the map page in all 49 languages · asking for a route in the chat ("how do I get to the hospital" — the algorithm computes, the model only describes).

## Contributing

Every roadmap item is an issue. Pick one and say in it what you will do. Measure first, then change; `sh olcum/modelsiz.sh` must pass on every contribution. A change that loosens a checker is not accepted without a measurement on the exam bank. Interface translations, book lists and exam questions in new languages are contributions too.

**Things to watch:**
- Don't change without measuring. A change is measured first on recorded, graded answers, then on **unseen** questions — written not by whoever made the change but by someone who has not seen the code.
- A checker adds no information; it only stops. A new checker comes with toothed examples and a mutation pass.
- Text sent to a server is cut with `kes()` (a plain `slice` that ends in the middle of an emoji makes the request fail).
- Heybe is not a medical authority, and neither are the "expected" answers in the exam notes.

## Notes in the code

Code comments carry dates, short quotes and references like "Özet §46". They show where a decision came from; the quotes are design requests from our partner Ercan. "Özet §" references point to our private development notebook, which is not in the repository. Most comments are in Turkish.

## License

Code: Apache 2.0 (`LICENSE`). Books and models keep their own licenses (`tasinabilir/usb_kok/LISANSLAR`); Heybe does not distribute them, the user downloads them.

Organisations, associations and volunteers may set Heybe up on their own USB drives and hand them out for free; the code is open-licensed. Respecting the book and model licenses is enough.

---

<a name="turkce"></a>
# Türkçe

**İnternetsiz bilgi heybesi** · *An offline knowledge bag*

### ⬇️ [Heybe'yi indir — son sürüm](https://github.com/esdesen-star/CLE-Heybe/releases/latest)

Heybe, bir USB belleğe sığan, internet ve şebeke olmadan çalışan bir bilgi sistemidir. **Kitaplığına ne yükleneceğini sen seçersin:** kitap, rehber, PDF ve metin dosyaları. Bilgisayarın kendi işlemcisinde çalışan küçük bir yapay zekâ, **kendi hafızasından değil, o kitaplıktan okuyarak** cevap verir. Her cevabın kaynağını gösterir. Kaynaklarda yoksa "bilmiyorum" der. Denemelerimizde açık lisanslı Kiwix kitapları (Vikipedi, tıp ansiklopedisi, doğa ve afet rehberleri) kullanıyoruz — yalnız örnek olarak.

Heybe çok dilli bir tercümandır: kitap hangi dilde en zengin ve ücretsizse o kullanılır, cevap soruyu soranın diline soru anında çevrilir. Kitaplar baştan çevrilmez. Ekran 49 dilde.

Ücretsizdir. **CLE — Can · LM · Ercan.**

> ⚠️ Heybe tıbbi tavsiye yerine geçmez. Acil durumda bulunduğun yerin acil numarasını ara. Heybe bir deneme sürümüdür (0.17).

## İndir ve kur

Programcılık gerekmez. İnternet yalnız ilk kurulumda bir kez gerekir; sonra Heybe internetsiz çalışır.

1. **İndir:** [son sürümden](https://github.com/esdesen-star/CLE-Heybe/releases/latest) `CLE-Heybe-0.17.0.zip` dosyasını (yaklaşık 325 MB).
   - *Windows:* açmadan önce zip dosyasına sağ tıkla → **Özellikler** → **Engellemeyi kaldır**'ı işaretle → Tamam.
2. **Aç:** `CLE-Heybe` adlı bir klasör çıkar. Bu klasörü bir USB belleğe kopyala (16 GB ve üstü rahat eder; exFAT biçimi) — ya da bilgisayarında bırak.
3. **Heybe'yi başlat** (klasörün içinden):
   - **Mac:** `Heybe_Mac.command` dosyasına çift tıkla. İlk seferde macOS engeller: **Sistem Ayarları → Gizlilik ve Güvenlik**'i aç, aşağı in ve **Yine de Aç**'a bas. (Eski macOS: dosyaya sağ tıkla → Aç.)
   - **Windows 10/11:** `Heybe_Windows.bat` dosyasına çift tıkla. Windows uyarırsa: **Ek bilgi → Yine de çalıştır**.
   - **Linux** (x86_64 ya da Raspberry Pi 4/5 gibi 64 bit ARM): klasörde bir terminal aç ve `sh Heybe_Linux.sh` yaz.
4. Tarayıcıda bir sayfa açılır. İlk seferde modellerin kurulmadığını söyler: **Kitaplık ve ayarlar → İlk kurulum**'u aç, Gemma koşullarını okuyup kabul et ve **Modelleri indir**'e bas (yaklaşık 5 GB). İndirme kesilirse yeniden bas — kaldığı yerden sürer. Bitince Heybe kendiliğinden açılır.
5. Aynı sayfada kitap ekle: hazır bir liste (örneğin *İlk yardım ve hayatta kalma*, yaklaşık 1,2 GB) ya da kendi PDF ve metin dosyaların.
6. Bitti. Bundan sonra Heybe internetsiz çalışır. Kapatmak için penceresinde Enter'a (Mac, Linux) ya da bir tuşa (Windows) bas.

**Yer ve bellek:** çekirdek 0,5 GB + modeller 5 GB + kitapların. Yaklaşık 8 GB RAM önerilir (tahmin, henüz ölçülmedi). Windows, Intel Mac ve Linux **henüz denenmedi** — nasıl gittiğini bir iş kartına yaz.

## Çalıştığı sistemler

| Sistem | Başlatıcı | Durum |
|---|---|---|
| Mac (Apple işlemci) | `Heybe_Mac.command` — çift tıkla | sınandı |
| Mac (Intel işlemci) | `Heybe_Mac.command` — çift tıkla | hazır, **denenmedi** |
| Windows 10/11, 64 bit | `Heybe_Windows.bat` — çift tıkla | hazır, **denenmedi** |
| Linux x86_64 ve 64 bit ARM (Raspberry Pi 4/5 gibi) | terminalde `sh Heybe_Linux.sh` | hazır, **denenmedi** |

Denediysen sonucu bir iş kartına yaz — en çok buna ihtiyacımız var. Android ve telefon için yol haritasına bak (madde 9).

## Nasıl çalışır

- **Kaynaktan okur.** Soru geldiğinde kitaplıkta aranır, en uygun paragraflar seçilir ve modele yalnız bunlar verilir. Model kendi bilgisini eklememekle yükümlüdür.
- **Bekçiler cevabı durdurur.** Cevap gösterilmeden önce bilgi eklemeyen denetçilerden geçer:
  - **sayı:** cevaptaki her sayı ve birim kaynakta aynen geçiyor mu;
  - **bağlam:** sayı başka bir kişiye (bebek ↔ yetişkin), başka bir yere ya da başka bir ilaca mı ait;
  - **olumsuzluk ve yön:** çeviri "yapmayın"ı "yapın"a, "ılık"ı "sıcak"a çevirmiş mi (gidiş-dönüş çevirisiyle);
  - **ikinci göz:** cevap sorulan duruma mı ait;
  - **eylem:** turnike, karın basısı, kusturmak gibi tehlikeli bir öneri sorunun durumunda serbest mi;
  - **zayıf havuz:** en iyi paragraf bile soruya çok uzaksa cevap yazılmaz.

  Bekçi takılırsa cevap gösterilmez; kullanıcı kaynakları kendisi okur.
- **Kitaplık kullanıcınındır.** Pakette yalnız çekirdek (program, sayfa) gelir; modeller ilk kurulumda iner. Kitapları kullanıcı hazır listelerden ya da kendi seçtiği bağlantılardan indirir. Kendi dosyalarını (PDF, metin) da ekleyebilir.
- **Kişisel veri bellekte kalır.** "Bu cevap yanlış" kayıtları ve acil kart yalnız bellekte durur, hiçbir yere gönderilmez.

## İnternetsiz harita ve yol tarifi *(0.15–0.17'de yeni)*

- **İnternetsiz harita ve yol tarifi.** Harita sayfası OpenStreetMap haritasını gösterir; yürüyerek ya da araçla rota bulur (tek yön, vapur) ve adım adım tarif verir; "en yakın hastane, toplanma alanı, eczane, içme suyu, barınak, yardım dağıtımı". **Rotayı gerçek harita verisi üzerinde bir algoritma hesaplar; yapay zekâ rota uydurmaz.** Haritanın tarihi ve *"afetten sonra yıkılan bina, kapanan yol haritada görünmez"* uyarısı her zaman görünür. Her şey bellekten gelir — bilgisayardan dışarı istek çıkmaz.
- **İstediğin bölgeyi indir.** Ülke, bölge ya da bütün dünya (genel görünüm 560 MB · tam ayrıntı yaklaşık 139 GB, yol tarifi olmadan). Heybe önce boyutu ve gereken belleği söyler, onaylayınca indirir, yarıda kalırsa kaldığı yerden sürer. Harita görüntüsü [Protomaps](https://protomaps.com) dünya haritasından kesilir (kendi Go kodumuz; Protomaps'in aracıyla döşeme döşeme karşılaştırıldı: 15.211'in 15.211'i aynı); yol verisi [Geofabrik](https://download.geofabrik.de) özetlerinden (sağlaması denetlenir); yol tarifi kendi bilgisayarında hazırlanır (Türkiye: 46 sn, yaklaşık 3 GB bellek).
- **Kurumun kendi noktaları.** AFAD, belediyeler ve yardım kuruluşları toplanma alanı, içme suyu, barınak listelerini **Excel, CSV, KML ya da GeoJSON** olarak, dosyadan ya da bağlantıdan ekleyebilir. Her nokta listesinin adıyla görünür. Neden: denememizde 2023 depreminin en çok vurduğu Hatay'ın toplanma alanları OpenStreetMap'te yoktu ve "en yakın toplanma alanı" 181 km öteyi gösterdi. Artık Heybe "yürünebilir uzaklıkta bulunamadı" der; herkes kendi noktasını da işaretleyebilir (örneğin yetkililerden öğrendiği toplanma alanını).

**Bileşenler:** Go ile yazılmış küçük bir yardımcı program (`tasinabilir/yardimci/`) · [Kiwix](https://kiwix.org) kitap sunucusu · [llamafile](https://github.com/Mozilla-Ocho/llamafile) ile üç model (sohbet: Gemma 3 4B · anlam araması: EmbeddingGemma · çeviri: TranslateGemma) · tarayıcıda çalışan sayfa ve "arkadaş" (`tasinabilir/usb_kok/heybe/`) · harita sayfası: [MapLibre GL JS](https://maplibre.org), PMTiles ve Protomaps temel haritası, pakette (`heybe/harita.html`, `heybe/harita_kit/`).

## Modelsiz sınav

```
sh olcum/modelsiz.sh
```

Go, Node ve Python 3 ister; model ya da kitap gerekmez. Her katkıda çalışır (`.github/workflows/`). Şunlara bakar: yardımcı programın testleri, sayfanın derlenmesi, bütün betiklerin ve başlatıcıların sözdizimi, **bekçilerin dişleri** (her bekçiye bilerek bozulmuş örnekler verilir; yakalamazsa sınav düşer) ve **bozma denemesi** (bekçinin kuralları tek tek körleştirilir; testler bunu fark etmezse sınav düşer), ekran çevirilerinde alfabe karışması, sınav bankası.

## Açık karne

Her sürümde, o sürümün sınavında Heybe'nin **durdurmadan verdiği** yanlış ve tehlikeli cevaplar. Durup kaynak gösteren cevap "geçen" sayılmaz. Görülmemiş setler ölçümden önce yazıldı; son ikisini kodu hiç görmeyen ayrı bir yazar yazdı ve bilerek zor tuttu.

| Sürüm | Görülmemiş 30 soru | Doğru | Durdu | Yanlış ama geçen | Tehlikeli ama geçen |
|---|---|---|---|---|---|
| 0.9.0 | Y | 12 | 1 | 6 | 1 (boğulan bebeğe yetişkin Heimlich'i) |
| 0.10.0 | Z | 10 | 12 | 3 | 0 |
| 0.11.0 | X (başka yazar, yakın durum tuzakları) | 5 | 13 | 3 | 1 (inme sorusuna sıcak çarpmasının "su verin"i — 0.11.1'de kapandı) |
| 0.12.0 | W (başka yazar, "ne yapmalı" tuzakları) | 3 | 18 | 5 | 0 |

Setler birbirinden farklı olduğu için satırlar yaklaşık karşılaştırılır. Sınav soruları ve gerekçeli notlar `olcum/banka/` içinde.

## Yol haritası — geliştiriciler için

Ölçümlerin gösterdiği, yoğunlaşılması gereken yerler:

1. **Dil körü arama.** Bugün Heybe önce sorunun dilindeki kitaplara bakıyor; öbür dillere yalnız o deneme düşünce geçiyor. Bütün kitaplar tek havuzda yarışmalı. Kalan yanlışların bir kısmı bu yüzden: cevap İngilizce kitapta vardı, bakılmadı.
2. **Konusu tutan ama soruyu cevaplamayan cevaplar.** "Çadırı nereye kurmamalı?" sorusuna ilk yardım çantasının saklanması anlatılıyor. Küçük model hakem olarak bunları çoğunlukla göremiyor.
3. **Kaynaktaki uyarıyı atlamak.** Kaynak "ara ara havalandır, karbonmonoksit" diyor, cevap bu uyarıyı taşımıyor. "Kaynağın uyarısı cevapta var mı" bekçisi adayı.
4. **Yanlış inanış listeleri.** Bazı kaynaklar "yanlış inanışları" madde madde sayıyor; model efsaneyi öğüt sanabiliyor ("yıldırım çarpana dokunmayın").
5. **Olumsuzluk bekçisinin boş alarmları.** Bazı dillerde kaçınma fiilleri ("avoid" ↔ Çekçe "vyhněte se") sayılmıyor; doğru çeviriler de duruyor.
6. **Kurulum betiği; Windows, Intel Mac ve Linux'ta gerçek deneme.** GitHub'dan gelen biri için modelleri ve araçları indirip belleği kuran tek betik. Linux başlatıcısı programları önce bilgisayara kopyalar (takılı bellek çoğu zaman program çalıştırma izni vermez); bunun gerçek dağıtımlarda ve Raspberry Pi'de sınanması gerekiyor.
7. **Kişisel sağlık bilgisi** (isteğe bağlı): yalnız bellekte ve şifreli, çevrim dışı iki adımlı doğrulama, unutana çıkış yolu. İlacı kaynak önerir; Heybe kişinin bilgisine göre eler ve uyarır (ör. penisilin alerjisi). Temel stok önerisi ve son kullanma takibi.
8. **Kardeşler: bilgisayarın gücüne göre Heybe.** Bugün Heybe üç model açıyor ve birkaç GB bellek istiyor. Zayıf makine için tek küçük modelle çalışan **hafif kardeş**, hiç model açmayan **okuma kipi** (arar, okutur, acil kart). Heybe açılışta bilgisayarın gücüne bakıp seçer; kullanıcı değiştirebilir. Aday modeller aynı sınavla ölçülür: doğru, durdu, geçen yanlış ve tehlikeli, süre, bellek. Geçme şartı: tehlikeli ama geçen sıfır.
9. **Android ve ağdan kullanım.** Kurulumsuz yol: Heybe bir bilgisayarda açıktır, telefon ya da TV kutusu aynı Wi-Fi'dan tarayıcıyla bağlanır. Telefon model çalıştırmaz; bir dizüstü bütün bir çadıra yeter. "Ağda paylaş" anahtarı kapalı gelir, kişisel kayıtlar paylaşılmaz. Sonra Heybe'nin kendi Android uygulaması.
10. **Ses ve görme engelliler.** Ekran okuyucuya uygun sayfa (cevap gelince okunsun, her düğmeye klavyeyle ulaşılsın) · bilgisayarın kendi sesiyle internetsiz "Sesli oku" (macOS'ta 49 dilin 38'inde ses var) · sesi olmayan diller için çevrim dışı ses motoru · sesle soru sormak (çevrim dışı konuşma tanıma). Amaç: Heybe yalnız gözle değil, kulakla da kullanılsın.
11. **Harita.** Büyük ülkelerde yol tarifi hazırlığının belleğini düşürmek (Norveç bugün ~7 GB istiyor) · bölgeyi kutu yerine gerçek sınırıyla kesmek · dönüş yasakları · harita sayfasını 49 dile çevirmek · rotayı sohbetten sormak ("hastaneye nasıl giderim" — algoritma hesaplar, model yalnız anlatır).

## Katkı

Yol haritasındaki her başlık bir iş kartıdır (GitHub "Issues"). Birini al, kartta ne yapacağını yaz. Önce ölç, sonra değiştir; `sh olcum/modelsiz.sh` her katkıda geçmeli. Bekçileri gevşeten değişiklik, sınav bankasında ölçülmeden kabul edilmez. Yeni dilde ekran çevirisi, kitap listesi ve sınav sorusu da katkıdır.

**Dikkat edilecekler:**
- Ölçmeden değiştirme. Bir değişiklik önce kayıtlı notlu cevaplarda, sonra **görülmemiş** sorularda ölçülür; görülmemiş soruları değişikliği yapan değil, kodu görmeyen biri yazar.
- Bekçi bilgi eklemez, yalnız durdurur. Yeni bekçiye dişli örnekler ve bozma denemesi eklenir.
- Sunucuya giden metin `kes()` ile kesilir (düz `slice` emojinin ortasında kalınca istek düşer).
- Heybe tıbbi otorite değildir; sınav notlarındaki "beklenen" cevaplar da değildir.

## Koddaki notlar

Kod yorumlarında tarihler, kısa alıntılar ve "Özet §46" gibi göndermeler göreceksin. Bunlar kararın nereden geldiğini gösterir; alıntılar ortağımız Ercan'ın tasarım istekleridir. "Özet §" göndermeleri geliştirme defterimize aittir; defter özeldir, depoda yoktur. Yorumların çoğu Türkçedir.

## Lisans

Kod: Apache 2.0 (`LICENSE`). Kitapların ve modellerin kendi lisansları vardır (`tasinabilir/usb_kok/LISANSLAR`); Heybe onları dağıtmaz, kullanıcı kendisi indirir.

Kurumlar, dernekler ve gönüllüler Heybe'yi kendi belleklerine kurup ücretsiz dağıtabilir; kod açık lisanslıdır. Kitap ve model lisanslarına uyulması yeter.
