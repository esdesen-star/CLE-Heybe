"""CLE Yol Arkadaşı — ölçüm betiği (01.11.2026).

Soru gelir → model Vikipedi'de bakılacak başlıkları önerir → ZIM içinde aranır →
en ilgili paragraflar seçilir → model YALNIZ bu paragraflardan cevap verir.
Karşılaştırma için aynı model kaynaksız da cevaplar.

Kullanım:  .venv/bin/python -I betik/arkadas.py gemma3:4b
"""
import json
import math
import re
import sys
import time
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

from libzim.reader import Archive
from libzim.search import Query, Searcher
from libzim.suggestion import SuggestionSearcher

KOK = Path(__file__).resolve().parent.parent
ZIM = KOK / "kaynak" / "wikipedia_tr_all_nopic_2026-09.zim"
OLLAMA = "http://localhost:11434/api/chat"

PARCA_SAYISI = 6        # modele giden paragraf sayısı
PARCA_UZUNLUK = 900     # her paragraf en çok bu kadar harf
MAKALE_BASINA = 3       # bir makaleden en çok kaç paragraf
ATLANAN_BOLUM = ("kaynakça", "kaynaklar", "dış bağlantılar", "ayrıca bakınız", "notlar", "dipnotlar")

SISTEM_KAYNAKLI = """Sen çevrim dışı çalışan bir yardımcı arkadaşsın. İnternet yok. Sana KAYNAKLAR verilecek.
Kurallar:
1. Yalnızca KAYNAKLAR'da yazanı kullan. Kendi bilgini ekleme.
2. Her bilginin sonuna kaynağın numarasını [1] gibi yaz.
3. Kaynaklarda sorunun cevabı yoksa yalnızca şunu yaz: "Kaynaklarımda bu bilgi yok." Tahmin etme.
4. İlaç dozu kaynakta açıkça yazmıyorsa asla doz söyleme.
5. Kısa, sakin, maddeler halinde, Türkçe yaz."""

SISTEM_KAYNAKSIZ = "Sen yardımcı bir asistansın. Soruyu kısa ve doğru şekilde, Türkçe cevapla."

SISTEM_BASLIK = """Kullanıcının sorusu için Türkçe Vikipedi'de bakılacak en fazla 3 makale başlığı yaz.
Yalnızca başlıkları yaz, her satıra bir tane. Açıklama yazma."""


def kucuk(metin):
    return metin.replace("I", "ı").replace("İ", "i").lower()


def kokler(metin):
    """Türkçe için kaba kök: 3 harften uzun kelimelerin ilk 5 harfi."""
    return {k[:5] for k in re.findall(r"[a-zçğıöşü0-9]+", kucuk(metin)) if len(k) > 3}


# v2: soru kalıbı kelimeleri aramayı saptırmasın
DURAK_KOK = {"nasıl", "nedir", "neler", "yapıl", "gerek", "kadar", "sonra", "önce", "veya", "daha",
             "olan", "olara", "için", "midir", "mıdır", "yenir", "hale", "getir", "ilk"}


class Paragrafci(HTMLParser):
    """Vikipedi HTML'inden (bölüm, paragraf) çiftlerini çıkarır."""

    # 07.11 (kitap sağlık denetimi buldu, arkadas.js ile aynı düzeltme): atlanan bölgeler eskiden tek sayaçtı; "navbox"
    # sınıflı <div>/<td> sayacı artırıp kapanışta azaltmıyordu → sonraki bütün paragraflar kayboluyordu (300 rastgele
    # Türkçe makalenin 35'inde kayıp, 3'ünde hiç paragraf yok). Artık her bölge kendi etiketiyle kapanır.
    BOS_ETIKET = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}

    def __init__(self):
        super().__init__()
        self.parcalar, self.bolum, self.tampon = [], "", []
        self.etiket, self.atla, self.yigin = None, False, []  # yigin: [[etiket, sayaç], ...]

    def handle_starttag(self, tag, attrs):
        sinif = dict(attrs).get("class") or ""
        ust = self.yigin[-1] if self.yigin else None
        if ust and ust[0] == tag:
            ust[1] += 1
        if tag in ("style", "script", "sup", "table") or "reference" in sinif or "navbox" in sinif:
            if not (ust and ust[0] == tag) and tag not in self.BOS_ETIKET:
                self.yigin.append([tag, 1])
        elif tag in ("h2", "h3"):
            self._bosalt()
            self.etiket = "baslik"
        elif tag in ("p", "li") and not self.yigin:
            self._bosalt()
            self.etiket = tag

    def handle_endtag(self, tag):
        i = len(self.yigin) - 1
        while i >= 0 and self.yigin[i][0] != tag:
            i -= 1
        if i >= 0:
            del self.yigin[i + 1:]
            self.yigin[i][1] -= 1
            if self.yigin[i][1] == 0:
                self.yigin.pop()
        elif tag in ("h2", "h3") and self.etiket == "baslik":
            self.bolum = " ".join("".join(self.tampon).split())
            self.atla = kucuk(self.bolum).startswith(ATLANAN_BOLUM)
            self.tampon, self.etiket = [], None
        elif tag in ("p", "li") and self.etiket == tag:
            self._bosalt()

    def handle_data(self, data):
        if self.etiket and not self.yigin:
            self.tampon.append(data)

    def _bosalt(self):
        if self.etiket in ("p", "li") and not self.atla:
            metin = " ".join("".join(self.tampon).split())
            if len(metin) > 40:
                onek = "• " if self.etiket == "li" else ""
                self.parcalar.append((self.bolum, onek + metin))
        self.tampon, self.etiket = [], None


def li_birlestir(parcalar):
    """Art arda gelen liste maddelerini tek paragrafta topla."""
    sonuc = []
    for bolum, metin in parcalar:
        if sonuc and metin.startswith("• ") and sonuc[-1][1].startswith("• ") and sonuc[-1][0] == bolum \
                and len(sonuc[-1][1]) < PARCA_UZUNLUK:
            sonuc[-1] = (bolum, sonuc[-1][1] + " " + metin)
        else:
            sonuc.append((bolum, metin))
    return sonuc


class Kutuphane:
    def __init__(self):
        self.arsiv = Archive(str(ZIM))
        self.metin_arayici = Searcher(self.arsiv)
        self.baslik_arayici = SuggestionSearcher(self.arsiv)

    def makale(self, yol):
        giris = self.arsiv.get_entry_by_path(yol)
        if giris.is_redirect:
            giris = giris.get_redirect_entry()
        p = Paragrafci()
        p.feed(bytes(giris.get_item().content).decode("utf-8", "replace"))
        p._bosalt()
        return giris.title, li_birlestir(p.parcalar)

    def adaylar(self, soru, basliklar):
        yollar = []
        for b in basliklar:
            yollar += list(self.baslik_arayici.suggest(b).getResults(0, 2))
            yollar += list(self.metin_arayici.search(Query().set_query(b)).getResults(0, 1))
        yollar += list(self.metin_arayici.search(Query().set_query(soru)).getResults(0, 2))
        gorulen, tekil = set(), []
        for y in yollar:
            if y not in gorulen:
                gorulen.add(y)
                tekil.append(y)
        return tekil[:8]

    def parcalar(self, soru, basliklar):
        soru_k = kokler(soru) | kokler(" ".join(basliklar))
        baslik_k = kokler(" ".join(basliklar))
        adaylar = []
        for yol in self.adaylar(soru, basliklar):
            try:
                ad, paragraflar = self.makale(yol)
            except Exception:
                continue
            ad_bonus = 2 if kokler(ad) & baslik_k else 0
            for sira, (bolum, metin) in enumerate(paragraflar):
                ortak = len(kokler(metin + " " + bolum) & soru_k)
                if ortak:
                    puan = ortak + ad_bonus + (1 if sira < 2 else 0)
                    adaylar.append((puan, ad, bolum, metin[:PARCA_UZUNLUK]))
        adaylar.sort(key=lambda x: -x[0])
        secilen, sayac = [], {}
        for puan, ad, bolum, metin in adaylar:
            if sayac.get(ad, 0) < MAKALE_BASINA:
                sayac[ad] = sayac.get(ad, 0) + 1
                secilen.append({"makale": ad, "bolum": bolum, "metin": metin, "puan": puan})
            if len(secilen) == PARCA_SAYISI:
                break
        return secilen

    def adaylar_v2(self, soru, basliklar):
        """v1 adaylarına ek: sorunun içerik kelimeleriyle ve ikili kelime gruplarıyla tam metin araması.
        İlk yardım makalesi cihazın çekirdeği sayılır, her soruda adaydır (tasarım kararı)."""
        kelimeler = [w for w in re.findall(r"[a-zçğıöşü]+", kucuk(soru)) if len(w) > 3 and w[:5] not in DURAK_KOK]
        sorgular = [" ".join(kelimeler)] + [f"{a} {b}" for i, a in enumerate(kelimeler[:5]) for b in kelimeler[i + 1:5]]
        yollar = []
        for b in basliklar:
            yollar += list(self.baslik_arayici.suggest(b).getResults(0, 2))
            yollar += list(self.metin_arayici.search(Query().set_query(b)).getResults(0, 2))
        for i, q in enumerate(sorgular):
            yollar += list(self.metin_arayici.search(Query().set_query(q)).getResults(0, 5 if i == 0 else 2))
        yollar.append("İlk_yardım")
        gorulen, tekil = set(), []
        for y in yollar:
            if y not in gorulen:
                gorulen.add(y)
                tekil.append(y)
        return tekil[:20]

    def parcalar_v2(self, soru, basliklar):
        """v1'den farkları: soru kelimesi öneri başlığından ağır basar, sık geçen kök az sayılır (IDF),
        bölüm başlığı eşleşmesi öne çıkar, soruyla hiç ortak kökü olmayan makale geri itilir."""
        soru_k = kokler(soru) - DURAK_KOK
        anahtar_k = kokler(" ".join(basliklar)) - DURAK_KOK
        sorgu_k = soru_k | anahtar_k
        ham = []
        for yol in self.adaylar_v2(soru, basliklar):
            try:
                ad, paragraflar = self.makale(yol)
            except Exception:
                continue
            for sira, (bolum, metin) in enumerate(paragraflar):
                ham.append((ad, bolum, metin, kokler(metin), kokler(bolum), sira))
        if not ham:
            return []
        df = {k: sum(1 for h in ham if k in h[3] or k in h[4]) for k in sorgu_k}
        w = {k: math.log(1 + len(ham) / df[k]) if df[k] else 0 for k in sorgu_k}
        adaylar = []
        for ad, bolum, metin, mk, bk, sira in ham:
            puan = sum(w[k] * (2 if k in soru_k else 1) for k in mk & sorgu_k)
            puan += 1.5 * sum(w[k] for k in bk & sorgu_k)
            ak = kokler(ad)
            puan += 3 if ak & soru_k else (0 if ak & anahtar_k else -3)
            puan += 0.5 if sira < 2 else 0
            if puan > 0 and mk & sorgu_k:
                adaylar.append((round(puan, 1), ad, bolum, metin[:PARCA_UZUNLUK]))
        adaylar.sort(key=lambda x: -x[0])
        secilen, sayac = [], {}
        for puan, ad, bolum, metin in adaylar:
            if sayac.get(ad, 0) < MAKALE_BASINA:
                sayac[ad] = sayac.get(ad, 0) + 1
                secilen.append({"makale": ad, "bolum": bolum, "metin": metin, "puan": puan})
            if len(secilen) == PARCA_SAYISI:
                break
        return secilen


GOMME = "http://localhost:11434/api/embed"
GOMME_MODELI = "embeddinggemma"
_gomme_onbellek = {}


def gom(metinler):
    """Metinleri anlam vektörüne çevirir; aynı metin ikinci kez hesaplanmaz."""
    eksik = [m for m in dict.fromkeys(metinler) if m not in _gomme_onbellek]
    for i in range(0, len(eksik), 64):
        parti = eksik[i:i + 64]
        govde = json.dumps({"model": GOMME_MODELI, "input": parti}).encode()
        istek = urllib.request.Request(GOMME, govde, {"Content-Type": "application/json"})
        with urllib.request.urlopen(istek, timeout=600) as yanit:
            for m, v in zip(parti, json.load(yanit)["embeddings"]):
                boy = math.sqrt(sum(x * x for x in v)) or 1
                _gomme_onbellek[m] = [x / boy for x in v]
    return [_gomme_onbellek[m] for m in metinler]


def parcalar_v3(kutuphane, soru, basliklar):
    """v3: adaylar v2'deki gibi geniş toplanır, sıralamayı kelime değil ANLAM benzerliği yapar."""
    ham = []
    for yol in kutuphane.adaylar_v2(soru, basliklar):
        try:
            ad, paragraflar = kutuphane.makale(yol)
        except Exception:
            continue
        for bolum, metin in paragraflar:
            ham.append((ad, bolum, metin))
    if not ham:
        return []
    belgeler = [f"title: {ad}{' — ' + bolum if bolum else ''} | text: {metin[:600]}" for ad, bolum, metin in ham]
    sorgu, *vektorler = gom([f"task: search result | query: {soru}"] + belgeler)
    puanli = sorted(((sum(a * b for a, b in zip(sorgu, v)), h) for v, h in zip(vektorler, ham)),
                    key=lambda x: -x[0])
    secilen, sayac = [], {}
    for puan, (ad, bolum, metin) in puanli:
        if sayac.get(ad, 0) < MAKALE_BASINA:
            sayac[ad] = sayac.get(ad, 0) + 1
            secilen.append({"makale": ad, "bolum": bolum, "metin": metin[:PARCA_UZUNLUK], "puan": round(puan, 3)})
        if len(secilen) == PARCA_SAYISI:
            break
    return secilen


def sor(model, sistem, mesaj, uzunluk=350):
    govde = json.dumps({
        "model": model, "stream": False,
        "messages": [{"role": "system", "content": sistem}, {"role": "user", "content": mesaj}],
        "options": {"temperature": 0, "seed": 1, "num_ctx": 8192, "num_predict": uzunluk},
    }).encode()
    istek = urllib.request.Request(OLLAMA, govde, {"Content-Type": "application/json"})
    with urllib.request.urlopen(istek, timeout=600) as yanit:
        d = json.load(yanit)
    hiz = d.get("eval_count", 0) / max(d.get("eval_duration", 1), 1) * 1e9
    return d["message"]["content"].strip(), round(hiz, 1), round(d.get("total_duration", 0) / 1e9, 1)


def main():
    model = sys.argv[1]
    sorular = json.loads((KOK / "betik" / "sorular.json").read_text())
    if len(sys.argv) > 2 and sys.argv[2] != "hepsi":
        secili = {int(n) for n in sys.argv[2].split(",")}
        sorular = [s for s in sorular if s["no"] in secili]
    surum = sys.argv[3] if len(sys.argv) > 3 else ""
    kutuphane = Kutuphane()
    secici = {"v2": kutuphane.parcalar_v2,
              "v3": lambda s, b: parcalar_v3(kutuphane, s, b)}.get(surum, kutuphane.parcalar)
    cikti = KOK / "sonuc" / f"olcum_{model.replace(':', '_')}{'_' + surum if surum else ''}.jsonl"
    with cikti.open("w") as f:
        for s in sorular:
            t0 = time.time()
            ham, _, _ = sor(model, SISTEM_BASLIK, s["soru"], 60)
            basliklar = [b.strip(" -*•0123456789.\"'") for b in ham.splitlines() if b.strip()][:3]
            parcalar = secici(s["soru"], basliklar)
            arama_sn = round(time.time() - t0, 1)
            kaynak_metni = "\n\n".join(
                f"[{i}] (Makale: {p['makale']}{' — ' + p['bolum'] if p['bolum'] else ''}) {p['metin']}"
                for i, p in enumerate(parcalar, 1))
            kaynakli, hiz1, sure1 = sor(model, SISTEM_KAYNAKLI, f"KAYNAKLAR:\n{kaynak_metni}\n\nSORU: {s['soru']}")
            # kaynaksız cevap aramaya bağlı değil; arama sürümü denenirken tekrar sorulmaz
            kaynaksiz, hiz2, sure2 = sor(model, SISTEM_KAYNAKSIZ, s["soru"]) if not surum else ("", 0, 0)
            kayit = {**s, "model": model, "basliklar": basliklar, "parcalar": parcalar,
                     "kaynakli": kaynakli, "kaynaksiz": kaynaksiz, "arama_sn": arama_sn,
                     "kaynakli_sn": sure1, "kaynaksiz_sn": sure2, "harf_hizi": hiz1}
            f.write(json.dumps(kayit, ensure_ascii=False) + "\n")
            f.flush()
            print(f"{s['no']:>2} {s['soru'][:50]:<50} | {', '.join(basliklar)[:60]} | {sure1}s", flush=True)


if __name__ == "__main__":
    main()
