"""Regenerates scroll-performance.epub.

A tall single-section EPUB — 400 paragraphs, about 34 viewports in the
reader's default type size — for `cases/scroll-performance.md`, whose frame
measurements need a document that can absorb a continuous scroll. The other
EPUB fixtures are one viewport tall and cannot.

    python3 test/fixtures/scroll-performance/make.py
"""

import os
import zipfile

N = 400
HERE = os.path.dirname(os.path.abspath(__file__))

paras = "\n".join(
    f"<p>Paragraph {i + 1}. The quick brown fox jumps over the lazy dog, and the "
    "sentence continues for long enough to wrap across several lines in an "
    "ordinary reading viewport so that the document grows tall.</p>"
    for i in range(N)
)

chapter = f"""<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Long</title></head>
<body><h1>Long scrolling fixture</h1>
{paras}
</body></html>"""

opf = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">zotero-tts-scroll-performance</dc:identifier>
<dc:title>Scroll performance fixture</dc:title><dc:language>en</dc:language>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine><itemref idref="ch1"/></spine>
</package>"""

nav = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Nav</title></head>
<body><nav epub:type="toc"><ol><li><a href="ch1.xhtml">Long scrolling fixture</a></li></ol></nav></body></html>"""

container = """<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"""

path = os.path.join(HERE, "scroll-performance.epub")
with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
    # mimetype must be the first entry and stored uncompressed
    z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
    z.writestr("META-INF/container.xml", container)
    z.writestr("OEBPS/content.opf", opf)
    z.writestr("OEBPS/nav.xhtml", nav)
    z.writestr("OEBPS/ch1.xhtml", chapter)

print(path, os.path.getsize(path), "bytes,", N, "paragraphs")
