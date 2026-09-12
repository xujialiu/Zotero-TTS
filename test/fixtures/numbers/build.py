"""The numbers fixture for the live checklist (test/zotero-dev/README.md, section 3;
issue #86): one page whose sentences carry what a Kokoro-FastAPI server
rewrites before it speaks -- decimals, a thousands separator, a percentage, a
typographic apostrophe, a multiplication sign glued to a digit -- and, after
them, a word with a spoken number's word inside it (`branchpoints` holds
`point`), so a substring search would land there. `mm.` before a capital is
kept from the document the bug was found in: Zotero's segmenter did not break
the sentence there, and one bad pair then reached into the next sentence.

Stdlib only; Helvetica in WinAnsiEncoding, so the stream is written as
cp1252 (the apostrophe is 0x92, the multiplication sign 0xD7). Run from
anywhere: `python test/fixtures/numbers/build.py` writes numbers.pdf beside it.
"""
import textwrap
from pathlib import Path

OUT = Path(__file__).parent / "numbers.pdf"

LEFT, TOP, LEADING, PARA_GAP = 72, 720, 15, 27
FONT_SIZE = 11
WRAP = 78

PARAGRAPHS = [
    "Zotero-TTS numbers fixture, page one. In the reviewers’ 29.83 mm example eye, a scan "
    "labelled 3 × 3 mm covers 3.7 × 3.7 mm. Vessels in that eye therefore look narrower, "
    "their branchpoints denser, and the avascular zone smaller than they are.",
    "About 1,000 eyes were scanned at 0.99 confidence, and 76% of the panel agreed. The "
    "pre-trained model had seen 1.6 million images [1]. A magnification error of -20% to "
    "+10% is common, and a study last year found none after correction.",
    "The last paragraph has no number in it at all, so every one of its words pairs with the "
    "voice on its own, and the highlight simply walks along the line.",
]


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def page_stream(paragraphs) -> bytes:
    ops = ["BT", f"/F1 {FONT_SIZE} Tf", f"{LEFT} {TOP} Td", f"{LEADING} TL"]
    first = True
    for para in paragraphs:
        if not first:
            ops.append(f"0 -{PARA_GAP - LEADING} Td")
        for line in textwrap.wrap(para, WRAP):
            ops.append(f"({esc(line)}) Tj" if first else f"T* ({esc(line)}) Tj")
            first = False
    ops.append("ET")
    return "\n".join(ops).encode("cp1252")


def build_pdf(streams, title: str) -> bytes:
    objs: list[bytes] = []

    def add(b: bytes) -> int:
        objs.append(b)
        return len(objs)

    catalog_no = add(b"")
    pages_no = add(b"")
    font_no = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    add(f"<< /Title ({esc(title)}) /Producer (build.py) >>".encode("cp1252"))
    page_nos = []
    for stream in streams:
        content_no = add(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
        page_nos.append(
            add(
                f"<< /Type /Page /Parent {pages_no} 0 R /MediaBox [0 0 612 792] "
                f"/Resources << /Font << /F1 {font_no} 0 R >> >> /Contents {content_no} 0 R >>".encode("cp1252")
            )
        )
    objs[catalog_no - 1] = f"<< /Type /Catalog /Pages {pages_no} 0 R /Lang (en-US) >>".encode("cp1252")
    kids = " ".join(f"{n} 0 R" for n in page_nos)
    objs[pages_no - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_nos)} >>".encode("cp1252")

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root {catalog_no} 0 R /Info 4 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


if __name__ == "__main__":
    OUT.write_bytes(build_pdf([page_stream(PARAGRAPHS)], "Zotero-TTS numbers fixture"))
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
