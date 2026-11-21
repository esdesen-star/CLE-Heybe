#!/usr/bin/env python3
# §211 (19.11.2026): temsili_hakem.py hazirla, ONEK != SET iken aynı öğenin hükmünü ESKİ tabandan taşır (tasi) ve hakeme
# yalnız yenileri yollar. Ortak hakemde taban yolu (kopya ad, ör. acilgec_enT) bütünüyle YENİ hakemden geçtiği için,
# taşınan öğelere aynı (no, tür) öğenin YENİ hükmü konur — iki yol tek hakemin gözüyle sayılsın.
# Kullanım: python3 hukum_tamamla.py <yol> <taban_kopya> [_S]
import json, os, sys
K = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sonuc')
yol, taban, ek = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else '')
Y = lambda a: os.path.join(K, a)
yu = lambda a: json.load(open(Y(a), encoding='utf-8'))
an, tan = yu(f'{yol}_hakem_anahtar{ek}_1611.json'), yu(f'{taban}_hakem_anahtar{ek}_1611.json')
th = {x['id']: x for x in yu(f'{taban}_hakem_hukum{ek}_1611.json')}
yeni = {x['id']: x for x in yu(f'{yol}_hakem_hukum{ek}_1611.json')}
hazir = yu(f'{yol}_hakem_hukum_hazir{ek}_1611.json') if os.path.exists(Y(f'{yol}_hakem_hukum_hazir{ek}_1611.json')) else []
tabanda = {(v['no'], v['tur']): i for i, v in tan.items()}
cikti, eksik = dict(yeni), []
for h in hazir:
    i = h['id']; k = (an[i]['no'], an[i]['tur'])
    ti = tabanda.get(k)
    if ti and ti in th: cikti[i] = {**th[ti], 'id': i}
    else: eksik.append(i)
kalan = [i for i in an if i not in cikti]
json.dump(list(cikti.values()), open(Y(f'{yol}_hakem_hukum{ek}_1611.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{yol}{ek}: yeni {len(yeni)} + tabandan (yeni hakem) {len(hazir) - len(eksik)} = {len(cikti)}/{len(an)} · eşleşmeyen {len(eksik)} · hükümsüz {len(kalan)}')
