"""v3 (Python + Ollama) ile taşınabilir arkadaşın (JS + llamafile) cevaplarını yan yana yazar.
Kullanım: python3 olcum/denklik/yan_yana.py > olcum/denklik/yan_yana.md
"""
import json
from pathlib import Path

S = Path(__file__).resolve().parent.parent / "sonuc"
v3 = {r["no"]: r for r in map(json.loads, open(S / "olcum_gemma3_4b_v3.jsonl"))}
js = {r["no"]: r for r in map(json.loads, open(S / "olcum_heybe_js.jsonl"))}
puan = json.load(open(S / "puanlar.json")).get("gemma3:4b_v3", {})
print("# v3 (Python + Ollama) ↔ taşınabilir arkadaş (JS + llamafile)\n")
for no in sorted(js):
    a, b = v3[no], js[no]
    ayni_kaynak = [p["makale"] for p in a["parcalar"]] == [p["makale"] for p in b["parcalar"]]
    print(f"## {no}. {b['soru']}\n")
    print(f"**Beklenen:** {b.get('beklenen', '')}\n")
    print(f"**Başlıklar** v3: {', '.join(a['basliklar'])} · JS: {', '.join(b['basliklar'])} · kaynak sırası {'AYNI' if ayni_kaynak else 'farklı'}\n")
    print(f"**v3 cevap** (puan: {puan.get(str(no), puan.get(no, '?'))}):\n\n{a['kaynakli']}\n")
    print(f"**JS cevap**{' — DURDUR ' + ', '.join(b['eksik']) if b.get('durdur') else ''}:\n\n{b['kaynakli']}\n")
    print("JS kaynaklar: " + " · ".join(f"[{i}] {p['makale']}{' — ' + p['bolum'] if p['bolum'] else ''}" for i, p in enumerate(b["parcalar"], 1)) + "\n")
