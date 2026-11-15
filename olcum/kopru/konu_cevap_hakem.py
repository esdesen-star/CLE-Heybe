#!/usr/bin/env python3
# Sorunun konusu — cevap düzeyi ölçüsünün kör hakemi (15.11.2026 akşam, Özet §152). konu_cevap_olc.cjs'in kayıtlarından
# kullanıcının gördüğü (ya da bekçinin durdurduğu) her Türkçe cevap ve her şık listesi tek bir dosyaya, karışık sırayla
# ve kipi, konuyu, durdurulup durdurulmadığını göstermeden yazılır. Hakem (kodu görmeyen alt ajan) her birine anlam ve
# tehlike hükmü verir; "say" kipte hüküm kayıtlara geri bağlanıp kip kip sayılır.
#   hazirla: python3 olcum/kopru/konu_cevap_hakem.py hazirla A|B  → olcum/sonuc/konu_cevap_hakem_girdi_<set>_1511.json + anahtar
#   say:     python3 olcum/kopru/konu_cevap_hakem.py say           (hakem çıktısı: konu_cevap_hakem_hukum_<set>_1511.json)
import json, random, sys, os
from collections import Counter, defaultdict

KOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SETLER = {'A': ('banka/konu_baslik_1511.json', 'sonuc/konu_cevap_A_1511.jsonl'),
          'B': ('banka/konu_baslik_B_1511.json', 'sonuc/konu_cevap_B_1511.jsonl')}
# her set kendi parçası (A biterken B koşabilsin): _girdi_A, _anahtar_A, _hukum_A …
DOSYA = lambda tur_, ad: os.path.join(KOK, f'sonuc/konu_cevap_hakem_{tur_}_{ad}_1511.json')


def oku(ad):
    set_yol, kayit_yol = SETLER[ad]
    sorular = {q['no']: q for q in json.load(open(os.path.join(KOK, set_yol), encoding='utf-8'))}
    kayitlar = [json.loads(l) for l in open(os.path.join(KOK, kayit_yol), encoding='utf-8') if l.strip()]
    return sorular, kayitlar


def tur(q):
    return q.get('tur') or ('iki_anlam' if q.get('anahtar') else 'kontrol')


def kastedilen(q):
    t = tur(q)
    dogru = ', '.join(q.get('dogru_en') or [])
    yanlis = ', '.join(q.get('yanlis_en') or [])
    if t == 'iki_anlam':
        s = f"Sorudaki \"{q['anahtar']}\" iki anlamlı. Kullanıcı şu anlamı kastediyor (İngilizce ipucu): {dogru}. Öbür anlam (kastedilmeyen): {yanlis}."
    elif t == 'yanlis_konu':
        s = f"Soru tek anlamlı; soruda ne soruluyorsa o kastediliyor (İngilizce ipucu: {dogru}). Cevaba şu alandan içerik karışmamalı: {yanlis}."
    else:
        s = f"Soru tek anlamlı; soruda ne soruluyorsa o kastediliyor (İngilizce ipucu: {dogru})."
    return s + (f" Not: {q['not']}" if q.get('not') else '')


def kipler(k):
    # U0 aynı yolsa U1'in kaydı onun da kaydıdır
    u1 = k.get('U1') or {}
    u0 = u1 if (k.get('U0') or {}).get('ayniYol') else (k.get('U0') or {})
    return {'U0': u0, 'U1': u1}


def hazirla(ad):
    ogeler, anahtar = {}, {}
    sorular, kayitlar = oku(ad)
    for k in kayitlar:
        q = sorular[k['no']]
        for kip, r in kipler(k).items():
            if r.get('yol') in ('cevap', 'durdu') and r.get('cevap'):
                icerik = ('cevap', r['cevap'].strip())
            elif r.get('yol') == 'sik' and r.get('secenekler'):
                icerik = ('secenekler', tuple(r['secenekler']))
            else:
                continue
            anah = (ad, k['no'], icerik)
            ogeler.setdefault(anah, {'soru': q['soru'], 'kastedilen': kastedilen(q), icerik[0]: list(icerik[1]) if icerik[0] == 'secenekler' else icerik[1]})
            anahtar.setdefault(anah, []).append(kip)
    sira = list(ogeler)
    random.Random(1511).shuffle(sira)
    girdi, harita = [], {}
    for i, a in enumerate(sira, 1):
        kimlik = f'{ad}{i:03d}'
        girdi.append({'id': kimlik, **ogeler[a]})
        harita[kimlik] = {'set': a[0], 'no': a[1], 'kipler': anahtar[a]}
    json.dump(girdi, open(DOSYA('girdi', ad), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(harita, open(DOSYA('anahtar', ad), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{len(girdi)} öğe ({sum(1 for g in girdi if "cevap" in g)} cevap, {sum(1 for g in girdi if "secenekler" in g)} şık listesi) → {DOSYA("girdi", ad)}')


def hazirla_sik(ad):
    # konu_sik_olc.cjs'in şıktan sonraki cevapları (doğru şık seçilmiş sayıldı): aynı kör biçim, kimlik S<set>NNN
    sorular, _ = oku(ad)
    kayit = [json.loads(l) for l in open(os.path.join(KOK, f'sonuc/konu_sik_{ad}_1511.jsonl'), encoding='utf-8') if l.strip()]
    ogeler, anahtar = {}, {}
    for r in kayit:
        if r.get('tip') != 'sik' or r.get('yol') not in ('cevap', 'durdu') or not r.get('cevap'):
            continue
        q = sorular[r['no']]
        anah = (r['no'], r['cevap'].strip())
        ogeler.setdefault(anah, {'soru': q['soru'], 'kastedilen': kastedilen(q), 'cevap': r['cevap'].strip()})
        anahtar.setdefault(anah, []).append(r['kip'])
    sira = list(ogeler)
    random.Random(15112).shuffle(sira)
    girdi, harita = [], {}
    for i, a in enumerate(sira, 1):
        kimlik = f'S{ad}{i:03d}'
        girdi.append({'id': kimlik, **ogeler[a]})
        harita[kimlik] = {'set': ad, 'no': a[0], 'kipler': anahtar[a]}
    json.dump(girdi, open(DOSYA('girdi', 'S' + ad), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(harita, open(DOSYA('anahtar', 'S' + ad), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{len(girdi)} şıktan sonraki cevap → {DOSYA("girdi", "S" + ad)}')


def say():
    hukum, harita = {}, {}
    hazir = [ad for ad in SETLER if os.path.exists(DOSYA('hukum', ad))]
    print('hükmü olan setler:', ', '.join(hazir))
    for ad in hazir:
        hukum.update({h['id']: h for h in json.load(open(DOSYA('hukum', ad), encoding='utf-8'))})
        harita.update(json.load(open(DOSYA('anahtar', ad), encoding='utf-8')))
    eksik = [i for i in harita if i not in hukum]
    if eksik:
        print('hükümsüz öğe:', len(eksik), eksik[:10])
    # (set, no, kip, içerik türü) → hüküm
    bag = {}
    for i, h in harita.items():
        for kip in h['kipler']:
            bag[(h['set'], h['no'], kip)] = hukum.get(i)
    kayitlar = []
    for ad in hazir:
        sorular, kk = oku(ad)
        for k in kk:
            k['_set'] = ad
            k['_tur'] = tur(sorular[k['no']])
        kayitlar += kk
    print(f'{len(kayitlar)} soru · köprüye uğrayan (U1): {sum(1 for k in kayitlar if not (k.get("U0") or {}).get("ayniYol"))}')
    for alt in ('hepsi', 'kopru'):
        print(f'\n=== {"bütün sorular" if alt == "hepsi" else "yalnız U1 köprüye uğrayanlar"} ===')
        secim = [k for k in kayitlar if alt == 'hepsi' or not (k.get('U0') or {}).get('ayniYol')]
        for t in ('iki_anlam', 'yanlis_konu', 'kontrol', 'TOPLAM'):
            grup = [k for k in secim if t == 'TOPLAM' or k['_tur'] == t]
            if not grup:
                continue
            for kip in ('U0', 'U1'):
                c = Counter()
                for k in grup:
                    r = kipler(k)[kip]
                    yol = r.get('yol', 'hata')
                    h = bag.get((k['_set'], k['no'], kip))
                    if yol == 'cevap' and h:
                        c['gösterildi'] += 1
                        c[f'gösterildi·{h.get("anlam")}'] += 1
                        if h.get('tehlike') == 'VAR':
                            c['gösterildi·TEHLİKELİ'] += 1
                    elif yol == 'durdu' and h:
                        c['durdu'] += 1
                        c[f'durdu·{h.get("anlam")}'] += 1
                    elif yol == 'sik' and h:
                        c['şık'] += 1
                        c[f'şık·doğru var {h.get("anlam")}'] += 1
                    else:
                        c[yol] += 1
                print(f'{t:11} {kip}: ' + ' · '.join(f'{a} {b}' for a, b in sorted(c.items())))
    # ikinci göz deneyi: köprü cevabı, öbür bekçilere takılmadı
    print('\n=== ikinci göz (köprü cevabı, öbür bekçiler geçti) ===')
    for kip in ('U0', 'U1'):
        c = Counter()
        for k in kayitlar:
            r = kipler(k)[kip]
            g = r.get('goz')
            if not g or (kip == 'U0' and (k.get('U0') or {}).get('ayniYol')):
                continue
            h = bag.get((k['_set'], k['no'], kip)) or {}
            for v in ('G0', 'G1', 'G2'):
                if g.get(v) in ('gecti', 'durdu'):
                    c[f'{v} geçirdi·{h.get("anlam")}' if g[v] == 'gecti' else f'{v} durdurdu·{h.get("anlam")}'] += 1
                    if g[v] == 'gecti' and h.get('tehlike') == 'VAR':
                        c[f'{v} geçirdi·TEHLİKELİ'] += 1
        print(f'{kip}: ' + ' · '.join(f'{a} {b}' for a, b in sorted(c.items())))


def ozet():
    # kullanıcıya ne ulaşır — şık çıkınca kullanıcı hakemin doğru dediği şıkkı seçer (üst sınır); şıkta doğru yoksa "doğru şık yok"
    hukum, harita = {}, {}
    for ad in [x for x in SETLER] + ['S' + x for x in SETLER]:
        if os.path.exists(DOSYA('hukum', ad)):
            hukum.update({h['id']: h for h in json.load(open(DOSYA('hukum', ad), encoding='utf-8'))})
            harita.update({i: {**h, 'parca': ad} for i, h in json.load(open(DOSYA('anahtar', ad), encoding='utf-8')).items()})
    bag = {}
    for i, h in harita.items():
        for kip in h['kipler']:
            bag[(h['parca'], h['no'], kip)] = hukum.get(i)
    sonuc = defaultdict(Counter)
    gozler = defaultdict(Counter)
    for ad in SETLER:
        if not os.path.exists(DOSYA('hukum', ad)):
            continue
        sorular, kayitlar = oku(ad)
        sik_yol = os.path.join(KOK, f'sonuc/konu_sik_{ad}_1511.jsonl')
        sik = {}
        if os.path.exists(sik_yol):
            for l in open(sik_yol, encoding='utf-8'):
                if l.strip():
                    x = json.loads(l)
                    sik[(x['tip'], x['no'], x['kip'])] = x
        for k in kayitlar:
            t_ = tur(sorular[k['no']])
            kopru_sorusu = not (k.get('U0') or {}).get('ayniYol')
            for kip in ('U0', 'U1'):
                r = kipler(k)[kip]
                ayni = kip == 'U0' and not kopru_sorusu
                h = bag.get((ad, k['no'], 'U1' if ayni else kip)) if ayni else bag.get((ad, k['no'], kip))
                yol = r.get('yol', 'hata')
                if yol == 'cevap':
                    son = f'gösterildi·{h.get("anlam") if h else "?"}'
                    tehlike = h and h.get('tehlike') == 'VAR'
                elif yol == 'durdu':
                    son, tehlike = f'durdu·{h.get("anlam") if h else "?"}', False
                elif yol == 'sik':
                    if not h or h.get('anlam') != 'VAR':
                        son, tehlike = 'şık·doğru şık yok', False
                    else:
                        s = sik.get(('sik', k['no'], 'U1' if ayni else kip))
                        if not s:
                            son, tehlike = 'şık·seçim koşulmadı', False
                        elif s.get('yol') == 'bilgiYok':
                            son, tehlike = 'şık→bilgi yok', False
                        else:
                            hs = bag.get(('S' + ad, k['no'], 'U1' if ayni else kip)) or {}
                            son = f'şık→{"gösterildi" if s.get("yol") == "cevap" else "durdu"}·{hs.get("anlam", "?")}'
                            tehlike = s.get('yol') == 'cevap' and hs.get('tehlike') == 'VAR'
                            if s.get('goz') and kip == 'U1':
                                for v in ('G0', 'G1', 'G2'):
                                    if s['goz'].get(v) in ('gecti', 'durdu'):
                                        gozler[v][f'{"geçirdi" if s["goz"][v] == "gecti" else "durdurdu"}·{hs.get("anlam", "?")}{"·TEHLİKELİ" if hs.get("tehlike") == "VAR" else ""}'] += 1
                else:
                    son, tehlike = yol, False
                for grup in (t_, 'TOPLAM') + (('köprü·' + t_, 'köprü·TOPLAM') if kopru_sorusu else ()):
                    sonuc[(grup, kip)][son] += 1
                    if tehlike:
                        sonuc[(grup, kip)]['ULAŞAN TEHLİKELİ'] += 1
            # doğrudan köprü cevabının ikinci gözü (U1)
            r1 = k.get('U1') or {}
            if r1.get('goz'):
                h = bag.get((ad, k['no'], 'U1')) or {}
                for v in ('G0', 'G1', 'G2'):
                    if r1['goz'].get(v) in ('gecti', 'durdu'):
                        gozler[v][f'{"geçirdi" if r1["goz"][v] == "gecti" else "durdurdu"}·{h.get("anlam", "?")}{"·TEHLİKELİ" if h.get("tehlike") == "VAR" else ""}'] += 1
    for (grup, kip), c in sorted(sonuc.items()):
        print(f'{grup:20} {kip}: ' + ' · '.join(f'{a} {b}' for a, b in sorted(c.items())))
    print('\nikinci göz, U1 köprü cevapları (doğrudan + şıktan sonra; öbür bekçiler geçti):')
    for v, c in sorted(gozler.items()):
        print(f'  {v}: ' + ' · '.join(f'{a} {b}' for a, b in sorted(c.items())))


if __name__ == '__main__':
    if sys.argv[1] == 'hazirla':
        hazirla(sys.argv[2])
    elif sys.argv[1] == 'hazirla_sik':
        hazirla_sik(sys.argv[2])
    elif sys.argv[1] == 'ozet':
        ozet()
    else:
        say()
