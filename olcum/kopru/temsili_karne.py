#!/usr/bin/env python3
# Heybe'nin karnesi ve kütüphanenin karnesi (16.11.2026, Özet §170; Ercan: "cevap yanlış mı sorusundan önce cevap soru ile
# ilgili mi kaynakta doğrusu var mı veya bir kaç cevap var mı"). Girdiler:
#   temsili_parca_1611.jsonl        — Heybe'nin yeniden sorulmuş cevabı + dayandığı paragrafların metni (temsili_parca.cjs)
#   temsili_kutuphane_{1,2,3}_1611.json — kodu ve Heybe'nin cevabını görmeyen ajanların kütüphane araması
# hazirla: kör hakem için iki parça dosya (yol, durma, köprü gösterilmez) → temsili_karne_girdi_{1,2}_1611.json + anahtar
# say:     hakemin hükmü (temsili_karne_hukum_{1,2}_1611.json) + Heybe'nin yolu → sayım, temsili_karne_sonuc_1611.json
import json, os, random, re, sys
from collections import Counter

KOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
Y = lambda a: os.path.join(KOK, a)
# §192: SET (soru bankası ve kör aramanın dosyaları) ve ONEK (Heybe'nin yolu: parça, karne dosyaları); varsayılan TM
SETAD = os.environ.get('SET', 'temsili')
ONEK = os.environ.get('ONEK', SETAD)
SET = {q['no']: q for q in json.load(open(Y(f'banka/{SETAD}_1611.json'), encoding='utf-8'))}
satirlar = lambda y: [json.loads(l) for l in open(Y(y), encoding='utf-8') if l.strip()]


def kutuphane():
    k = {}
    for i in (1, 2, 3):
        y = Y(f'sonuc/{SETAD}_kutuphane_{i}_1611.json')
        if os.path.exists(y):
            k.update({x['no']: x for x in json.load(open(y, encoding='utf-8'))})
    return k


def atif(cevap):
    return sorted({int(n) for g in re.findall(r'\[([\d,\s]+)\]', cevap or '') for n in re.findall(r'\d+', g)})


def paragraflar(r):
    # cevabın andığı paragraflar önce, sonra en çok iki tane daha; her biri 1200 karakter
    p = r.get('parcalar') or []
    anilan = [x for x in p if x['n'] in atif(r.get('ozgun') or r.get('cevap'))]
    obur = [x for x in p if x not in anilan][:2]
    return [{'n': x['n'], 'kaynak': f"{x['kitap']} · {x['makale']}" + (f" · {x['bolum']}" if x.get('bolum') else ''),
             'metin': (x['metin'] or '')[:1200]} for x in anilan + obur]


def heybe_yolu(x):
    # kullanıcıya ne gösterildi: (tür, cevap kaydı)
    r = x.get('ilk') or {}
    if r.get('yol') in ('cevap', 'durdu'):
        return 'cevap', r
    if r.get('yol') == 'sik':
        s = x.get('secimden')
        if s and s.get('yol') in ('cevap', 'durdu'):
            return 'sikten_cevap', s
        if s:
            return 'sikten_' + s.get('yol', 'yok'), s
        return 'sik_dogru_yok', r
    return r.get('yol', 'hata'), r


def hazirla():
    kut = kutuphane()
    ogeler = []
    for x in satirlar(f'sonuc/{ONEK}_parca_1611.jsonl'):
        q = SET[x['no']]
        tur, r = heybe_yolu(x)
        o = {'soru': q['soru'], 'dogru_ozu': q['dogru_ozu'], 'tehlikeli': q['tehlikeli'],
             'kutuphanede_bulunan': [{k: b.get(k) for k in ('kitap', 'baslik', 'ne_diyor', 'dogru')} for b in (kut.get(x['no']) or {}).get('bolumler', [])],
             'kutuphane_celiski': (kut.get(x['no']) or {}).get('celiski_aciklama', '')}
        if tur in ('cevap', 'sikten_cevap'):
            o['tur'] = 'cevap'
            o['heybe_cevabi'] = r.get('cevap', '').strip()
            o['heybenin_kullandigi_paragraflar'] = paragraflar(r)
        elif tur == 'sik_dogru_yok' or tur.startswith('sikten_'):
            o['tur'] = 'secenekler'
            o['heybenin_sundugu_secenekler'] = [s['etiket'] for s in (x['ilk'].get('secenekler') or [])]
        else:
            o['tur'] = 'cevapsiz'
        ogeler.append((o, x['no'], tur))
    random.Random(161170).shuffle(ogeler)
    yarim = (len(ogeler) + 1) // 2
    anahtar = {}
    for parca, dilim in ((1, ogeler[:yarim]), (2, ogeler[yarim:])):
        girdi = []
        for i, (o, no, tur) in enumerate(dilim, 1):
            kimlik = f'K{parca}{i:02d}'
            girdi.append({'id': kimlik, **o})
            anahtar[kimlik] = {'no': no, 'heybe_yolu': tur}
        json.dump(girdi, open(Y(f'sonuc/{ONEK}_karne_girdi_{parca}_1611.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(parca, len(girdi), 'öğe', Counter(g['tur'] for g in girdi), sum(len(json.dumps(g, ensure_ascii=False)) for g in girdi), 'karakter')
    json.dump(anahtar, open(Y(f'sonuc/{ONEK}_karne_anahtar_1611.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def say():
    anahtar = json.load(open(Y(f'sonuc/{ONEK}_karne_anahtar_1611.json'), encoding='utf-8'))
    hukum = {}
    for p in (1, 2):
        y = Y(f'sonuc/{ONEK}_karne_hukum_{p}_1611.json')
        if os.path.exists(y):
            hukum.update({h['id']: h for h in json.load(open(y, encoding='utf-8'))})
    parca = {x['no']: x for x in satirlar(f'sonuc/{ONEK}_parca_1611.jsonl')}
    kut = kutuphane()
    sonuc = {}
    for i, a in anahtar.items():
        h = hukum.get(i) or {}
        no = a['no']
        tur, r = heybe_yolu(parca[no])
        durdu = r.get('yol') == 'durdu'
        sonuc[no] = {'heybe_yolu': tur, 'durdu': durdu, 'kutuphane_var': (kut.get(no) or {}).get('var'),
                     'kutuphane_celiski': (kut.get(no) or {}).get('celiski'), **{k: v for k, v in h.items() if k != 'id'}}
    n = len(sonuc)
    print(f'{n} soru (acil kartı açılmayanlar)\n')
    print('KÜTÜPHANENİN KARNESİ — bu soruyu doğru cevaplayan bölüm var mı (kör arama):', dict(Counter(v['kutuphane_var'] for v in sonuc.values())))
    print('  kütüphane kendi içinde çelişiyor:', sum(v['kutuphane_celiski'] == 'EVET' for v in sonuc.values()))
    print('\nHEYBE\'NİN YOLU:', dict(Counter(v['heybe_yolu'] + ('·durdu' if v['durdu'] else '') for v in sonuc.values())))
    for alan in ('ilgili', 'en_uygun', 'sadik', 'anlam', 'tehlike', 'hata_kimin', 'tek_yan'):
        print(f'  {alan}:', dict(Counter(v.get(alan) for v in sonuc.values())))
    print('\nkullanıcıya ulaşan cevaplarda (durmayan) hatanın sahibi:')
    ul = [v for v in sonuc.values() if v['heybe_yolu'] in ('cevap', 'sikten_cevap') and not v['durdu']]
    print(f'  {len(ul)} cevap ·', dict(Counter(v.get('hata_kimin') for v in ul)))
    print('  tehlikeli ulaşanlar:', [(no, v.get('hata_kimin')) for no, v in sonuc.items() if v in ul and v.get('tehlike') == 'VAR'])
    print('\nkütüphanede doğrusu VARKEN kullanıcıya doğru cevap ulaşmayanlar (Heybe\'nin kaçırdığı fayda):')
    kac = [no for no, v in sonuc.items() if v['kutuphane_var'] == 'EVET' and not (v in ul and v.get('anlam') == 'DOĞRU')]
    print(f'  {len(kac)} →', ', '.join(f'{no} ({sonuc[no]["heybe_yolu"]}{"·durdu" if sonuc[no]["durdu"] else ""}; {sonuc[no].get("hata_kimin")})' for no in kac))
    json.dump(sonuc, open(Y(f'sonuc/{ONEK}_karne_sonuc_1611.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    {'hazirla': hazirla, 'say': say}[sys.argv[1]]()
