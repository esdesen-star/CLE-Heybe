"""Fiş testi: USB'ye durum dosyası yazılırken disk zorla koparılırsa ne olur?

İki yazma yöntemi karşılaştırılır:
  duz    — dosyanın üstüne doğrudan yazar (çoğu programın yaptığı)
  guvenli — önce geçici dosyaya yazar, diske zorlar (fsync), sonra adını değiştirir; bir önceki sürüm .yedek olarak kalır
Her denemede yazıcı çalışırken disk `hdiutil detach -force` ile koparılır, sonra yeniden bağlanıp dosyalar okunur.
Kullanım: python3 -I fis_testi.py [deneme_sayisi]
"""
import json
import os
import random
import subprocess
import sys
import time
from pathlib import Path

KOK = Path(__file__).resolve().parent
GORUNTU = KOK / "fis_usb.sparseimage"
BAGLAMA = Path("/Volumes/FISTEST")

YAZICI = r'''
import json, os, sys, time
yer, yontem = sys.argv[1], sys.argv[2]
ana = os.path.join(yer, "plan.json")
sayac = 0
while True:
    sayac += 1
    veri = json.dumps({"sayac": sayac, "adimlar": ["ilk 72 saat plan adımı %d" % i for i in range(4000)]})
    if yontem == "duz":
        with open(ana, "w") as f:
            f.write(veri)
    else:
        gecici = ana + ".gecici"
        with open(gecici, "w") as f:
            f.write(veri); f.flush(); os.fsync(f.fileno())
        if os.path.exists(ana):
            os.replace(ana, ana + ".yedek")
        os.replace(gecici, ana)
'''


def sh(*komut, **kw):
    return subprocess.run(komut, capture_output=True, text=True, **kw)


def bagla():
    sh("hdiutil", "attach", "-nobrowse", "-mountpoint", str(BAGLAMA), str(GORUNTU))
    for _ in range(50):
        if BAGLAMA.exists() and os.path.ismount(BAGLAMA):
            return
        time.sleep(0.1)
    raise RuntimeError("bağlanamadı")


def oku(yol):
    try:
        return json.loads(Path(yol).read_text())["sayac"]
    except Exception:
        return None


def deneme(yontem, klasor):
    bagla()
    yer = BAGLAMA / klasor
    yer.mkdir(exist_ok=True)
    p = subprocess.Popen([sys.executable, "-I", "-c", YAZICI, str(yer), yontem])
    time.sleep(random.uniform(0.4, 1.6))
    sh("hdiutil", "detach", "-force", str(BAGLAMA))
    p.kill()
    p.wait()
    time.sleep(0.3)
    bagla()
    ana = oku(yer / "plan.json")
    yedek = oku(yer / "plan.json.yedek") if yontem == "guvenli" else None
    sh("hdiutil", "detach", str(BAGLAMA))
    if ana is not None:
        return "sağlam"
    if yedek is not None:
        return "ana bozuk, yedekten döndü"
    return "KAYIP"


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    if not GORUNTU.exists():
        sh("hdiutil", "create", "-size", "200m", "-fs", "ExFAT", "-volname", "FISTEST", "-type", "SPARSE",
           str(GORUNTU.with_suffix("")))
    sonuc = {"duz": [], "guvenli": []}
    for i in range(n):
        for yontem in ("duz", "guvenli"):
            sonuc[yontem].append(deneme(yontem, f"{yontem}_{i}"))
            print(f"{i + 1:>2} {yontem:<8} {sonuc[yontem][-1]}", flush=True)
    print("\nÖZET")
    for yontem, liste in sonuc.items():
        print(f"  {yontem:<8}", {k: liste.count(k) for k in dict.fromkeys(liste)})
    (KOK / "fis_testi_sonuc.json").write_text(json.dumps(sonuc, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
