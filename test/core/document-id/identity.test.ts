import { describe, expect, it } from 'vitest';
import { DOCUMENT_ID_PREFIX, asDocumentId, documentIdOf, documentManifest } from '../../../src/core/document-id/identity';
import { sha256Hex } from '../../../src/core/document-id/sha256';
import { bytesAsArchive } from '../../../src/core/document-id/zip';

import { crc32, epub, namedEpub, opf, utf8, zip } from './zip-fixture';

/**
 * The Document Id half of OpenReader's identity suite, against real archives
 * (the fixture builds genuine ZIPs, so "the same book re-compressed" is a
 * different byte stream). The rule is a contract with the mobile reader
 * (docs/spec/SYNC-FORMAT.md, 6.3): every case here has a twin over there.
 */

const archive = (bytes: Uint8Array) => bytesAsArchive(bytes);
const named = `    <dc:identifier id="pub-id">urn:uuid:9f1b2c3d-1111-4000-8000-abcdefabcdef</dc:identifier>`;
const converted = (metadata: string): Uint8Array => epub(`${opf(metadata)}\n<!-- repacked by another tool -->`);

describe('documentIdOf', () => {
  it('names a Document from its manifest, self-describing', () => {
    const id = documentIdOf(archive(namedEpub()));
    expect(id.startsWith(DOCUMENT_ID_PREFIX)).toBe(true);
    expect(id).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('is not a digest of the file', () => {
    const bytes = namedEpub();
    expect(documentIdOf(archive(bytes))).not.toBe(`${DOCUMENT_ID_PREFIX}${sha256Hex(bytes)}`);
  });

  it('gives the same name to the same members and a different one when a member changes', () => {
    expect(documentIdOf(archive(namedEpub()))).toBe(documentIdOf(archive(namedEpub())));
    expect(documentIdOf(archive(namedEpub()))).not.toBe(documentIdOf(archive(converted(named))));
  });

  it('is the same id for the same book repacked at another compression level', () => {
    const stored = namedEpub();
    const light = namedEpub({ level: 1 });
    const heavy = namedEpub({ level: 9 });
    expect(new Set([stored.length, light.length, heavy.length]).size).toBe(3);
    expect(new Set([sha256Hex(stored), sha256Hex(light), sha256Hex(heavy)]).size).toBe(3);
    expect(new Set([documentIdOf(archive(stored)), documentIdOf(archive(light)), documentIdOf(archive(heavy))]).size).toBe(1);
  });

  it('is the same id when the members are in a different order', () => {
    expect(documentIdOf(archive(namedEpub({ reverse: true })))).toBe(documentIdOf(archive(namedEpub())));
  });

  it('is the same id when two members share a name and are written in either order', () => {
    const entries = [
      { name: 'OEBPS/one.xhtml', data: utf8('the first of two') },
      { name: 'OEBPS/one.xhtml', data: utf8('the second of two') },
    ];
    expect(documentIdOf(archive(zip(entries, { reverse: true })))).toBe(documentIdOf(archive(zip(entries))));
  });

  it('is not changed by an archive comment', () => {
    expect(documentIdOf(archive(namedEpub({ comment: 'stamped by another tool' })))).toBe(documentIdOf(archive(namedEpub())));
  });

  it('changes when a member is renamed, and when one is added', () => {
    const one = utf8('a chapter');
    const original = documentIdOf(archive(zip([{ name: 'OEBPS/one.xhtml', data: one }])));
    expect(documentIdOf(archive(zip([{ name: 'OEBPS/two.xhtml', data: one }])))).not.toBe(original);
    expect(documentIdOf(archive(zip([{ name: 'OEBPS/one.xhtml', data: one }, { name: 'OEBPS/two.xhtml', data: one }])))).not.toBe(original);
  });

  it('refuses a file that is not an archive rather than naming it anyway', () => {
    const notAnArchive = utf8('This is a text file with an epub extension, and it is comfortably longer than a record.');
    expect(() => documentIdOf(archive(notAnArchive))).toThrow(/no end-of-central-directory record/);
  });
});

describe('documentManifest', () => {
  it('is the version line, then one line per member, sorted by name', () => {
    const one = utf8('one');
    const two = utf8('two');
    const manifest = documentManifest(archive(zip([{ name: 'b.txt', data: two }, { name: 'a.txt', data: one }])));
    expect(new TextDecoder().decode(manifest)).toBe(`epub-zip-v1\na.txt\u0000${crc32(one)}\u00003\nb.txt\u0000${crc32(two)}\u00003\n`);
  });

  it('sorts by the bytes of the name, so the order does not depend on a decoder', () => {
    const data = utf8('x');
    const manifest = new TextDecoder().decode(
      documentManifest(archive(zip([{ name: 'OEBPS/b', data }, { name: 'OEBPS/a/b', data }, { name: 'OEBPS/a', data }]))),
    );
    expect(manifest.split('\n').map((line) => line.split('\u0000')[0])).toEqual(['epub-zip-v1', 'OEBPS/a', 'OEBPS/a/b', 'OEBPS/b', '']);
  });
});

describe('asDocumentId', () => {
  it('accepts what documentIdOf produced and refuses everything else', () => {
    expect(asDocumentId(documentIdOf(archive(namedEpub())))).not.toBeNull();
    expect(asDocumentId(`${DOCUMENT_ID_PREFIX}${'a'.repeat(64)}`)).not.toBeNull();
    expect(asDocumentId('a'.repeat(64))).toBeNull();
    expect(asDocumentId(`${DOCUMENT_ID_PREFIX}${'a'.repeat(63)}`)).toBeNull();
    expect(asDocumentId(`${DOCUMENT_ID_PREFIX}${'A'.repeat(64)}`)).toBeNull();
    expect(asDocumentId(`sha512:${'a'.repeat(64)}`)).toBeNull();
    expect(asDocumentId(undefined)).toBeNull();
    expect(asDocumentId(12)).toBeNull();
  });
});
