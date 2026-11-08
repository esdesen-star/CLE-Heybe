"""Belleğin başlangıç sayfasını derler: heybe/sayfa.html + heybe/arkadas.js → heybe/index.html (tek dosya).
kiwix-serve --customIndex tek dosya kabul ettiği için arkadaş sayfanın içine gömülür.
Kullanım: python3 tasinabilir/sayfa_derle.py
"""
from pathlib import Path

H = Path(__file__).resolve().parent / "usb_kok" / "heybe"
sayfa = (H / "sayfa.html").read_text(encoding="utf-8")
js = (H / "arkadas.js").read_text(encoding="utf-8")
assert "</script" not in js.lower(), "arkadas.js içinde </script geçiyor, sayfayı bozar"
assert sayfa.count("<!--ARKADAS_JS-->") == 1
(H / "index.html").write_text(sayfa.replace("<!--ARKADAS_JS-->", "<script>\n" + js + "</script>"), encoding="utf-8")
print("index.html:", (H / "index.html").stat().st_size, "bayt")
