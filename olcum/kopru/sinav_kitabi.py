"""Sınav kitapları (06.11.2026 — Ercan'ın fikri, Özet §31): her biri birkaç makalelik, TEK dilde, cevabı bilinen
küçük ZIM kitapları. Amaç: bir dildeki soruya yalnız başka dildeki kitapta olan bilgiyle cevap verebiliyor muyuz?
Kaynak: gerçek Vikipedi makalelerinin ilk paragrafları (CC BY-SA 4.0; her sayfada atıf satırı var).

Kullanım: olcum/.venv/bin/python -I olcum/kopru/sinav_kitabi.py <içerik.json> <çıkış klasörü>
  içerik.json: {"tr": [{"yol", "ad", "paragraflar": [[bölüm, metin], ...]}], "cs": [...], "zh": [...]}
"""
import html
import json
import struct
import sys
import zlib
from datetime import date
from pathlib import Path

from libzim.writer import Creator, Hint, Item, StringProvider

KITAP = {
    "tr": {"dil": "tur", "baslik": "Heybe sınav kitabı — Türkiye'nin büyük şehirleri",
           "aciklama": "Dil köprüsü sınavı: Türkçe Vikipedi'den beş şehrin ilk paragrafları",
           "kaynak": "Kaynak: Türkçe Vikipedi, CC BY-SA 4.0 — Heybe sınav kitabı"},
    "cs": {"dil": "ces", "baslik": "Heybe zkušební kniha — Česko a jeho největší města",
           "aciklama": "Zkouška jazykového mostu: první odstavce z české Wikipedie",
           "kaynak": "Zdroj: česká Wikipedie, CC BY-SA 4.0 — zkušební kniha Heybe"},
    "zh": {"dil": "zho", "baslik": "Heybe 测试书 — 中华人民共和国经济",
           "aciklama": "语言桥测试：中文维基百科的开头段落",
           "kaynak": "来源：中文维基百科，CC BY-SA 4.0 — Heybe 测试书"},
}


def simge():
    """48×48 düz renk PNG (Kiwix kitap simgesi ister)."""
    satir = b"\x00" + bytes([0x8a, 0x5a, 0x2b]) * 48
    ham = zlib.compress(satir * 48)
    def parca(tur, veri):
        return struct.pack(">I", len(veri)) + tur + veri + struct.pack(">I", zlib.crc32(tur + veri) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + parca(b"IHDR", struct.pack(">IIBBBBB", 48, 48, 8, 2, 0, 0, 0))
            + parca(b"IDAT", ham) + parca(b"IEND", b""))


class Sayfa(Item):
    def __init__(self, yol, ad, govde):
        super().__init__()
        self.yol, self.ad, self.govde = yol, ad, govde

    def get_path(self):
        return self.yol

    def get_title(self):
        return self.ad

    def get_mimetype(self):
        return "text/html"

    def get_contentprovider(self):
        return StringProvider(self.govde)

    def get_hints(self):
        return {Hint.FRONT_ARTICLE: True}


def sayfa_html(ad, paragraflar, kaynak, dil):
    govde = "".join(f"<p>{html.escape(t)}</p>" for _, t in paragraflar)
    return (f'<!DOCTYPE html><html lang="{dil}"><head><meta charset="utf-8"><title>{html.escape(ad)}</title></head>'
            f"<body><h1>{html.escape(ad)}</h1>{govde}<p><small>{html.escape(kaynak)}</small></p></body></html>")


def main():
    icerik = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    cikis = Path(sys.argv[2])
    cikis.mkdir(parents=True, exist_ok=True)
    tarih = date.today()
    for kisa, sayfalar in icerik.items():
        k = KITAP[kisa]
        ad = f"heybe_sinav_{kisa}"
        dosya = cikis / f"{ad}_{tarih:%Y-%m}.zim"
        if dosya.exists():
            print(f"{dosya.name} zaten var, atlandı")
            continue
        with Creator(str(dosya)).config_indexing(True, k["dil"]).set_mainpath(sayfalar[0]["yol"]) as c:
            for anahtar, deger in [("Name", ad), ("Title", k["baslik"]), ("Description", k["aciklama"]),
                                   ("Language", k["dil"]), ("Creator", "Vikipedi / Wikipedia"),
                                   ("Publisher", "CLE Heybe"), ("Date", f"{tarih:%Y-%m-%d}"),
                                   ("Tags", "_category:heybe_sinav;_pictures:no;_videos:no;_details:no;_ftindex:yes")]:
                c.add_metadata(anahtar, deger)
            c.add_metadata("Illustration_48x48@1", simge(), mimetype="image/png")
            for s in sayfalar:
                c.add_item(Sayfa(s["yol"], s["ad"], sayfa_html(s["ad"], s["paragraflar"], k["kaynak"], kisa)))
        print(f"{dosya.name}: {dosya.stat().st_size} bayt, {len(sayfalar)} sayfa")


if __name__ == "__main__":
    main()
