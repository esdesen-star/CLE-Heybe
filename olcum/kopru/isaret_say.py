# §216 (20.11.2026): işaretleme ölçüsünün sayımı — önceden yazılan ölçüte göre (sonuçlar görülmeden yazıldı).
# Girdi: sonuc/kaynak_goz/isaret_ogeler.json (isaret_olc.cjs) + isaret_harita.json (kör kimlik → öğe)
#        + isaret_hakem_A.json, isaret_hakem_B.json (paragraflı kör hakemler) + isaret_hakem_T.json (yalnız başlık: taban)
# Kullanım: python3 -I olcum/kopru/isaret_say.py [ayrinti]
import json, os, sys
K = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sonuc', 'kaynak_goz')
oku = lambda f: json.load(open(os.path.join(K, f)))
L = oku('isaret_ogeler.json')
harita = oku('isaret_harita.json')
ters = {(v['d'], v['id']): k for k, v in harita.items()}
ayrinti = len(sys.argv) > 1 and sys.argv[1] == 'ayrinti'

def hakem(ad):
    h = {}
    for r in oku(f'isaret_hakem_{ad}.json'):
        h[(r['oge'], int(r['n']))] = r
    return h

def notlar(x, h):
    j = ters[(x['d'], x['id'])]
    return [(z, h.get((j, z['n']))) for z in x['notlar']]

DK = [x for x in L if x['d'] == 'K' and x['sinif'] in ('D', 'K')]
DOGRU = [x for x in L if x['d'] == 'N' and x['hukum'] == 'doğru']
NTEH = [x for x in L if x['d'] == 'N' and x['hukum'] == 'tehlikeli']
KDIGER = [x for x in L if x['d'] == 'K' and x['sinif'] not in ('D', 'K')]
T = hakem('T')

def yakaladi(x, h, alan='kn'):
    return any(r and r.get('gorunur') == 'evet' for z, r in notlar(x, h) if z['n'] in x[alan])

def say(ad):
    h = hakem(ad)
    eksik = sum(1 for x in (L if ad == 'A' else DK + DOGRU) for z, r in notlar(x, h) if r is None)
    yak = [x for x in DK if yakaladi(x, h)]
    yak2 = [x for x in DK if yakaladi(x, h, 'kn2')]
    taban = [x for x in DK if yakaladi(x, T)]
    ulasan = [x for x in DK if x['ulasti']]
    bos = [x for x in DOGRU if any(r and r.get('gorunur') == 'evet' for z, r in notlar(x, h))]
    bos_gercek = [x for x in DOGRU if any(r and r.get('gorunur') == 'evet' and r.get('gercek') == 'ayni' for z, r in notlar(x, h))]
    dn = [(z, r) for x in DOGRU for z, r in notlar(x, h) if r]
    yanlis = [p for p in dn if p[1].get('sadakat') == 'yanlis']
    sahte = [x for x in DK if any(r and r.get('sadakat') == 'yanlis' and r.get('gorunur') == 'hayir' and r.get('gercek') == 'farkli'
                                  for z, r in notlar(x, h) if z['n'] in x['kn'])]
    tbos = [x for x in DOGRU if any(r and r.get('gorunur') == 'evet' for z, r in notlar(x, T))]
    o1 = len(yak) >= 17 and len(yak) - len(taban) >= 8
    o2 = len(bos) <= 13
    o3 = len(yanlis) <= 0.05 * len(dn) and len(sahte) <= 3
    print(f'— Hakem {ad} (kaydı olmayan not {eksik})')
    print(f'  1. yakalama D+K: {len(yak)}/{len(DK)} (kn2 ile {len(yak2)}) · taban (yalnız başlık) {len(taban)}/{len(DK)} · fark {len(yak) - len(taban)} → {"TUTTU" if o1 else "tutmadı"}')
    print(f'     ulaşan D+K: {sum(1 for x in yak if x["ulasti"])}/{len(ulasan)} · taban {sum(1 for x in taban if x["ulasti"])}/{len(ulasan)}')
    print(f'  2. boş alarm doğru: {len(bos)}/{len(DOGRU)} (durum gerçekte aynıyken {len(bos_gercek)}) · taban {len(tbos)}/{len(DOGRU)} → {"TUTTU" if o2 else "tutmadı"}')
    print(f'  3. yanıltıcı: doğru cevap notlarında sadakat yanlış {len(yanlis)}/{len(dn)} ({100 * len(yanlis) / max(1, len(dn)):.1f}%) · D+K sahte güvence {len(sahte)}/{len(DK)} → {"TUTTU" if o3 else "tutmadı"}')
    sad = {}
    for x in (L if ad == 'A' else DK + DOGRU):
        for z, r in notlar(x, h):
            if r: sad[r.get('sadakat')] = sad.get(r.get('sadakat'), 0) + 1
    print(f'     sadakat (bütün notlar): {sad}')
    if ad == 'A':
        ny = [x for x in NTEH if any(r and r.get('gorunur') == 'evet' for z, r in notlar(x, h))]
        nf = [x for x in NTEH if any(r and r.get('gercek') == 'farkli' for z, r in notlar(x, h))]
        ky = [x for x in KDIGER if any(r and r.get('gorunur') == 'evet' for z, r in notlar(x, h))]
        print(f'     N tehlikeli: başka durum dedirten not {len(ny)}/{len(NTEH)} · hakeme göre başka durum paragrafı olan {len(nf)}/{len(NTEH)}')
        print(f'     K öbür sınıflar (A/B/E/Y): başka durum dedirten not {len(ky)}/{len(KDIGER)}')
    if ayrinti:
        for x in DK:
            for z, r in notlar(x, h):
                if z['n'] in x['kn']:
                    print(f'    {x["id"]} {"ULAŞTI" if x["ulasti"] else "durdu "} [{z["n"]}] {(r or {}).get("gercek")}/{(r or {}).get("sadakat")}/{(r or {}).get("gorunur")} · {x["soru"][:50]} | {z["not"][:90]} | {(r or {}).get("kisa", "")}')
        for x in bos:
            for z, r in notlar(x, h):
                if r and r.get('gorunur') == 'evet':
                    print(f'    BOŞ {x["no"]} [{z["n"]}] {r.get("gercek")}/{r.get("sadakat")} · {x["soru"][:50]} | {z["not"][:90]} | {r.get("kisa", "")}')
    return o1 and o2 and o3, h

sonuc = {}
for ad in ('A', 'B'):
    if os.path.exists(os.path.join(K, f'isaret_hakem_{ad}.json')):
        sonuc[ad] = say(ad)
if len(sonuc) == 2:
    a, b = sonuc['A'][1], sonuc['B'][1]
    ort = [(a[k], b[k]) for k in a if k in b]
    uy = sum(1 for x, y in ort if x.get('gorunur') == y.get('gorunur'))
    uyg = sum(1 for x, y in ort if x.get('gercek') == y.get('gercek'))
    print(f'— A ↔ B ortak {len(ort)} not: görünür uyuşma {uy} · gerçek uyuşma {uyg}')
    print('ÖLÇÜT:', 'TUTTU (A ve B)' if all(v[0] for v in sonuc.values()) else 'TUTMADI')
