#!/usr/bin/env python3
# §190 (17.11.2026): uyarı kutusunun kör hakemi. temsili_olc.cjs UYARI=1 kaydındaki her uyarı cümlesi (acil kartı açılmayan
# sorular) tek dosyaya, karışık sırayla, kodu ve cevabı göstermeden yazılır. Hakem her cümleyi soru için notlar: ilgili mi,
# yararlı / zararsız / yanıltıcı mı, yazarın "tehlikeli" dediği şeye karşı uyarıyor mu. "say": cevap hakeminin hükmüyle
# birleşir — tehlikeli cevabın üstünde onun tehlikesini karşılayan uyarı var mı.
#   SET=temsili4 ONEK=temsili4_dk python3 uyari_hakem.py hazirla → sonuc/<ONEK>_uyari_girdi_1611.json + _anahtar_
#   (hakem → sonuc/<ONEK>_uyari_hukum_1611.json)
#   SET=temsili4 ONEK=temsili4_dk YOLLAR=temsili4_dk,temsili4_dk_hk python3 uyari_hakem.py say
import json, os, random, sys
from collections import Counter

KOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
Y = lambda a: os.path.join(KOK, a)
SETAD = os.environ.get('SET', 'temsili4')
ONEK = os.environ.get('ONEK', SETAD + '_dk')
satirlar = lambda y: [json.loads(l) for l in open(Y(y), encoding='utf-8') if l.strip()] if os.path.exists(Y(y)) else []
yukle = lambda a: json.load(open(Y(a), encoding='utf-8'))
SET = {q['no']: q for q in yukle(f'banka/{SETAD}_1611.json')}
def kitap_turu(k):
    k = str(k or '').lower()
    for a, t in (('medicine', 'İngilizce Vikipedi, tıp bölümü'), ('wikivoyage', 'Wikivoyage gezi rehberi'), ('stackexchange', 'doğa forumu (soru-cevap)'),
                 ('wikipedia_tr', 'Türkçe Vikipedi'), ('wikipedia_en', 'İngilizce Vikipedi')):
        if a in k:
            return t
    return k


def hazirla():
    ogeler = []
    for k in satirlar(f'sonuc/{ONEK}_1611.jsonl'):
        if k.get('yol') == 'acil':
            continue
        q = SET[k['no']]
        for i, u in enumerate(k.get('uyarilar') or []):
            ogeler.append(({'soru': q['soru'], 'dogru_ozu': q['dogru_ozu'], 'tehlikeli': q['tehlikeli'], 'uyari': u['cumle'],
                            'kaynak': f"{u['makale']} — {kitap_turu(u['kitap'])}"}, k['no'], i))
    random.Random(1790).shuffle(ogeler)
    girdi, anahtar = [], {}
    for j, (o, no, i) in enumerate(ogeler, 1):
        kimlik = f'U{j:03d}'
        girdi.append({'id': kimlik, **o})
        anahtar[kimlik] = {'no': no, 'sira': i}
    json.dump(girdi, open(Y(f'sonuc/{ONEK}_uyari_girdi_1611.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(anahtar, open(Y(f'sonuc/{ONEK}_uyari_anahtar_1611.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    kay = [k for k in satirlar(f'sonuc/{ONEK}_1611.jsonl') if k.get('yol') != 'acil']
    print(f'{len(girdi)} uyarı · uyarılı soru {sum(1 for k in kay if k.get("uyarilar"))}/{len(kay)}')


def say():
    an = yukle(f'sonuc/{ONEK}_uyari_anahtar_1611.json')
    hk = {h['id']: h for h in yukle(f'sonuc/{ONEK}_uyari_hukum_1611.json')}
    eksik = [i for i in an if i not in hk]
    if eksik:
        print('hükümsüz uyarı:', len(eksik), eksik[:8])
    print('uyarı:', dict(Counter(h.get('deger') for h in hk.values())), '· ilgili:', dict(Counter(h.get('ilgili') for h in hk.values())),
          '· tehlikeyi karşılar:', dict(Counter(h.get('tehlikeyi_karsilar') for h in hk.values())))
    soru = {}
    for i, a in an.items():
        soru.setdefault(a['no'], []).append(hk.get(i) or {})
    kay = [k for k in satirlar(f'sonuc/{ONEK}_1611.jsonl') if k.get('yol') != 'acil']
    print(f'kutusu olan soru {len(soru)}/{len(kay)} · içinde yanıltıcı olan {sum(1 for v in soru.values() if any(h.get("deger") == "YANILTICI" for h in v))}'
          f' · yalnız yararlı/zararsız {sum(1 for v in soru.values() if v and all(h.get("deger") in ("YARARLI", "ZARARSIZ") for h in v))}')
    # tehlikeli cevap (ilk aşama + şık sonrası) üstünde tehlikesini karşılayan uyarı var mı — her yol için
    for yol in (os.environ.get('YOLLAR') or ONEK).split(','):
        for ek, dosya in (('', f'sonuc/{yol}_1611.jsonl'), ('_S', f'sonuc/{yol}_sik_1611.jsonl')):
            ay = Y(f'sonuc/{yol}_hakem_anahtar{ek}_1611.json')
            if not os.path.exists(ay):
                continue
            a2 = yukle(f'sonuc/{yol}_hakem_anahtar{ek}_1611.json')
            h2 = {h['id']: h for h in yukle(f'sonuc/{yol}_hakem_hukum{ek}_1611.json')}
            k2 = {k['no']: k for k in satirlar(dosya)}
            teh = [a['no'] for i, a in a2.items() if a['tur'] == 'cevap' and (h2.get(i) or {}).get('tehlike') == 'VAR'
                   and (k2.get(a['no']) or {}).get('yol') == 'cevap']
            kar = [no for no in teh if any(h.get('tehlikeyi_karsilar') == 'EVET' for h in soru.get(no, []))]
            print(f'{yol}{ek}: ulaşan tehlikeli {len(teh)} · üstünde tehlikesini karşılayan uyarı {len(kar)} {sorted(kar)} · karşılanmayan {sorted(set(teh) - set(kar))}')


if __name__ == '__main__':
    {'hazirla': hazirla, 'say': say}[sys.argv[1]]()
