#!/usr/bin/env python3
# §173 (16.11.2026): bir setin iki yolu (deney kapalı <SET>, açık <SET>_dk) TEK kör hakem dosyasında, karışık sırayla, yolu
# gösterilmeden notlanır; birebir aynı öğe (soru numarası + tür + içerik) bir kez. Önce her yol için
#   SET=… ONEK=<yol> python3 temsili_hakem.py hazirla        (öğe dosyaları; taban yokken hüküm taşınmaz)
# sonra: python3 temsili_ortak_hakem.py hazirla <SET> [_S]   → sonuc/<SET>_ortak_girdi[_S]_1611.json + _harita_
#        (hakem → sonuc/<SET>_ortak_hukum[_S]_1611.json)
#        python3 temsili_ortak_hakem.py dagit <SET> [_S]     → her yolun <yol>_hakem_hukum[_S]_1611.json'u
import json, os, random, sys

KOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
Y = lambda a: os.path.join(KOK, a)
yukle = lambda a: json.load(open(Y(a), encoding='utf-8'))
yaz = lambda a, v: json.dump(v, open(Y(a), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
icerik = lambda o: json.dumps({k: o.get(k) for k in ('tur', 'soru', 'cevap', 'secenekler')}, ensure_ascii=False, sort_keys=True)


def hazirla(setad, ek=''):
    tek, harita = {}, {}
    # §190: YOLLAR=a,b → başka iki yol (ör. temsili4_dk,temsili4_dk_hk); varsayılan §173'teki taban + dil körü
    yollar = os.environ['YOLLAR'].split(',') if os.environ.get('YOLLAR') else (setad, setad + '_dk')
    for yol in yollar:
        girdi = yukle(f'sonuc/{yol}_hakem_girdi{ek}_1611.json')
        anahtar = yukle(f'sonuc/{yol}_hakem_anahtar{ek}_1611.json')
        for g in girdi:
            a = (anahtar[g['id']]['no'], icerik(g))
            tek.setdefault(a, {k: v for k, v in g.items() if k != 'id'})
            harita.setdefault(a, []).append([yol, g['id']])
    sira = list(tek)
    random.Random(1731 + len(ek)).shuffle(sira)
    girdi, h = [], {}
    for i, a in enumerate(sira, 1):
        kimlik = f'O{ek.strip("_")}{i:03d}'
        girdi.append({'id': kimlik, **tek[a]})
        h[kimlik] = harita[a]
    yaz(f'sonuc/{setad}_ortak_girdi{ek}_1611.json', girdi)
    yaz(f'sonuc/{setad}_ortak_harita{ek}_1611.json', h)
    print(f'{len(girdi)} tekil öğe ({sum(len(v) for v in h.values())} yol öğesi) → {setad}_ortak_girdi{ek}_1611.json')


def dagit(setad, ek=''):
    h = yukle(f'sonuc/{setad}_ortak_harita{ek}_1611.json')
    hukum = {x['id']: x for x in yukle(f'sonuc/{setad}_ortak_hukum{ek}_1611.json')}
    eksik = [i for i in h if i not in hukum]
    if eksik:
        print('hükümsüz:', len(eksik), eksik[:8])
    cikti = {}
    for kimlik, yerler in h.items():
        for yol, oid in yerler:
            if kimlik in hukum:
                cikti.setdefault(yol, []).append({**hukum[kimlik], 'id': oid})
    for yol, liste in cikti.items():
        yaz(f'sonuc/{yol}_hakem_hukum{ek}_1611.json', liste)
        print(yol, len(liste), 'hüküm')


if __name__ == '__main__':
    {'hazirla': hazirla, 'dagit': dagit}[sys.argv[1]](sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else '')
