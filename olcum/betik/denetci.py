"""Sayı denetçisi: kaynaklı cevaptaki her "sayı + birim", modele verilen paragraflarda aynen geçiyor mu?

Geçmiyorsa cevap kullanıcıya gitmeden durdurulmalı — doz, miktar, süre uydurmanın en tehlikeli hali.
İlk sürüm yalnız çıplak sayıya bakıyordu; kaynaktaki "altı ay" yüzünden uydurma "6 gram"ı geçirdi.
Kullanım: denetci.py sonuc/olcum_gemma3_4b.jsonl [sinav]
"""
import json
import re
import sys

YAZIYLA = {"bir": "1", "iki": "2", "üç": "3", "dört": "4", "beş": "5", "altı": "6", "yedi": "7",
           "sekiz": "8", "dokuz": "9", "on": "10", "yirmi": "20", "otuz": "30", "yüz": "100"}
BIRIM = {"g": "g", "gr": "g", "gram": "g", "mg": "mg", "miligram": "mg", "kg": "kg", "kilogram": "kg",
         "l": "l", "lt": "l", "litre": "l", "ml": "ml", "mililitre": "ml", "cm": "cm", "santimetre": "cm",
         "mm": "mm", "m": "m", "metre": "m", "dk": "dk", "dakika": "dk", "sn": "sn", "saniye": "sn",
         "saat": "saat", "gün": "gün", "hafta": "hafta", "ay": "ay", "yıl": "yıl", "°c": "c", "c": "c",
         "derece": "c", "kaşık": "kaşık", "tatlı": "kaşık", "çay": "kaşık", "yemek": "kaşık",
         "bardak": "bardak", "tablet": "tablet", "damla": "damla", "kez": "kez", "defa": "kez", "bası": "kez",
         "kat": "kat", "yüzde": "%", "%": "%"}
# 06.11: baştaki sınır (?<!\w) — yoksa "tansiyon" 10, "güç" 3, "tedbir" 1 okunuyordu (dil köprüsünde görüldü)
_S = r"(?<!\w)(\d+(?:[.,]\d+)?|" + "|".join(sorted(YAZIYLA, key=len, reverse=True)) + r")\b"
DESEN = re.compile(r"(%\s*)?" + _S + r"\s*(?:(?:-|–|—|ila|ile|veya|ya da)\s*" + _S + r")?\s*(°\s*c|%|[a-zçğıöşü]+)?")


def _birim(kelime):
    kelime = (kelime or "").replace(" ", "")
    return BIRIM.get(kelime) or BIRIM.get(kelime.rstrip("ıiuüdeaınlr")) or "?"


_BUCUK = re.compile(r"(?<!\w)(\d+|" + "|".join(sorted(YAZIYLA, key=len, reverse=True)) + r")\s+buçuk\b")


def _kesirli(metin):
    """'bir buçuk' → '1.5', 'yarım' → '0.5' (05.11: kaynaktaki 'bir buçuk ila üç gram' ile
    cevaptaki '1,5 ila 3 gram' aynı şey; denetçi bunu uydurma sanıp doğru cevabı durdurdu)."""
    metin = _BUCUK.sub(lambda m: YAZIYLA.get(m.group(1), m.group(1)) + ".5", metin)
    return re.sub(r"\byarım\b", "0.5", metin)


_BINLIK = re.compile(r"(?<![\d.,])(\d{1,3})((?:\.\d{3})+)(?![\d,]|\.\d)")


def _binlik(metin):
    """06.11: Türkçede binlik ayracı nokta — "15.754.053" → "15754053", "6.562 fit" → "6562" (dil köprüsünde
    İngilizce "15,754,053" ve Çekçe "15 754 053" ile aynı sayı olsun)."""
    return _BINLIK.sub(lambda m: m.group(1) + m.group(2).replace(".", ""), metin)


def olcuyle(metin):
    """Metindeki (sayı, birim) çiftleri; aralıkta ("3 ila 4 gram") iki uç da birimi alır.
    Birimi tanınmayan sayı '?' birimle döner."""
    cift = set()
    # 06.11: "İ".lower() → "i̇" (noktalı i + birleşik nokta); cümle başındaki "İki" sayı sayılmıyordu (K2 deliği);
    # aynı sınıf: büyük harfli "ALTI AY" → "alti" (Türkçe küçültme: I → ı)
    for yuzde, s1, s2, sonraki in DESEN.findall(_kesirli(_binlik(metin.replace("İ", "i").replace("I", "ı").lower()))):
        birim = "%" if yuzde else _birim(sonraki)
        for sayi in (s1, s2):
            if sayi:
                cift.add((YAZIYLA.get(sayi, sayi).replace(",", "."), birim))
    return cift


def denetle(kayit, cevap=None):
    cevap = re.sub(r"\[[\d,\s]+\]", "", cevap if cevap is not None else kayit["kaynakli"])
    cevap = re.sub(r"(?m)^\s*\d+[.)]\s", "", cevap)  # liste numarası ("2. adım") sayı değildir
    kaynak = olcuyle(" ".join(p["metin"] for p in kayit["parcalar"]))
    kaynak_sayilar = {s for s, _ in kaynak}
    eksik = []
    for sayi, birim in sorted(olcuyle(cevap)):
        if birim == "?" and sayi in kaynak_sayilar:
            continue
        if (sayi, birim) not in kaynak:
            eksik.append(f"{sayi} {birim}")
    return eksik


if __name__ == "__main__":
    kayitlar = [json.loads(s) for s in open(sys.argv[1])]
    for k in kayitlar:
        eksik = denetle(k)
        durum = f"DURDUR — kaynakta olmayan: {', '.join(eksik)}" if eksik else "geçti"
        print(f"{k['no']:>2}. {k['soru'][:55]:<55} {durum}")
    if len(sys.argv) > 2:  # dişi ölç: doğru cevapları bilerek boz, denetçi yakalamalı
        print("\n-- sınav: bozulmuş cevaplar --")
        bozuk = {15: ("100-120", "80-100"), 8: ("3 ila 4 gram", "8 gram"), 15.1: ("5 cm", "2 cm")}
        for no, (eski, yeni) in bozuk.items():
            k = next(x for x in kayitlar if x["no"] == int(no))
            if eski not in k["kaynakli"]:
                print(f"{no}: '{eski}' cevapta yok, sınav kurulamadı")
                continue
            sonuc = denetle(k, k["kaynakli"].replace(eski, yeni))
            print(f"{no}: '{eski}' → '{yeni}': {'YAKALADI ' + str(sonuc) if sonuc else 'KAÇIRDI'}")
