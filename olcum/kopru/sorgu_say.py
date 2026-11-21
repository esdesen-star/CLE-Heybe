#!/usr/bin/env python3
# Sorgu ölçüsünün çözümlemesi (18.11.2026, §195): "aramada yok" sorularda doğru madde (kör ajanların "doğru/kısmen") Heybe'nin
# sorgularıyla neden gelmedi? Her sorguyu doğru kitapta 50 sonuçla yeniden sorar: doğru madde var mı, kaçıncı?
#   SINIR   — Heybe'nin sorgusu doğru maddeyi buluyor ama alınan sayının (adet) altında kalıyor
#   SORGU   — doğru kitapta arandı, hiçbir sorgu 50 sonuçta bile doğru maddeyi getirmiyor
#   KITAP   — doğru kitapta hiç aranmadı
# Kullanım: SET=temsili4 python3 olcum/kopru/sorgu_say.py
import json, os, sys, urllib.parse, urllib.request, re, html
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bolum_esle import eslesir, iyi_bolumler, kitap, norm

KOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
Y = lambda a: os.path.join(KOK, a)
SETAD = os.environ.get('SET', 'temsili')
K = os.environ.get('KUTUPHANE', 'http://127.0.0.1:18888')
iyi = iyi_bolumler(Y, SETAD)
kut = {}
for i in (1, 2, 3):
    kut.update({x['no']: x for x in json.load(open(Y(f'sonuc/{SETAD}_kutuphane_{i}_1611.json'), encoding='utf-8'))})
kitapTam = {}


def ara(kitapad, sorgu, n=50):
    q = urllib.parse.urlencode({'books.name': kitapad, 'pattern': sorgu, 'pageLength': n, 'format': 'xml'})
    x = urllib.request.urlopen(f'{K}/search?{q}', timeout=60).read().decode('utf-8', 'replace')
    return [urllib.parse.unquote(re.sub(r'^.*/content/[^/]+/', '', html.unescape(m))) for m in re.findall(r'<link>(.*?)</link>', x)]


# kitap kısa adı → tam ad (tarihli)
cat = urllib.request.urlopen(f'{K}/catalog/v2/entries?count=100', timeout=60).read().decode()
for m in re.findall(r'/content/([^"/]+)"', cat):
    kitapTam[kitap(urllib.parse.unquote(m))] = urllib.parse.unquote(m)

sonuc = []
for x in (json.loads(l) for l in open(Y(f'sonuc/{SETAD}_sorgu_1611.jsonl'), encoding='utf-8')):
    no = x['no']
    iyiler = iyi.get(no, [])
    dogru_kitaplar = {k for k, _ in iyiler}
    arandi = [s for s in x.get('sorgular', []) if set(s['kitaplar']) & dogru_kitaplar]
    en_iyi, hangi = None, None
    for s in arandi:
        for kk in set(s['kitaplar']) & dogru_kitaplar:
            for i, yol in enumerate(ara(kitapTam.get(kk, kk), s['sorgu']), 1):
                if eslesir({'kitap': kk, 'makale': yol}, iyiler):
                    if en_iyi is None or i < en_iyi:
                        en_iyi, hangi = i, (s['sorgu'], s['adet'])
                    break
    tur = 'KITAP' if not arandi else 'SINIR' if en_iyi else 'SORGU'
    g = (x.get('gorulen') or [{}])[0]
    en = next((gg for gg in (g.get('gruplar') or []) if gg.get('dil') == 'en'), None)
    dogru = [(b.get('kitap'), b.get('baslik')) for b in (kut.get(no) or {}).get('bolumler', []) if b.get('dogru') in ('EVET', 'KISMEN')]
    sonuc.append({'no': no, 'tur': tur, 'en_iyi_sira': en_iyi, 'sorgu': hangi, 'soru': x['soru'], 'en_soru': en and en.get('soru'),
                  'basliklar_tr': g.get('basliklar'), 'basliklar_en': en and en.get('basliklar'), 'sorgu_sayisi': len(x.get('sorgular', [])),
                  'sorgular': sorted({s['sorgu'] for s in x.get('sorgular', [])}), 'dogru': dogru})
from collections import Counter
print(Counter(s['tur'] for s in sonuc))
json.dump(sonuc, open(Y(f'sonuc/{SETAD}_sorgu_cozum_1611.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for s in sonuc:
    print(f"\n{s['no']} [{s['tur']}{' ' + str(s['en_iyi_sira']) + '. (alınan ' + str(s['sorgu'][1]) + ', sorgu: ' + s['sorgu'][0] + ')' if s['tur'] == 'SINIR' else ''}] {s['soru'][:80]}")
    print(f"   EN: {s['en_soru']}")
    print(f"   başlıklar: tr {s['basliklar_tr']} · en {s['basliklar_en']}")
    print(f"   doğru (ajan): {s['dogru'][:3]}")
    print(f"   sorgular ({s['sorgu_sayisi']}): {s['sorgular'][:12]}")
