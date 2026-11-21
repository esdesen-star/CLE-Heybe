# Kör arama ajanlarının "doğru" dediği bölümle Heybe'nin bölümünü eşleştirme — kural tek yerde (17.11.2026, §194).
# havuz_say.py ve aday_say.py buradan alır (temsili_bicim_say.py'deki eşleştirmeyle aynı).
import json, os, re, unicodedata


def norm(s):
    s = unicodedata.normalize('NFC', str(s or '')).replace('_', ' ')
    s = re.sub(r'\s+-\s+the great outdoors stack exchange$', '', s.strip(), flags=re.I)
    s = s.split(' — ')[0]
    return re.sub(r'[^\w]+', ' ', s.lower()).strip()


def adlar(b):
    yol = str(b.get('yol') or '')
    son = yol.rstrip('/').split('/')[-1].replace('-', ' ')
    return {x for x in (norm(b.get('baslik')), norm(yol), norm(son)) if len(x) >= 4}


kitap = lambda k: re.sub(r'_20\d\d-\d\d$', '', str(k or ''))


def eslesir(h, iyiler):
    hk, hn = kitap(h['kitap']), norm(h['makale'])
    for ik, ia in iyiler:
        if hk != ik:
            continue
        for a in ia:
            if hn == a or (len(min(hn, a, key=len)) >= 8 and (hn.startswith(a) or a.startswith(hn))):
                return True
    return False


def iyi_bolumler(Y, setad):
    iyi = {}
    for i in (1, 2, 3):
        for x in json.load(open(Y(f'sonuc/{setad}_kutuphane_{i}_1611.json'), encoding='utf-8')):
            iyi[x['no']] = [(kitap(b.get('kitap')), adlar(b)) for b in x.get('bolumler', []) if b.get('dogru') in ('EVET', 'KISMEN')]
    return iyi
