"""Denklik sınavı, Python tarafı (05.11.2026): arkadas.py v3 + denetci.py ne üretiyor?
JS sürümü (tasinabilir/usb_kok/heybe/arkadas.js) aynı girdilerle aynısını üretmeli.
Kullanım: olcum/.venv/bin/python -I olcum/denklik/python_cikti.py > olcum/denklik/python.json
"""
import json
import sys
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KOK / "betik"))
from arkadas import Kutuphane  # noqa: E402
from denetci import denetle, olcuyle  # noqa: E402

kayitlar = [json.loads(s) for s in open(KOK / "sonuc" / "olcum_gemma3_4b_v3.jsonl")]
k = Kutuphane()
cikti = {"adaylar": {}, "makaleler": {}, "denetim": {}, "olcuyle": {}}
for r in kayitlar:
    yollar = k.adaylar_v2(r["soru"], r["basliklar"])
    cikti["adaylar"][str(r["no"])] = yollar
    for y in yollar:
        if y not in cikti["makaleler"]:
            try:
                ad, p = k.makale(y)
                cikti["makaleler"][y] = [ad, [list(x) for x in p]]
            except Exception as e:
                cikti["makaleler"][y] = ["HATA", str(e)]
    cikti["denetim"][str(r["no"])] = denetle(r)
# 06.11: "8" eskiden "3 ila 4 gram"ı arıyordu; v3 cevabı "üç ila dört gramdır" diyor → bozma boşa düşüyordu (dişsiz).
# Artık her bozma metni GERÇEKTEN değiştirmek zorunda.
# 06.11: "2" cümle başındaki "İki"yi sınar (eski denetçi büyük İ yüzünden kaçırıyordu)
bozuk = {"15": ("100-120", "80-100"), "8": ("üç ila dört gramdır", "sekiz gramdır"), "15.1": ("5 cm", "2 cm"),
         "2": ("Diğer durumlarda 1 dakika", "İki dakika")}
for no, (eski, yeni) in bozuk.items():
    r = next(x for x in kayitlar if x["no"] == int(float(no)))
    assert eski in r["kaynakli"], f"bozma boşa düşüyor: {no}"
    cikti["denetim"]["boz_" + no] = denetle(r, r["kaynakli"].replace(eski, yeni))
ornekler = ["3 ila 4 gram tuz", "üç gün", "30 bası 2 nefes", "%5", "6g", "1,5 litre su", "100–120 kez",
            "on dakika", "sonra", "altı ay", "37 °C", "iki-üç bardak", "yüzde 70 alkol",
            "bir buçuk ila üç gram tuz", "1,5 ila 3 gram", "yarım çay kaşığı", "yarımada", "iki buçuk saat",
            "İki gün", "İki buçuk saat", "ALTI AY", "İKİ DAKİKA", "BİR BUÇUK LİTRE",
            "yüksek tansiyon", "güç kaybı", "tedbir alın", "kompresyon derinliği 5 cm", "x10 büyütme",
            "15.754.053 kişi", "6.562 fit", "1,5 litre", "2.000 metre", "3.5 milyon"]
for o in ornekler:
    cikti["olcuyle"][o] = sorted(list(x) for x in olcuyle(o))
json.dump(cikti, sys.stdout, ensure_ascii=False)
