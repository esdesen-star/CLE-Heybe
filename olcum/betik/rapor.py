"""Ölçüm sonuçlarını Ercan'ın okuyacağı tek dosyaya döker: sonuc/Cevaplar.md

Puanlar sonuc/puanlar.json'dan gelir (Can'ın değerlendirmesi):
  {"gemma3:4b": {"1": {"kaynakli": "doğru", "kaynaksiz": "kısmen", "not": "..."}, ...}, ...}
"""
import json
from collections import Counter
from pathlib import Path

from denetci import denetle

KOK = Path(__file__).resolve().parent.parent
SONUC = KOK / "sonuc"
MODELLER = ["gemma3:4b", "gemma3:4b_v3", "gemma3:1b"]  # _v3: aynı model, anlam aramasıyla (kaynaksız sorulmadı)

puanlar = json.loads((SONUC / "puanlar.json").read_text()) if (SONUC / "puanlar.json").exists() else {}
satirlar = ["# CLE Yol Arkadaşı — ilk ölçüm (01.11.2026)", "",
            "Kaynak: Türkçe Vikipedi, çevrim dışı (wikipedia_tr_all_nopic_2026-09, 1.036.886 makale).",
            "Değerlendiren: Can. \"Beklenen\" satırı Can'ın genel bilgisidir, tıbbi otorite değildir.", ""]

for model in MODELLER:
    dosya = SONUC / f"olcum_{model.replace(':', '_')}.jsonl"
    if not dosya.exists():
        continue
    kayitlar = [json.loads(s) for s in dosya.open()]
    p = puanlar.get(model, {})
    satirlar += [f"## Model: {model}", ""]
    if p:
        for tur in ("kaynakli", "kaynaksiz"):
            sayim = Counter(v[tur] for v in p.values() if v[tur])
            if not sayim:
                continue
            satirlar.append(f"- **{'Kaynaklı' if tur == 'kaynakli' else 'Kaynaksız'}:** "
                            + ", ".join(f"{k} {n}" for k, n in sayim.most_common()))
        hizlar = [k["harf_hizi"] for k in kayitlar]
        sureler = [k["kaynakli_sn"] + k["arama_sn"] for k in kayitlar]
        satirlar += [f"- Mac'te ortalama cevap süresi (arama dahil): {sum(sureler) / len(sureler):.1f} sn, "
                     f"üretim hızı ~{sum(hizlar) / len(hizlar):.0f} parça/sn", ""]
    for k in kayitlar:
        d = p.get(str(k["no"]), {})
        satirlar += [f"### {k['no']}. {k['soru']}", "",
                     f"*Beklenen:* {k['beklenen']}", "",
                     "*Bulunan kaynaklar:* " + "; ".join(sorted({x['makale'] for x in k['parcalar']})), "",
                     f"**Kaynaklı cevap** — {d.get('kaynakli', '?')}", "", k["kaynakli"], ""]
        if k["kaynaksiz"]:
            satirlar += [f"**Kaynaksız cevap** — {d.get('kaynaksiz', '?')}", "", k["kaynaksiz"], ""]
        eksik = denetle(k)
        if eksik:
            satirlar += [f"> ⛔ Sayı denetçisi bu cevabı DURDURURDU — kaynakta olmayan: {', '.join(eksik)}", ""]
        if d.get("not"):
            satirlar += [f"> Can'ın notu: {d['not']}", ""]

(SONUC / "Cevaplar.md").write_text("\n".join(satirlar))
print("yazıldı:", SONUC / "Cevaplar.md")
