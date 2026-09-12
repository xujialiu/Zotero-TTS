"""Build the small, offline EPUB used for issue #94's live checks."""
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED, ZIP_DEFLATED
from html import escape

paragraphs = [
    '<Hello world>.',
    '“<The quick brown fox jumps over the lazy dog>!”',
    '<The next sentence keeps its words and punctuation.>',
    'Ordinary text with a < comparison stays intact.',
    '<Only the opening bracket stays intact.',
    '<>',
    '<The final sentence continues after the empty pair>.',
]
chapter = '''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head><title>Angle bracket fixture</title></head>
<body>''' + ''.join('<p>' + escape(p) + '</p>' for p in paragraphs) + '</body></html>'
with ZipFile(Path(__file__).with_name('angle-brackets.epub'), 'w', ZIP_DEFLATED) as z:
    z.writestr('mimetype', 'application/epub+zip', compress_type=ZIP_STORED)
    z.writestr('META-INF/container.xml', '''<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles>
<rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>''')
    z.writestr('content.opf', '''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">ztts-issue-94</dc:identifier>
<dc:title>Angle bracket fixture</dc:title><dc:language>en</dc:language>
<meta property="dcterms:modified">2026-09-12T00:00:00Z</meta></metadata>
<manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest>
<spine><itemref idref="chapter"/></spine></package>''')
    z.writestr('chapter.xhtml', chapter)
    z.writestr('nav.xhtml', '''<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head><body><nav epub:type="toc"><ol><li>
<a href="chapter.xhtml">Angle bracket fixture</a></li></ol></nav></body></html>''')
