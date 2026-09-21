import { deflateRawSync } from 'node:zlib';

/**
 * Real ZIP archives, built here, for the three suites that need one:
 * `zip.test.ts` (the central directory and what it refuses),
 * `identity.test.ts` (ADR 0004's Document Id) and `library.test.ts` (which just
 * needs an id that was genuinely computed).
 *
 * Built rather than read from a fixture on disk, for two reasons. `src/core/` has
 * no file system by design and this layer's tests have none either — and ADR
 * 0004's central claim is that **re-compressing a book does not rename it**,
 * which can only be tested by producing the same members at two compression
 * levels. `node:zlib` does that here; committing three copies of one book to
 * prove it would cost megabytes to say what 40 lines say.
 *
 * `deflateRawSync` is the one Node API these tests use, and it is used to write a
 * fixture rather than to exercise anything under `src/`.
 */

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

/** CRC-32 of these bytes, the way a ZIP computes it: over the **uncompressed** data, which is why an id survives re-compression. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export interface ZipOptions {
  /** Lands in the end-of-central-directory record. A tool that stamps one must not rename the Document. */
  comment?: string | Uint8Array;
  /** `'store'`, or a zlib deflate level. The same entries at two levels are the same Document with different bytes. */
  level?: 'store' | number;
  /** Write the members in the opposite order, which a repacker is free to do (ADR 0004: "sort by name"). */
  reverse?: boolean;
}

/**
 * A ZIP holding `entries`. Correct CRCs, correct sizes, correct local headers —
 * `python3 -c "zipfile.ZipFile(...).testzip()"` reads what this writes.
 */
export function zip(entries: readonly ZipEntry[], options: ZipOptions = {}): Uint8Array {
  const order = options.reverse ? [...entries].reverse() : entries;
  const level = options.level ?? 'store';
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of order) {
    const name = utf8(entry.name);
    const crc = crc32(entry.data);
    const body = level === 'store' ? entry.data : new Uint8Array(deflateRawSync(entry.data, { level }));
    const method = level === 'store' ? 0 : 8;

    const header = new Uint8Array(30 + name.length);
    const h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(8, method, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, body.length, true);
    h.setUint32(22, entry.data.length, true);
    h.setUint16(26, name.length, true);
    header.set(name, 30);
    local.push(header, body);

    const record = new Uint8Array(46 + name.length);
    const c = new DataView(record.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(10, method, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, body.length, true);
    c.setUint32(24, entry.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    record.set(name, 46);
    central.push(record);
    offset += header.length + body.length;
  }
  const directory = concat(central);
  const comment = typeof options.comment === 'string' ? utf8(options.comment) : (options.comment ?? new Uint8Array(0));
  const end = new Uint8Array(22 + comment.length);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, order.length, true);
  e.setUint16(10, order.length, true);
  e.setUint32(12, directory.length, true);
  e.setUint32(16, offset, true);
  e.setUint16(20, comment.length, true);
  end.set(comment, 22);
  return concat([...local, directory, end]);
}

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const CONTAINER = `<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

/** An EPUB: the `mimetype` entry first, the container, and the package document. */
export const epub = (opf: string, options: ZipOptions = {}): Uint8Array =>
  zip(
    [
      { name: 'mimetype', data: utf8('application/epub+zip') },
      { name: 'META-INF/container.xml', data: utf8(CONTAINER) },
      { name: 'OEBPS/content.opf', data: utf8(opf) },
    ],
    options,
  );

/** A package document with `metadata` in it, and whatever the `package` element should say. */
export const opf = (metadata: string, packageAttributes = ' unique-identifier="pub-id"'): string => `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0"${packageAttributes}>
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
${metadata}
    <dc:title>A Small Book</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest>
  <spine><itemref idref="nav"/></spine>
</package>`;

export const UUID = 'urn:uuid:9f1b2c3d-1111-4000-8000-abcdefabcdef';

/** The three-member EPUB most tests want, naming `UUID` as the publication's own identifier. */
export const namedEpub = (options: ZipOptions = {}): Uint8Array => epub(opf(`    <dc:identifier id="pub-id">${UUID}</dc:identifier>`), options);
