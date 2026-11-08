"""Ölçüm çıktısını okunur hale getirir.  Kullanım: goster.py sonuc/olcum_gemma3_4b.jsonl [kısa]"""
import json
import sys

kisa = len(sys.argv) > 2
for satir in open(sys.argv[1]):
    d = json.loads(satir)
    print(f"\n===== {d['no']}. {d['soru']}  | başlıklar: {d['basliklar']}")
    print(f"BEKLENEN: {d['beklenen']}")
    for i, p in enumerate(d["parcalar"], 1):
        print(f"  [{i}] {p['makale']} / {p['bolum']} (puan {p['puan']}): {p['metin'][:120 if kisa else 400]}")
    print("--- KAYNAKLI:\n" + d["kaynakli"])
    print("--- KAYNAKSIZ:\n" + d["kaynaksiz"][:700])
