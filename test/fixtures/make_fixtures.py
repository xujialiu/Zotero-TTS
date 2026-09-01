"""Hand-written PDF fixtures for the live checklist (test/zotero-dev.md); stdlib only.

fixture-a.pdf: two pages of English prose with clear paragraph gaps, a document
language tag of en-US, and one line drawn at font size zero (the shape of the
LaTeX text-layer garbage issue #15 refuses); Zotero drops it before segmentation,
so it exercises nothing yet -- a real latexit PDF is needed for that check.
fixture-b.pdf: one page, different prose, so two tabs can be told apart.
"""
import textwrap
from pathlib import Path

OUT = Path(__file__).parent

LEFT, TOP, LEADING, PARA_GAP = 72, 720, 15, 27
FONT_SIZE = 11
WRAP = 78

INVISIBLE_MARKER = "INVISIBLE MARKER ZULU seven nine this line must never be spoken or listed"

A_PAGE1 = [
    "Zotero-TTS fixture A, page one. This document exists only to be read aloud by a test. "
    "It has several paragraphs, and every paragraph has several sentences. The first sentence "
    "of each paragraph is short. The later sentences are a little longer, so that a word-level "
    "highlight has room to move across the line.",
    "The second paragraph talks about nothing in particular. A reader that skips by sentence "
    "should land on the start of this sentence, and then on the start of the next one. A reader "
    "that skips by paragraph should land here, at the beginning of the second paragraph, and "
    "then at the beginning of the third. Speed is measured in multiples of the natural pace.",
    "The third paragraph is the last one on this page. It mentions the number forty-two once, "
    "and the color of the sky twice: the sky is blue, and at night the sky is dark. When the "
    "page ends, playback should continue on the next page without a pause longer than a "
    "sentence break.",
]

A_PAGE2 = [
    "Fixture A, page two. Resuming should bring the reader back to the sentence it left off on, "
    "not to the top of the page. The stored position is a single point, the center of the "
    "first rectangle of that sentence.",
    "This is the final paragraph of fixture A. It has three sentences. This is the third one, "
    "and the document ends here.",
]

B_PAGE1 = [
    "Zotero-TTS fixture B, page one. This is the second document of the test, so that two tabs "
    "can be open at once. A voice picked in the other tab should be used here as well, and a "
    "speed set there should apply here too.",
    "Fixture B has only one page and two paragraphs. Its second paragraph ends the document "
    "with a short sentence. Done.",
]


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def page_stream(paragraphs, invisible_after=None):
    ops = ["BT", f"/F1 {FONT_SIZE} Tf", f"{LEFT} {TOP} Td", f"{LEADING} TL"]
    first = True
    for i, para in enumerate(paragraphs):
        lines = textwrap.wrap(para, WRAP)
        if not first:
            ops.append(f"0 -{PARA_GAP - LEADING} Td")
        for line in lines:
            if first:
                ops.append(f"({esc(line)}) Tj")
                first = False
            else:
                ops.append(f"T* ({esc(line)}) Tj")
        if invisible_after is not None and i == invisible_after:
            # Size-zero text, positioned like a real line (see the module docstring)
            ops.append(f"0 -{PARA_GAP - LEADING} Td")
            ops.append("/F1 0 Tf")
            ops.append(f"T* ({esc(INVISIBLE_MARKER)}) Tj")
            ops.append(f"/F1 {FONT_SIZE} Tf")
    ops.append("ET")
    return "\n".join(ops).encode("latin-1")


def build_pdf(pages, title):
    objs = []  # list of bytes, object number = index + 1

    def add(b: bytes) -> int:
        objs.append(b)
        return len(objs)

    catalog_no = add(b"")  # placeholder, filled after pages
    pages_no = add(b"")
    font_no = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    info_no = add(f"<< /Title ({esc(title)}) /Producer (make_fixtures.py) >>".encode("latin-1"))
    page_nos = []
    for stream in pages:
        content_no = add(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
        page_no = add(
            f"<< /Type /Page /Parent {pages_no} 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 {font_no} 0 R >> >> /Contents {content_no} 0 R >>".encode("latin-1")
        )
        page_nos.append(page_no)
    objs[catalog_no - 1] = f"<< /Type /Catalog /Pages {pages_no} 0 R /Lang (en-US) >>".encode("latin-1")
    kids = " ".join(f"{n} 0 R" for n in page_nos)
    objs[pages_no - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_nos)} >>".encode("latin-1")

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objs) + 1} /Root {catalog_no} 0 R /Info {info_no} 0 R >>\n"
        f"startxref\n{xref}\n%%EOF\n"
    ).encode()
    return bytes(out)


(OUT / "fixture-a.pdf").write_bytes(
    build_pdf([page_stream(A_PAGE1, invisible_after=1), page_stream(A_PAGE2)], "Zotero-TTS fixture A")
)
(OUT / "fixture-b.pdf").write_bytes(build_pdf([page_stream(B_PAGE1)], "Zotero-TTS fixture B"))
print("wrote", OUT / "fixture-a.pdf", OUT / "fixture-b.pdf")
