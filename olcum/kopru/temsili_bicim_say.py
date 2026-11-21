#!/usr/bin/env python3
# "41 hata Heybe'nin mi?" sayımı (16.11.2026, Özet §171). temsili_bicim.cjs'in kaydında her soru × biçim × yol için:
# Heybe'nin kullandığı bölümler (ya da şıklar) arasında, kör arama ajanlarının bu soru için "doğru" ya da "kısmen doğru"
# dediği bir bölüm var mı (kitap + başlık eşleşmesi; hakemsiz, mekanik).
import json, os, re, unicodedata
from collections import Counter, defaultdict

KOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
Y = lambda a: os.path.join(KOK, a)


def norm(s):
    s = unicodedata.normalize('NFC', str(s or '')).replace('_', ' ')
    s = re.sub(r'\s+-\s+the great outdoors stack exchange$', '', s.strip(), flags=re.I)
    s = s.split(' — ')[0]
    return re.sub(r'[^\w]+', ' ', s.lower()).strip()


def adlar(b):
    yol = str(b.get('yol') or '')
    son = yol.rstrip('/').split('/')[-1].replace('-', ' ')
    return {x for x in (norm(b.get('baslik')), norm(yol), norm(son)) if len(x) >= 4}


def kitap(k):
    return re.sub(r'_20\d\d-\d\d$', '', str(k or ''))


def eslesir(heybe, iyiler):
    hk, hn = kitap(heybe['kitap']), norm(heybe['makale'])
    for ik, ia in iyiler:
        if hk != ik:
            continue
        for a in ia:
            if hn == a or (len(min(hn, a, key=len)) >= 8 and (hn.startswith(a) or a.startswith(hn))):
                return True
    return False


iyi = {}
for i in (1, 2, 3):
    for x in json.load(open(Y(f'sonuc/temsili_kutuphane_{i}_1611.json'), encoding='utf-8')):
        iyi[x['no']] = [(kitap(b.get('kitap')), adlar(b)) for b in x.get('bolumler', []) if b.get('dogru') in ('EVET', 'KISMEN')]
kayit = [json.loads(l) for l in open(Y('sonuc/temsili_bicim_sonuc_1611.jsonl'), encoding='utf-8') if l.strip()]
nolar = sorted({k['no'] for k in kayit})
print(f'{len(nolar)} soru · {len(kayit)} kayıt · hata {sum(1 for k in kayit if k.get("hata"))}')
print(f'arama ajanlarının doğru/kısmen doğru bölüm bulduğu: {sum(1 for no in nolar if iyi.get(no))}\n')
isabet = defaultdict(dict)
yollar = defaultdict(Counter)
for k in kayit:
    if k.get('hata'):
        continue
    h = any(eslesir(b, iyi.get(k['no'], [])) for b in k.get('bolumler', []))
    isabet[(k['yolu'], k['bicim'])][k['no']] = h
    if k['yolu'] == 'urun':
        yollar[k['bicim']][k.get('yol')] += 1
BIC = ['soru', 'kisa', 'uzun', 'baska_kelime', 'net']
for yolu, ad in (('urun', 'ÜRÜNÜN YOLU (önce Türkçe)'), ('korsuz', 'DİL KÖRÜ ARAMA (deney: TR + EN tek havuz)')):
    print(ad)
    for b in BIC:
        d = isabet.get((yolu, b), {})
        print(f'  {b:13s} doğru bölüm bulundu {sum(d.values()):2d}/{len(d)}' + (f'   · yol: {dict(yollar[b])}' if yolu == 'urun' else ''))
    herhangi = sum(1 for no in nolar if any(isabet.get((yolu, b), {}).get(no) for b in BIC))
    print(f'  biçimlerden en az birinde: {herhangi}/{len(nolar)}')
print('\nsoru başına (Ü = ürün, D = dil körü; s k u b n = soru kısa uzun başka kelime net):')
for no in nolar:
    u = ''.join('●' if isabet.get(('urun', b), {}).get(no) else '·' for b in BIC)
    d = ''.join('●' if isabet.get(('korsuz', b), {}).get(no) else '·' for b in BIC)
    print(f'  {no}  Ü {u}  D {d}')
