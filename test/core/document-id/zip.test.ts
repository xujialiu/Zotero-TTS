import { describe, expect, it } from 'vitest';

import { ARCHIVE_TAIL, bytesAsArchive, readCentralDirectory, type ArchiveBytes } from '../../../src/core/document-id/zip';

import { concat, crc32, namedEpub, utf8, zip } from './zip-fixture';

/**
 * The manifest ADR 0004 names a Document by, and — mostly — the archives it
 * refuses to name one from.
 *
 * Every test below the first three is a refusal, which is the proportion the ADR
 * asks for: "Both throw rather than falling back to a whole-file hash, because a
 * silent fallback would mean the same book has two possible ids depending on a
 * code path." A parser that coped with a damaged central directory would be
 * producing an id from whatever it managed to read.
 */

const name = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** An archive that records what was asked of it, because *how little is read* is the decision being tested. */
function counted(bytes: Uint8Array): { archive: ArchiveBytes; reads: { offset: number; length: number }[] } {
  const reads: { offset: number; length: number }[] = [];
  return {
    reads,
    archive: {
      size: bytes.length,
      read(offset, length) {
        reads.push({ offset, length });
        return bytes.subarray(offset, offset + length);
      },
    },
  };
}

const END_RECORD = 22;
/** These fixtures carry no archive comment, so the end record is the last 22 bytes. */
const endAt = (bytes: Uint8Array): number => bytes.length - END_RECORD;
const u32At = (bytes: Uint8Array, at: number): number => new DataView(bytes.buffer, bytes.byteOffset).getUint32(at, true);
const directoryAt = (bytes: Uint8Array): number => u32At(bytes, endAt(bytes) + 16);

const withU16 = (bytes: Uint8Array, at: number, value: number): Uint8Array => {
  const copy = bytes.slice();
  new DataView(copy.buffer).setUint16(at, value, true);
  return copy;
};

const withU32 = (bytes: Uint8Array, at: number, value: number): Uint8Array => {
  const copy = bytes.slice();
  new DataView(copy.buffer).setUint32(at, value, true);
  return copy;
};

const read = (bytes: Uint8Array) => readCentralDirectory(bytesAsArchive(bytes));

describe('readCentralDirectory', () => {
  it('reads each member of a real archive, with the CRC-32 of its uncompressed bytes', () => {
    const text = utf8('a chapter of a small book');
    const members = read(zip([{ name: 'mimetype', data: utf8('application/epub+zip') }, { name: 'OEBPS/one.xhtml', data: text }]));
    expect(members.map((member) => name(member.name))).toEqual(['mimetype', 'OEBPS/one.xhtml']);
    expect(members[1].crc32).toBe(crc32(text));
    expect(members[1].uncompressedSize).toBe(text.length);
  });

  /**
   * The property the whole decision rests on, at the level below the id: the CRC
   * is over the uncompressed bytes, so deflating changes the file and not the
   * manifest.
   */
  it('reads the same manifest whether the members are stored or deflated', () => {
    const entries = [{ name: 'OEBPS/one.xhtml', data: utf8('a chapter of a small book, repeated. '.repeat(40)) }];
    const stored = zip(entries);
    const deflated = zip(entries, { level: 9 });
    expect(deflated.length).toBeLessThan(stored.length);
    expect(read(deflated)).toEqual(read(stored));
  });

  /**
   * **The reason the seam is a byte-range reader and not a `Uint8Array`.** Two
   * ranges, and their total does not grow with the archive: a member 4,000 times
   * larger costs the same read. On the owner's 34,453,009-byte book that is
   * 220,092 bytes (notes/NOTES_2026-09-19.md); a function taking the whole file's
   * bytes would have read all 34 MB in the caller before this was reached.
   */
  it('reads two ranges, and the same number of bytes however large the members are', () => {
    const bytes = zip([{ name: 'OEBPS/one.xhtml', data: new Uint8Array(4_000_000) }]);
    const large = counted(bytes);
    const smaller = counted(zip([{ name: 'OEBPS/one.xhtml', data: new Uint8Array(200_000) }]));
    readCentralDirectory(large.archive);
    readCentralDirectory(smaller.archive);

    const total = (reads: { length: number }[]): number => reads.reduce((sum, one) => sum + one.length, 0);
    expect(large.reads).toHaveLength(2);
    // Twenty times the book, byte for byte the same reading.
    expect(total(large.reads)).toBe(total(smaller.reads));
    expect(total(large.reads)).toBeLessThan(ARCHIVE_TAIL + 1_000);
    expect(total(large.reads)).toBeLessThan(bytes.length / 50);
    // The directory, read where the end record says it is, in one range — not scanned for.
    expect(large.reads[1]).toEqual({ offset: directoryAt(bytes), length: endAt(bytes) - directoryAt(bytes) });
  });

  it('refuses a file with no end-of-central-directory record, which is not a ZIP', () => {
    expect(() => read(utf8('This is a text file, not an archive, and it is long enough to hold a record.'))).toThrow(
      /no end-of-central-directory record/,
    );
  });

  it('refuses a file too short to hold the record at all', () => {
    expect(() => read(utf8('PK\u0005\u0006'))).toThrow(/too short to be a ZIP/);
  });

  /**
   * The signature is four bytes and can occur in an archive comment. What cannot
   * be forged is that the real record's comment runs to exactly the end of the
   * file, so the scan verifies that rather than trusting the last match.
   */
  it('finds the record when its own signature appears again inside the archive comment', () => {
    const decoy = concat([utf8('PK\u0005\u0006'), new Uint8Array(30)]);
    const members = read(zip([{ name: 'mimetype', data: utf8('application/epub+zip') }], { comment: decoy }));
    expect(members.map((member) => name(member.name))).toEqual(['mimetype']);
  });

  /**
   * The comment field is two bytes wide, so the end record can sit 65,535 bytes
   * from the end of the file. That is why the tail read is 65,557 bytes and not
   * the 22 the record itself needs.
   */
  it('finds the record behind an archive comment of the greatest length one can have', () => {
    const members = read(zip([{ name: 'mimetype', data: utf8('application/epub+zip') }], { comment: 'x'.repeat(0xffff) }));
    expect(members.map((member) => name(member.name))).toEqual(['mimetype']);
  });

  /** ADR 0004: "a ZIP64 archive (more than 65,535 members, or past 4 GB) is not handled". Four fields say so. */
  it('refuses a ZIP64 archive, by whichever field carries the sentinel', () => {
    const bytes = namedEpub();
    const end = endAt(bytes);
    expect(() => read(withU16(bytes, end + 8, 0xffff))).toThrow(/ZIP64/);
    expect(() => read(withU16(bytes, end + 10, 0xffff))).toThrow(/ZIP64/);
    expect(() => read(withU32(bytes, end + 12, 0xffffffff))).toThrow(/ZIP64/);
    expect(() => read(withU32(bytes, end + 16, 0xffffffff))).toThrow(/ZIP64/);
  });

  /**
   * A member of 4 GB or more keeps its real size in a ZIP64 extra field and
   * writes the sentinel in the record. Digesting the sentinel would put the same
   * size in the manifest for every such member, so it is refused here too —
   * the end record alone does not catch this one.
   */
  it('refuses a member whose uncompressed size is the ZIP64 sentinel', () => {
    const bytes = namedEpub();
    expect(() => read(withU32(bytes, directoryAt(bytes) + 24, 0xffffffff))).toThrow(/ZIP64 extra field/);
  });

  it('refuses a split archive, whose directory is on another volume', () => {
    const bytes = namedEpub();
    const end = endAt(bytes);
    expect(() => read(withU16(bytes, end + 4, 1))).toThrow(/split across volumes/);
    expect(() => read(withU16(bytes, end + 6, 1))).toThrow(/split across volumes/);
    expect(() => read(withU16(bytes, end + 8, 2))).toThrow(/split across volumes/);
  });

  /**
   * The offsets in a ZIP are from the start of the file, so anything prepended
   * makes every one of them point 8 bytes short — at another member's data. A
   * reader that took the offset on trust would digest whatever it found there.
   */
  it('refuses an archive with bytes prepended to it, whose offsets no longer point at its records', () => {
    expect(() => read(concat([utf8('PREPEND!'), namedEpub()]))).toThrow(/does not end at the end-of-central-directory record/);
  });

  it('refuses an archive whose directory is truncated', () => {
    const bytes = namedEpub();
    expect(() => read(withU32(bytes, endAt(bytes) + 12, 40))).toThrow(/does not end at the end-of-central-directory record/);
  });

  it('refuses a directory with no member header where the first member should be', () => {
    const bytes = namedEpub();
    expect(() => read(withU32(bytes, directoryAt(bytes), 0x02014b51))).toThrow(/no member header at byte 0/);
  });

  it('refuses a member record that extends past the end of the directory', () => {
    const bytes = namedEpub();
    expect(() => read(withU16(bytes, directoryAt(bytes) + 28, 0xffff))).toThrow(/extends past the end/);
  });

  it('refuses a directory that declares more members than it holds', () => {
    const bytes = namedEpub();
    const end = endAt(bytes);
    const claimed = withU16(withU16(bytes, end + 8, 4), end + 10, 4);
    expect(() => read(claimed)).toThrow(/declares 4 members but runs out after 3/);
  });

  /** Slack after the last record is a member the end record forgot to count, and the manifest would be missing it. */
  it('refuses a directory with bytes left over after its last member', () => {
    const bytes = namedEpub();
    const end = endAt(bytes);
    const claimed = withU16(withU16(bytes, end + 8, 2), end + 10, 2);
    expect(() => read(claimed)).toThrow(/fill \d+ bytes of a central directory the end record says is \d+/);
  });

  /**
   * `FileHandle.readBytes` is `read(upToCount:)`
   * (`expo-file-system/ios/FileSystemFileHandle.swift`), which is documented to
   * return fewer bytes than asked. A short read quietly digested would name the
   * book something else, so the length of every range is checked.
   */
  it('refuses a reader that returns fewer bytes than it was asked for', () => {
    const bytes = namedEpub();
    const short: ArchiveBytes = {
      size: bytes.length,
      read: (offset, length) => bytes.subarray(offset, offset + length - 1),
    };
    expect(() => readCentralDirectory(short)).toThrow(/returned \d+\. A partial read would name the Document something else/);
  });

  /** The digest separates a name from its numbers with a NUL, so a NUL in a name would make two different members frame alike. */
  it('refuses a member with a NUL in its name', () => {
    expect(() => read(zip([{ name: 'OEBPS/one\u0000.xhtml', data: utf8('x') }]))).toThrow(/NUL in its name/);
  });

  it('refuses an archive whose length is not a length', () => {
    expect(() => readCentralDirectory({ size: -1, read: () => new Uint8Array(0) })).toThrow(/cannot be -1 bytes long/);
  });
});

describe('bytesAsArchive', () => {
  it('hands out exactly the range it is asked for, and nothing else', () => {
    const archive = bytesAsArchive(utf8('0123456789'));
    expect(archive.size).toBe(10);
    expect(name(archive.read(2, 3))).toBe('234');
    expect(name(archive.read(0, 10))).toBe('0123456789');
  });
});
