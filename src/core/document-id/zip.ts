/**
 * A COPY of OpenReader's `src/core/document/zip.ts` (the copy rule: the plugin's
 * provider layer went to OpenReader the same way, its ADR 0013). The two
 * files must change in step: a Document Id is the join key of the shared
 * positions file (docs/spec/SYNC-FORMAT.md, section 6.3), and a byte of
 * difference between the two implementations names one book twice.
 */

/**
 * The ZIP **central directory** — an archive's own manifest of what is inside
 * it — read out of an archive without decompressing anything and without
 * holding the archive in memory.
 *
 * This exists for ADR 0004. A Document Id is a digest over this manifest rather
 * than over the file, because hashing the owner's 34 MB novel on Hermes froze
 * the app for 14.4 seconds and because a manifest of `(name, CRC-32,
 * uncompressed size)` survives re-compression while a file hash does not. The
 * digest itself is in `identity.ts`; what is here is the reading.
 *
 * ## Where the bytes come from, and why this is not a `Uint8Array`
 *
 * ADR 0004 originally said "the identity function takes a `Uint8Array` and the
 * caller reads the file". That seam is now wrong, and not because the boundary
 * moved: the whole point of the new rule is to read **220,092 bytes instead of
 * 34,453,009**, and a function taking the whole file's bytes throws that away in
 * the caller, one line before it is handed over.
 *
 * So the seam is a **byte-range reader**: a length, and a function that returns
 * an exact range. `src/core/` still never learns that a file system exists
 * (ADR 0013) — `src/app/` implements `ArchiveBytes` over `expo-file-system`'s
 * `FileHandle` — and a test implements it over a `Uint8Array` in four lines, so
 * the range arithmetic the device runs is the range arithmetic the tests run.
 *
 * It is **synchronous** because `FileHandle.readBytes` is
 * (`expo-file-system/ios/FileSystemFileHandle.swift`, `read(upToCount:)`), and
 * making it a promise would make naming a Document a promise for no reason —
 * the same argument `sha256.ts` gives for not wanting `crypto.subtle`.
 *
 * ## Everything here refuses rather than copes
 *
 * ADR 0004: "a silent fallback would mean the same book has two possible ids
 * depending on a code path — which is the one thing an identity may not have."
 * Every guard below therefore throws. None of them returns a partial manifest,
 * a best guess, or a whole-file digest instead.
 */

/**
 * A Document's file as `src/core/` is allowed to see it: how long it is, and a
 * way to get an exact range of it.
 *
 * `read` must return **exactly** `length` bytes. That is not pedantry: the iOS
 * implementation this is written for is `read(upToCount:)`, which is documented
 * to return fewer, and a short read that were quietly digested would produce a
 * different id for the same book — which is the one failure ADR 0004 forbids.
 * `readCentralDirectory` checks the length of every range it asks for.
 */
export interface ArchiveBytes {
  /** The file's length in bytes. */
  readonly size: number;
  /** Exactly `length` bytes starting at `offset`. Fewer, or more, is an error. */
  read(offset: number, length: number): Uint8Array;
}

/**
 * One member of an archive, as its central directory describes it — and only
 * the three fields a Document Id is made of.
 *
 * `name` is left as the archive's **own bytes**, undecoded, on purpose. A ZIP
 * member name is UTF-8 when general-purpose bit 11 is set and CP437 otherwise,
 * and a name that is not valid UTF-8 decodes to U+FFFD replacement characters —
 * so two different members could decode to the same string and collapse to one
 * line of the digest. Bytes cannot. Decoding is a question for whoever wants to
 * *look up* a member, not for whoever is identifying the archive.
 *
 * `crc32` is a CRC-32 of the member's **uncompressed** bytes, which is the
 * property the whole decision rests on: it does not change when the archive is
 * repacked at another compression level.
 */
export interface ZipMember {
  readonly name: Uint8Array;
  readonly crc32: number;
  readonly uncompressedSize: number;
}

/** Location information for reading an individual member, separate from identity. */
export interface LocatedZipMember extends ZipMember {
  readonly compressedSize: number;
  readonly method: number;
  readonly flags: number;
  readonly offset: number;
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;

/** The end-of-central-directory record is 22 bytes plus a comment of at most 0xffff. */
const END_RECORD = 22;
const MAX_COMMENT = 0xffff;

/** The largest tail that can contain the end record: it is the last thing in the file, comment and all. */
export const ARCHIVE_TAIL = END_RECORD + MAX_COMMENT;

/**
 * A value of `0xffff`/`0xffffffff` in a ZIP field means "the real value is in a
 * ZIP64 extra field". This build does not read those, so it refuses the archive
 * instead of digesting the sentinel — a sentinel that reached the digest would
 * be a manifest in which every large member has the same size.
 */
const ZIP64_16 = 0xffff;
const ZIP64_32 = 0xffffffff;

/**
 * Every member the archive's central directory declares, in the order the
 * directory lists them.
 *
 * Reads two ranges and nothing else: the tail that holds the end record, then
 * the directory itself. On the owner's book that is 65,557 + 154,535 = 220,092
 * bytes of 34,453,009 — 0.64%.
 *
 * Throws, with a sentence saying what the file is, when the file is not
 * something this can read. ADR 0004 names two of these; the others are the same
 * rule applied to what the format allows.
 */
export function readCentralDirectory(archive: ArchiveBytes): ZipMember[] {
  return readZipDirectory(archive).map(({ name, crc32, uncompressedSize }) => ({ name, crc32, uncompressedSize }));
}

export function readZipDirectory(archive: ArchiveBytes): LocatedZipMember[] {
  const { size } = archive;
  if (!Number.isInteger(size) || size < 0) throw new Error(`An archive cannot be ${size} bytes long.`);
  if (size < END_RECORD) {
    throw new Error(`This file is ${size} bytes, which is too short to be a ZIP and therefore too short to be an EPUB.`);
  }

  const tailLength = Math.min(size, ARCHIVE_TAIL);
  const tailAt = size - tailLength;
  const tail = range(archive, tailAt, tailLength);
  const end = findEndRecord(tail, tailLength);
  const endAt = tailAt + end;

  const entriesOnThisDisk = u16(tail, end + 8);
  const entries = u16(tail, end + 10);
  const directorySize = u32(tail, end + 12);
  const directoryAt = u32(tail, end + 16);

  // ZIP64 first, because every check after this one would otherwise be made
  // against a sentinel. ADR 0004: "a ZIP64 archive (more than 65,535 members,
  // or past 4 GB) is not handled", and not handling it means refusing it.
  if (entries === ZIP64_16 || entriesOnThisDisk === ZIP64_16 || directorySize === ZIP64_32 || directoryAt === ZIP64_32) {
    throw new Error('This is a ZIP64 archive — more than 65,535 members, or larger than 4 GB. This build cannot name it.');
  }
  // A split archive's directory lives on another volume, so there is nothing
  // here to read. Two fields say so and they are checked together because a
  // file claiming one disk and a different count of entries on it is not
  // something to guess about.
  if (u16(tail, end + 4) !== 0 || u16(tail, end + 6) !== 0 || entriesOnThisDisk !== entries) {
    throw new Error('This archive is split across volumes, so its central directory is not in this file.');
  }
  // The directory must lie inside the file and end where the end record begins.
  // For a conforming ZIP it ends there exactly; when it does not, the offset is
  // being measured from something other than the start of this file and every
  // member would be read out of the wrong place.
  if (directoryAt + directorySize !== endAt) {
    throw new Error(
      `This archive's central directory claims ${directorySize} bytes at ${directoryAt}, which does not end at the ` +
        `end-of-central-directory record at ${endAt}. The file is truncated or has something prepended to it.`,
    );
  }

  const directory = range(archive, directoryAt, directorySize);
  const members: LocatedZipMember[] = [];
  let at = 0;
  for (let seen = 0; seen < entries; seen++) {
    if (at + 46 > directorySize) {
      throw new Error(`This archive's central directory declares ${entries} members but runs out after ${seen}.`);
    }
    if (u32(directory, at) !== CENTRAL_DIRECTORY_HEADER) {
      throw new Error(`This archive's central directory has no member header at byte ${at} of it, so it is not a central directory.`);
    }
    const uncompressedSize = u32(directory, at + 24);
    const nameLength = u16(directory, at + 28);
    const record = 46 + nameLength + u16(directory, at + 30) + u16(directory, at + 32);
    if (at + record > directorySize) {
      throw new Error(`Member ${seen + 1} of this archive's central directory extends past the end of it.`);
    }
    // Per member, and not covered by the check on the end record above: a
    // member larger than 4 GB keeps its real size in a ZIP64 extra field and
    // writes the sentinel here.
    if (uncompressedSize === ZIP64_32) {
      throw new Error(`Member ${seen + 1} of this archive is 4 GB or larger and records its size in a ZIP64 extra field, which this build cannot read.`);
    }
    const name = directory.subarray(at + 46, at + 46 + nameLength);
    // A NUL in a name would make the digest's framing ambiguous — the digest
    // separates a name from its numbers with one — so two different archives
    // could produce the same line. Nothing legitimate puts one in a file name.
    if (name.indexOf(0) >= 0) throw new Error(`Member ${seen + 1} of this archive has a NUL in its name.`);
    members.push({ name, crc32: u32(directory, at + 16), uncompressedSize,
      compressedSize: u32(directory, at + 20), method: u16(directory, at + 10),
      flags: u16(directory, at + 8), offset: u32(directory, at + 42) });
    at += record;
  }
  // Slack after the last record means the directory is not what the end record
  // says it is, and the missing bytes could be another member.
  if (at !== directorySize) {
    throw new Error(`This archive's ${entries} members fill ${at} bytes of a central directory the end record says is ${directorySize}.`);
  }
  return members;
}

/**
 * These bytes, as something ranges can be read out of.
 *
 * For a caller that genuinely has the whole archive in memory — the tests, and
 * anything holding an archive it just built. It is **not** a way back to
 * reading the file whole: on the device the archive is on disk and only two
 * ranges of it are ever wanted.
 */
export function bytesAsArchive(bytes: Uint8Array): ArchiveBytes {
  return {
    size: bytes.length,
    read: (offset, length) => bytes.subarray(offset, offset + length),
  };
}

/**
 * The offset of the end record within `tail`.
 *
 * Scanned backwards, and **verified by its comment length** rather than taken
 * on the signature alone. Those four bytes can occur inside compressed member
 * data and inside the archive comment itself; what cannot be faked is that the
 * record's comment runs to exactly the end of the file. The last candidate that
 * satisfies that is the record.
 */
function findEndRecord(tail: Uint8Array, tailLength: number): number {
  for (let at = tailLength - END_RECORD; at >= 0; at--) {
    if (u32(tail, at) !== END_OF_CENTRAL_DIRECTORY) continue;
    if (u16(tail, at + 20) === tailLength - at - END_RECORD) return at;
  }
  throw new Error('This file has no end-of-central-directory record, so it is not a ZIP and therefore not an EPUB.');
}

/** `length` bytes at `offset`, or a refusal naming what the reader actually returned. */
function range(archive: ArchiveBytes, offset: number, length: number): Uint8Array {
  const bytes = archive.read(offset, length);
  if (bytes.length !== length) {
    throw new Error(`Reading ${length} bytes of this file at ${offset} returned ${bytes.length}. A partial read would name the Document something else.`);
  }
  return bytes;
}

const u16 = (bytes: Uint8Array, at: number): number => bytes[at] | (bytes[at + 1] << 8);

const u32 = (bytes: Uint8Array, at: number): number =>
  (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
