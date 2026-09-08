# -*- coding: utf-8 -*-
"""An EPUB and an HTML snapshot long enough to scroll away from (issue #76); stdlib only.

return-key.epub / return-key.html: sixty numbered English paragraphs in one
chapter, so a Read Aloud session can be scrolled several screens, or several
pages in paginated flow, away from the sentence being spoken, and the Go to
reading position key has somewhere to come back from. Every sentence names
its own paragraph, so the voice and the highlight can be matched by ear. The
ro-diacritics EPUB (issue #74) is three paragraphs: nothing to scroll.
Import the .epub as a standalone attachment; the .html as a snapshot.
"""
import html
import os
import zipfile

OUT = os.path.dirname(os.path.abspath(__file__))
COUNT = 60


def paragraph(n):
    last = n == COUNT
    tail = (
        "This is the last paragraph, and the document ends here."
        if last
        else "Paragraph %d ends here, and paragraph %d follows it without a heading." % (n, n + 1)
    )
    return (
        "Paragraph %d of %d. This document exists so that a reader can be scrolled several "
        "screens, or several pages, away from the sentence being spoken, and then be brought back "
        "to it by the Go to reading position key. The sentence you hear names its own paragraph, so "
        "the highlight and the voice can be matched by ear. %s" % (n, COUNT, tail)
    )


paras = [paragraph(n) for n in range(1, COUNT + 1)]
BODY = "\n".join("<p>%s</p>" % html.escape(p) for p in paras)
TITLE = "Zotero-TTS return-key fixture"

# ------------------------------------------------------------------ EPUB
XHTML = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head><meta charset="utf-8"/><title>%s</title></head>
<body>
<h1>%s</h1>
%s
</body>
</html>
""" % (TITLE, TITLE, BODY)

OPF = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:uuid:return-key-fixture-0001</dc:identifier>
<dc:title>%s</dc:title>
<dc:language>en</dc:language>
<dc:creator>Zotero-TTS test</dc:creator>
<meta property="dcterms:modified">2026-09-08T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine><itemref idref="c1"/></spine>
</package>
""" % TITLE

NAV = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><ol><li><a href="ch1.xhtml">Chapter 1</a></li></ol></nav></body>
</html>
"""

CONTAINER = """<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""

epub_path = os.path.join(OUT, "return-key.epub")
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

# ------------------------------------------------------------------ HTML, for a snapshot attachment
HTML = """<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>%s</title>
<style>
body { font-family: Georgia, "Times New Roman", serif; font-size: 16px; line-height: 1.6; max-width: 40em; margin: 2em auto; }
p { margin: 0 0 1em 0; }
</style></head>
<body>
<h1>%s</h1>
%s
</body>
</html>
""" % (TITLE, TITLE, BODY)

html_path = os.path.join(OUT, "return-key.html")
open(html_path, "w", encoding="utf-8", newline="\n").write(HTML)
print("html:", html_path, os.path.getsize(html_path))
