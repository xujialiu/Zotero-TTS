"""Two top-level parts and nested chapters in one EPUB spine item (issue #148)."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_STORED, ZIP_DEFLATED
from html import escape

out = Path(__file__).parent / 'remaining-time.epub'
body = []
for part in (1, 2):
    for chapter in (1, 2):
        for paragraph in range(1, 16):
            anchor = f' id="part{part}"' if chapter == 1 and paragraph == 1 else ''
            chapter_anchor = f'<span id="chapter{part}-{chapter}"></span>' if paragraph == 1 else ''
            text = f'Part {part}, chapter {chapter}, paragraph {paragraph}. This fixture checks estimated listening time and named sections. The next paragraph continues the same reading section until the next part begins.'
            body.append(f'<p{anchor}>{chapter_anchor}{escape(text)}</p>')
xhtml = '<html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head><title>Remaining reading time</title></head><body>' + ''.join(body) + '</body></html>'
nav_items = ''.join(f'<li><a href="book.xhtml#part{p}">Part {p}</a><ol>' + ''.join(f'<li><a href="book.xhtml#chapter{p}-{c}">Chapter {c}</a></li>' for c in (1, 2)) + '</ol></li>' for p in (1, 2))
nav = '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>' + nav_items + '</ol></nav></body></html>'
opf = '''<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:zotero-tts:remaining-time:148</dc:identifier><dc:title>Zotero-TTS remaining time fixture</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-09-26T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="book" href="book.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="book"/></spine></package>'''
with ZipFile(out, 'w', ZIP_DEFLATED) as z:
    info = ZipInfo('mimetype'); info.compress_type = ZIP_STORED
    z.writestr(info, 'application/epub+zip')
    z.writestr('META-INF/container.xml', '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
    z.writestr('content.opf', opf)
    z.writestr('nav.xhtml', nav)
    z.writestr('book.xhtml', xhtml)
print(out)
