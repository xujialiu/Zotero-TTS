# -*- coding: utf-8 -*-
import os, unicodedata, zipfile, html

OUT = os.path.dirname(os.path.abspath(__file__))

S1 = "Această poveste începe într-o dimineață răcoroasă, când țăranii coborau spre târgul din vale."
S2 = "Bătrânul învățător își strângea șalul și număra bănuții rămași."
S3 = "Șoseaua șerpuia printre dealurile împădurite și ajungea la mănăstirea așezată lângă izvor."
BODY = S1 + " " + S2 + " " + S3

M1 = "Unu, acest paragraf folosește semnele cu virgulă dedesubt."
M2 = "Doi, acest paragraf folosește semnele cu sedilă."
M3 = "Trei, acest paragraf este descompus în forma NFD."

# variant 1: comma-below precomposed (as written above, NFC)
p1 = unicodedata.normalize("NFC", M1 + " " + BODY)

# variant 2: cedilla precomposed (legacy) — s/t comma-below swapped for cedilla forms
CEDILLA = {"ș": "ş", "Ș": "Ş", "ț": "ţ", "Ț": "Ţ"}
p2 = "".join(CEDILLA.get(c, c) for c in unicodedata.normalize("NFC", M2 + " " + BODY))

# variant 3: NFD, every diacritic decomposed
p3 = unicodedata.normalize("NFD", M3 + " " + BODY)

paras = [p1, p2, p3]

def cp(s):
    return " ".join("U+%04X" % ord(c) for c in s)

for i, p in enumerate(paras, 1):
    print("P%d len=%d nfc=%s nfd=%s" % (i, len(p), len(unicodedata.normalize("NFC", p)), len(unicodedata.normalize("NFD", p))))
    print("   first 40 cps:", cp(p[:40]))

# --- sentence lengths, for matching the debug lines ---
import re
for i, p in enumerate(paras, 1):
    parts = re.split(r'(?<=\.)\s+', p)
    print("P%d sentences:" % i, [(len(x), x[:24]) for x in parts])

# ------------------------------------------------------------------ EPUB
XHTML = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ro" lang="ro">
<head><meta charset="utf-8"/><title>Fixtura romaneasca</title></head>
<body>
<h1>Fixtura romaneasca</h1>
%s
</body>
</html>
""" % "\n".join("<p>%s</p>" % html.escape(p) for p in paras)

OPF = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="ro">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:uuid:ro-diacritics-fixture-0001</dc:identifier>
<dc:title>Fixtura romaneasca cu diacritice</dc:title>
<dc:language>ro</dc:language>
<dc:creator>Zotero-TTS test</dc:creator>
<meta property="dcterms:modified">2026-09-08T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine><itemref idref="c1"/></spine>
</package>
"""

NAV = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ro" lang="ro">
<head><meta charset="utf-8"/><title>Cuprins</title></head>
<body><nav epub:type="toc" id="toc"><ol><li><a href="ch1.xhtml">Capitolul 1</a></li></ol></nav></body>
</html>
"""

CONTAINER = """<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""

epub_path = os.path.join(OUT, "ro-diacritics.epub")
if os.path.exists(epub_path):
    os.remove(epub_path)
zf = zipfile.ZipFile(epub_path, "w", zipfile.ZIP_DEFLATED)
zi = zipfile.ZipInfo("mimetype")
zi.compress_type = zipfile.ZIP_STORED
zf.writestr(zi, "application/epub+zip")
zf.writestr("META-INF/container.xml", CONTAINER.encode("utf-8"))
zf.writestr("OEBPS/content.opf", OPF.encode("utf-8"))
zf.writestr("OEBPS/nav.xhtml", NAV.encode("utf-8"))
zf.writestr("OEBPS/ch1.xhtml", XHTML.encode("utf-8"))
zf.close()
print("epub:", epub_path, os.path.getsize(epub_path))

# ------------------------------------------------------------------ HTML for the PDF
HTML = """<!DOCTYPE html>
<html lang="ro">
<head><meta charset="utf-8"/><title>Fixtura romaneasca</title>
<style>
@page { size: A4; margin: 20mm; }
body { font-family: "Times New Roman", Times, serif; font-size: 14pt; line-height: 1.7; }
h1 { font-size: 18pt; }
p { margin: 0 0 14pt 0; }
</style></head>
<body>
<h1>Fixtura romaneasca</h1>
%s
</body>
</html>
""" % "\n".join("<p>%s</p>" % html.escape(p) for p in paras)

html_path = os.path.join(OUT, "ro-diacritics.html")
open(html_path, "w", encoding="utf-8").write(HTML)
print("html:", html_path)

# a plain text copy of exactly what the fixtures contain, for later comparison
open(os.path.join(OUT, "paragraphs.txt"), "w", encoding="utf-8").write("\n".join(paras))
