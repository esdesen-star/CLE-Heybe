#!/usr/bin/env python3
# Aday ölçüsünün sayımı (17.11.2026, §194): doğru bölüm (kör arama ajanlarının "doğru/kısmen doğru" dediği) modele giden
# 6'da değilse — aday listesinde hiç yok mu (arama kaçırdı) yoksa aday ama geride mi (sıralama kaçırdı)?
# Kullanım: SET=temsili4 python3 olcum/kopru/aday_say.py
import json, os, sys
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bolum_esle import eslesir, iyi_bolumler

KOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
Y = lambda a: os.path.join(KOK, a)
SETAD = os.environ.get('SET', 'temsili')
iyi = iyi_bolumler(Y, SETAD)
kayit = [json.loads(l) for l in open(Y(os.environ.get('ADAY_DOSYA') or f'sonuc/{SETAD}_aday_1611.jsonl'), encoding='utf-8') if l.strip()]   # §196 ADAY_DOSYA
durum, sira_list, aday_say = Counter(), [], []
ornek = {'aramada yok': [], 'aday ama geride': []}
for x in kayit:
    if x.get('hata'):
        durum['hata'] += 1
        continue
    iyiler = iyi.get(x['no'], [])
    if not iyiler:
        durum['kütüphanede doğru bölüm bulunmamış (ajan)'] += 1
        continue
    secilende = any(eslesir(b, iyiler) for b in x['secilen'])
    # bütün gözlemler (dil körü yolunda birden çok kaynakBul olabilir): en iyi sıra
    en_iyi = None
    toplam = 0
    for liste in x['adaylar']:
        toplam = max(toplam, len(liste))
        for b in liste:
            if eslesir(b, iyiler):
                en_iyi = b['sira'] if en_iyi is None else min(en_iyi, b['sira'])
                break
    aday_say.append(toplam)
    if secilende:
        durum['modele giden 6\'da'] += 1
    elif en_iyi is None:
        durum['aramada yok (aday listesinde hiç yok)'] += 1
        ornek['aramada yok'].append(x['no'])
    else:
        durum['aday ama geride'] += 1
        sira_list.append(en_iyi)
        ornek['aday ama geride'].append((x['no'], en_iyi))
n = len(kayit)
print(f'{n} soru · aday paragraf sayısı ortalama {sum(aday_say) / max(1, len(aday_say)):.0f}')
for k, v in durum.most_common():
    print(f'  {v:3d}  {k}')
if sira_list:
    print(f'  geride kalanların sırası: ortanca {sorted(sira_list)[len(sira_list) // 2]} · 7–12 arası {sum(1 for s in sira_list if s <= 12)} · 13–30 {sum(1 for s in sira_list if 12 < s <= 30)} · 30\'dan sonra {sum(1 for s in sira_list if s > 30)}')
print('aramada yok:', ornek['aramada yok'])
print('aday ama geride:', ornek['aday ama geride'])
