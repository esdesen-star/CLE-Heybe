"""Dil denemesi (02.11.2026): Çekçe soru → Türkçe kütüphane (anlam araması) → Çekçe cevap.

Senaryo (Ercan): USB Türkçe, sahibi bilincini kaybetti, ona yardım eden arkadaşı yalnız Çekçe biliyor.
Kullanım: .venv/bin/python -I betik/dil_denemesi.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arkadas import SISTEM_BASLIK, SISTEM_KAYNAKLI, KOK, Kutuphane, parcalar_v3, sor  # noqa: E402
from denetci import denetle  # noqa: E402

MODEL = "gemma3:4b"
SISTEM = SISTEM_KAYNAKLI + "\n6. Kaynaklar Türkçe olabilir; cevabı kullanıcının sorduğu dilde yaz."
SORULAR = [
    ("Můj kamarád ztratil vědomí, ale dýchá. Co mám dělat?", "Bilinci kapalı ama nefes alıyor → koma (yan) pozisyonu, solunumu izle, yardım çağır."),
    ("Jak dlouho je potřeba vařit vodu, aby byla pitná?", "1 dakika; 2000 m üstü 3 dakika."),
    ("Dá se jíst muchomůrka červená?", "Hayır, zehirli (sinek mantarı)."),
    ("Kolik stlačení za minutu a jak hluboko se dělá masáž srdce u dospělého?", "Dakikada 100-120 bası, 5-6 cm."),
]


CEVIR_TR = "Aşağıdaki soruyu Türkçeye çevir. Yalnız çeviriyi yaz."
CEVIR_CS = ("Aşağıdaki metni Çekçeye çevir. Sayıları, birimleri ve [1] gibi kaynak numaralarını aynen koru. "
            "Bilgi ekleme, çıkarma. Yalnız çeviriyi yaz.")


def cevirisiz(kutuphane, soru):
    """İlk sürüm: soru olduğu gibi aranır, model 'soru hangi dildeyse o dilde' cevaplar."""
    ham, _, _ = sor(MODEL, SISTEM_BASLIK, soru, 60)
    basliklar = [b.strip(" -*•0123456789.\"'") for b in ham.splitlines() if b.strip()][:3]
    parcalar = parcalar_v3(kutuphane, soru, basliklar)
    kaynak = "\n\n".join(f"[{i}] (Makale: {p['makale']}{' — ' + p['bolum'] if p['bolum'] else ''}) {p['metin']}"
                         for i, p in enumerate(parcalar, 1))
    cevap, _, sure = sor(MODEL, SISTEM, f"KAYNAKLAR:\n{kaynak}\n\nSORU: {soru}")
    return {"basliklar": basliklar, "parcalar": parcalar, "kaynakli": cevap, "sure": sure}


def ceviri_katmanli(kutuphane, soru):
    """İkinci sürüm: soru Türkçeye çevrilir → Türkçe kütüphanede her şey Türkçe → cevap Çekçeye çevrilir.
    Çeviri denetimi: Çekçe cevaptaki her sayı Türkçe cevapta da olmalı."""
    soru_tr, _, _ = sor(MODEL, CEVIR_TR, soru, 120)
    k = cevirisiz(kutuphane, soru_tr)
    k["soru_tr"], k["kaynakli_tr"] = soru_tr, k["kaynakli"]
    k["kaynakli"], _, _ = sor(MODEL, CEVIR_CS, k["kaynakli_tr"], 500)
    k["ceviri_denetimi"] = denetle({"parcalar": [{"metin": k["kaynakli_tr"]}], "kaynakli": k["kaynakli"]})
    return k


def main():
    kutuphane = Kutuphane()
    surum = sys.argv[1] if len(sys.argv) > 1 else "ceviri"
    kayitlar = []
    for soru, beklenen in SORULAR:
        k = (ceviri_katmanli if surum == "ceviri" else cevirisiz)(kutuphane, soru)
        k.update({"soru": soru, "beklenen": beklenen})
        k["denetci"] = denetle(k) if surum != "ceviri" else denetle({**k, "kaynakli": k["kaynakli_tr"]})
        kayitlar.append(k)
        print(f"\n=== {soru}\nTürkçesi: {k.get('soru_tr', '-')} | başlıklar: {k['basliklar']}")
        for i, p in enumerate(k["parcalar"][:3], 1):
            print(f"  [{i}] {p['puan']} {p['makale']} / {p['bolum']}: {p['metin'][:100]}")
        if "kaynakli_tr" in k:
            print(f"TÜRKÇE CEVAP:\n{k['kaynakli_tr']}")
        print(f"ÇEKÇE CEVAP:\n{k['kaynakli']}\nKaynak denetçisi: {k['denetci'] or 'geçti'}"
              f" | Çeviri denetçisi: {k.get('ceviri_denetimi') or 'geçti'}", flush=True)
    (KOK / "sonuc" / f"dil_denemesi_cs_{surum}.json").write_text(json.dumps(kayitlar, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
