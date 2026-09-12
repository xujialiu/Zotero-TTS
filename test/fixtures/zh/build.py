# -*- coding: utf-8 -*-
"""A Chinese EPUB for the live checklist (test/zotero-dev/README.md, section 1a):
three sentences under a heading, so a provider that times Chinese by the
character — Fish Audio, issue #89 — can be read against known counts.
Sentence lengths, punctuation included: 16, 24, 11; the heading 6."""
import html, os, zipfile

OUT = os.path.dirname(os.path.abspath(__file__))
TITLE = "中文朗读测试"
SENTENCES = [
    "这是一个用于朗读测试的中文文档。",
    "第二句话稍微长一些，用来观察每个汉字的时间标记。",
    "第三句结束这一段文字。",
]
for s in SENTENCES:
    print(len(s), s)

XHTML = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh" lang="zh">
<head><meta charset="utf-8"/><title>%s</title></head>
<body>
<h1>%s</h1>
<p>%s</p>
</body>
</html>
""" % (html.escape(TITLE), html.escape(TITLE), html.escape("".join(SENTENCES)))

OPF = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:uuid:zh-fixture-0001</dc:identifier>
<dc:title>%s</dc:title>
<dc:language>zh</dc:language>
<dc:creator>Zotero-TTS test</dc:creator>
<meta property="dcterms:modified">2026-09-10T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine><itemref idref="c1"/></spine>
</package>
""" % html.escape(TITLE)

NAV = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh" lang="zh">
<head><meta charset="utf-8"/><title>目录</title></head>
<body><nav epub:type="toc" id="toc"><ol><li><a href="ch1.xhtml">第一章</a></li></ol></nav></body>
</html>
"""

CONTAINER = """<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""

path = os.path.join(OUT, "zh.epub")
with zipfile.ZipFile(path, "w") as z:
    z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
    z.writestr("META-INF/container.xml", CONTAINER, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("OEBPS/content.opf", OPF, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("OEBPS/nav.xhtml", NAV, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("OEBPS/ch1.xhtml", XHTML, compress_type=zipfile.ZIP_DEFLATED)
print("wrote", path)
