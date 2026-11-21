# §210: cevabın cümleleri forum sayfasının hangi bloğuna dayanıyor — soru, yanıt (kabul edilen?), yorum
import json, os, re, sys, html, urllib.parse, urllib.request
from html.parser import HTMLParser
K = 'http://127.0.0.1:18890'; B = 'outdoors.stackexchange.com_en_all_2026-10'
SON = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sonuc') + os.sep   # 21.11: kişisel yol yayın izine takıldı

def al(u):
    with urllib.request.urlopen(u, timeout=60) as y: return y.read().decode('utf-8', 'replace')

class Blok(HTMLParser):
    def __init__(s):
        super().__init__(); s.yigin = []; s.bloklar = []; s.tampon = None
    def handle_starttag(s, t, a):
        c = dict(a).get('class', '') or ''
        etiket = None
        if 'accepted-answer' in c: etiket = 'yanıt_kabul'
        elif re.search(r'(^|\s)answer(\s|$)', c): etiket = 'yanıt'
        elif re.search(r'(^|\s)question(\s|$)', c): etiket = 'soru'
        elif 'comment-copy' in c: etiket = 'yorum'
        elif 'js-post-body' in c: etiket = 'govde'
        if t in ('br', 'img', 'hr', 'input', 'meta', 'link'): return
        s.yigin.append((t, etiket))
        if etiket in ('yorum', 'govde'): s.tampon = []
    def handle_endtag(s, t):
        while s.yigin:
            tt, e = s.yigin.pop()
            if e in ('yorum', 'govde') and s.tampon is not None:
                tur = 'yorum' if e == 'yorum' else next((x for _, x in reversed(s.yigin) if x in ('yanıt_kabul', 'yanıt', 'soru')), 'govde')
                s.bloklar.append((tur, ' '.join(s.tampon))); s.tampon = None
            if tt == t: break
    def handle_data(s, d):
        if s.tampon is not None: s.tampon.append(d)

def kelime(m): return set(w for w in re.findall(r'[a-z]{4,}', m.lower()))
sayfa_onbellek = {}
def sayfa(baslik):
    if baslik in sayfa_onbellek: return sayfa_onbellek[baslik]
    q = urllib.parse.urlencode({'books.name': B, 'pattern': baslik.split(' - The Great')[0], 'pageLength': 5, 'format': 'xml'})
    x = al(f'{K}/search?{q}'); yol = None
    for it in re.findall(r'<item>(.*?)</item>', x, re.S):
        t = html.unescape(re.sub(r'<[^>]+>', '', re.search(r'<title>(.*?)</title>', it, re.S).group(1))).strip()
        l = html.unescape(re.search(r'<link>(.*?)</link>', it, re.S).group(1))
        if t and baslik.startswith(t[:40]): yol = re.sub(r'^.*/content/[^/]+/', '', l); break
    bl = []
    if yol:
        p = Blok(); p.feed(al(f'{K}/raw/{B}/content/{yol}')); bl = p.bloklar
    sayfa_onbellek[baslik] = bl; return bl

def cumleler(m):
    m = re.sub(r'\[\d+(,\s*\d+)*\]', ' ', m)
    return [c.strip() for c in re.split(r'(?<=[.!?])\s+|\n+|\s\*\s', m) if len(kelime(c)) >= 3]

def esle(cevap, makaleler):
    bl = [b for mk in makaleler for b in sayfa(mk)]
    sonuc = []
    for c in cumleler(cevap):
        k = kelime(c); en, tur = 0, 'eşleşmedi'
        for t, metin in bl:
            o = len(k & kelime(metin)) / len(k)
            if o > en: en, tur = o, t
        sonuc.append(tur if en >= 0.6 else 'eşleşmedi')
    return sonuc

if __name__ == '__main__':
    import collections
    for yol in sys.argv[1:]:
        so = json.load(open(SON + f'{yol}_sonuc_1611.json'))
        r = {json.loads(l)['no']: json.loads(l) for l in open(SON + f'{yol}_1611.jsonl')}
        rs = {json.loads(l)['no']: json.loads(l) for l in open(SON + f'{yol}_sik_1611.jsonl')}
        top = {'TEHLİKELİ': collections.Counter(), 'DOĞRU': collections.Counter()}; satir = []
        for no, v in so.items():
            son = v['sonuc'].split('·')[-1]
            if son not in top or 'ulaştı' not in v['sonuc']: continue
            x = rs.get(no) if 'şık' in v['sonuc'] else r.get(no)
            mk = [i['makale'] for i in (x or {}).get('ilk', []) if 'outdoors' in i['kitap']]
            if not mk: continue
            e = esle(x['cevap'], mk); top[son].update(e)
            satir.append((son, no, collections.Counter(e)))
        print('==', yol)
        for s, no, c in satir: print('  ', s, no, dict(c))
        for s, c in top.items(): print('  TOPLAM', s, dict(c))
