#!/usr/bin/env python3
# §199 DÜZELTME (18.11): "modele gidecek 6" değil, dil körü ilk aşamasının 6'sı (cevabın dilini seçen havuz).
# Çeşitli arama havuz ölçüsünün sayımı (16.11.2026, Özet §185). havuz_olc.cjs'in kaydında her soru × kip (kapali/acik) için:
# modele gidecek 6 bölüm arasında kör arama ajanlarının (temsili_kutuphane_*) "doğru/kısmen doğru" dediği bölüm var mı;
# havuzdaki farklı madde ve kitap sayısı; Wikivoyage ve forumun payı; süre. Eşleştirme temsili_bicim_say.py ile aynı.
import json, os, re, unicodedata
from collections import Counter

KOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
Y = lambda a: os.path.join(KOK, a)


from bolum_esle import norm, adlar, kitap, eslesir   # §194: kural tek yerde


# §193: SET ve ONEK (karne dosyası); varsayılan TM
SETAD = os.environ.get('SET', 'temsili')
ONEK = os.environ.get('ONEK', SETAD)
iyi = {}
ETIKET = os.environ.get('ETIKET', SETAD)   # §207: etiket dosyalarının öneki (ör. acilicerik — 17 acil soru, beş kitap); olmayan dosya atlanır
for i in (1, 2, 3):
    if not os.path.exists(Y(f'sonuc/{ETIKET}_kutuphane_{i}_1611.json')):
        continue
    for x in json.load(open(Y(f'sonuc/{ETIKET}_kutuphane_{i}_1611.json'), encoding='utf-8')):
        iyi[x['no']] = [(kitap(b.get('kitap')), adlar(b)) for b in x.get('bolumler', []) if b.get('dogru') in ('EVET', 'KISMEN')]
HAVUZ = os.environ.get('HAVUZ_DOSYA') or ('sonuc/havuz_1611.jsonl' if SETAD == 'temsili' else f'sonuc/{SETAD}_havuz_1611.jsonl')   # §194
kayit = [json.loads(l) for l in open(Y(HAVUZ), encoding='utf-8') if l.strip()]
k = {(x['no'], x['kip']): x for x in kayit if not x.get('hata')}
nolar = sorted({x['no'] for x in kayit})
karne = json.load(open(Y(f'sonuc/{ONEK}_karne_sonuc_1611.json'), encoding='utf-8')) if os.path.exists(Y(f'sonuc/{ONEK}_karne_sonuc_1611.json')) else {}
print(f'{len(nolar)} soru · hata {sum(1 for x in kayit if x.get("hata"))}')
for kip in ('kapali', 'acik'):
    isabet = [no for no in nolar if (no, kip) in k and any(eslesir(b, iyi.get(no, [])) for b in k[(no, kip)]['bolumler'])]
    secim = [no for no in nolar if karne.get(no, {}).get('hata_kimin') == 'HEYBE_SECIM']
    madde = [len({(b['kitap'], b['makale']) for b in k[(no, kip)]['bolumler']}) for no in nolar if (no, kip) in k]
    kit = Counter(b['kitap'] for no in nolar if (no, kip) in k for b in k[(no, kip)]['bolumler'])
    sn = [k[(no, kip)]['sn'] for no in nolar if (no, kip) in k]
    print(f'\n{kip.upper()}: doğru bölüm havuzda {len(isabet)}/{len(nolar)} · hakemin "Heybe\'nin seçimi" dediğilerde {len([n for n in isabet if n in secim])}/{len(secim)}')
    print(f'  havuzda farklı madde ort. {sum(madde) / len(madde):.1f} · süre ort. {sum(sn) / len(sn):.1f} sn')
    print('  kitap payı (6 bölümden):', {kk.split('_')[0][:20]: v for kk, v in kit.most_common()})
    # §194 odak: doğru bölüm kaçıncı sırada (1 = modelin ilk gördüğü)
    sira = [next(i for i, b in enumerate(k[(no, kip)]['bolumler'], 1) if eslesir(b, iyi.get(no, []))) for no in isabet]
    print(f'  doğru bölüm 1. sırada {sum(1 for x in sira if x == 1)}/{len(nolar)} · ilk 3\'te {sum(1 for x in sira if x <= 3)} · ortalama sıra {sum(sira) / max(1, len(sira)):.2f}')
ka = {no for no in nolar if (no, 'kapali') in k and any(eslesir(b, iyi.get(no, [])) for b in k[(no, 'kapali')]['bolumler'])}
ac = {no for no in nolar if (no, 'acik') in k and any(eslesir(b, iyi.get(no, [])) for b in k[(no, 'acik')]['bolumler'])}
print(f'\nkazanılan {len(ac - ka)}: {sorted(ac - ka)}\nkaybedilen {len(ka - ac)}: {sorted(ka - ac)}')
