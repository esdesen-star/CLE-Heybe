#!/usr/bin/env python3
# §211 (19.11.2026): bir yolun hakem dosyaları yeniden hazırlanınca (yeni kimlikler) hükümler İÇERİKLE taşınır:
# aynı (no, tür, soru, cevap, seçenekler) öğe başka bir hüküm dosyasında notlandıysa o hüküm alınır. Kalanlar ayrı
# bir hakem girdisine yazılır (aynı hakeme gönderilmek üzere).
# Kullanım: python3 hukum_icerikle.py <yol> <ek: '' ya da _S> <kaynak1_girdi:kaynak1_anahtar:kaynak1_hukum> [...]
import json, os, sys
K = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sonuc')
Y = lambda a: a if a.startswith('/') else os.path.join(K, a)
yu = lambda a: json.load(open(Y(a), encoding='utf-8'))
icerik = lambda o: json.dumps({k: o.get(k) for k in ('tur', 'soru', 'cevap', 'secenekler')}, ensure_ascii=False, sort_keys=True)
yol, ek, kaynaklar = sys.argv[1], sys.argv[2], sys.argv[3:]
bilinen = {}
for k in kaynaklar:
    g, a, h = k.split(':')
    hh = {x['id']: x for x in yu(h)}; aa = yu(a)
    for x in yu(g):
        if x['id'] in hh: bilinen.setdefault((aa[x['id']]['no'], icerik(x)), hh[x['id']])
girdi, anahtar = yu(f'{yol}_hakem_girdi{ek}_1611.json'), yu(f'{yol}_hakem_anahtar{ek}_1611.json')
cikti, kalan = [], []
for x in girdi:
    h = bilinen.get((anahtar[x['id']]['no'], icerik(x)))
    if h: cikti.append({**h, 'id': x['id']})
    else: kalan.append(x)
json.dump(cikti, open(Y(f'{yol}_hakem_hukum{ek}_1611.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(kalan, open(Y(f'{yol}_hakem_kalan{ek}_1611.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{yol}{ek}: içerikle taşınan {len(cikti)} · hakeme kalan {len(kalan)} → {yol}_hakem_kalan{ek}_1611.json')
