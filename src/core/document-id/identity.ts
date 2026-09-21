/**
 * A COPY of the Document Id half of OpenReader's `src/core/document/identity.ts`
 * (the copy rule: the plugin's provider layer went to OpenReader the same way,
 * its ADR 0013). The two must change in step: a Document Id is the join key of
 * the shared positions file (docs/spec/SYNC-FORMAT.md, section 6.3), and a byte
 * of difference between the two implementations names one book twice. What is
 * left out — `dc:identifier` reading and `DocumentIdentity` — is nothing the
 * plugin needs: `publicationId` is written null by both products in version 1.
 *
 * The rule in one sentence: the name comes from the document's own contents,
 * not from a library that holds them. It is a SHA-256 over the EPUB's central
 * directory — `(name, CRC-32, uncompressed size)` per member, members sorted by
 * name, behind a version line — so the same book repacked at another
 * compression level keeps its id, and naming a 34 MB book reads about 220 KB.
 */

import { sha256Hex } from './sha256';
import { readCentralDirectory, type ArchiveBytes, type ZipMember } from './zip';

declare const documentId: unique symbol;

/**
 * A **Document Id**: `sha256:` and 64 lowercase hex characters over the
 * document's own manifest. Branded so it cannot be crossed with a title, a
 * file name or an item key; `asDocumentId` is the only way in from outside.
 */
export type DocumentId = string & { readonly [documentId]: 'DocumentId' };

/** The prefix every Document Id carries, and the algorithm it names. */
export const DOCUMENT_ID_PREFIX = 'sha256:';

const DOCUMENT_ID = /^sha256:[0-9a-f]{64}$/;

/**
 * The first line of every manifest digested, and the only thing in an id that
 * says which rule produced it. Inside the digest rather than beside it, so a
 * second implementation cannot forget it: any change to the framing below must
 * change this line too, or every id silently becomes a different one.
 */
export const DOCUMENT_ID_RULE = 'epub-zip-v1';

/**
 * The exact bytes a Document Id is a digest of: the version line, then one line
 * per member of the archive's central directory.
 *
 * ```
 * epub-zip-v1\n
 * <name>\0<crc32>\0<uncompressed size>\n     … once per member, sorted
 * ```
 *
 * Sorted by the name's bytes, then by CRC-32, then by size, so the order is
 * total even for two members of one name; the name is the archive's own bytes,
 * not a decoded string; the numbers are decimal.
 */
export function documentManifest(archive: ArchiveBytes): Uint8Array {
  const members = readCentralDirectory(archive).sort(byNameThenContents);
  const lines = members.map(manifestLine);
  const rule = asciiBytes(`${DOCUMENT_ID_RULE}\n`);
  const manifest = new Uint8Array(lines.reduce((total, line) => total + line.length, rule.length));
  manifest.set(rule);
  let at = rule.length;
  for (const line of lines) {
    manifest.set(line, at);
    at += line.length;
  }
  return manifest;
}

function manifestLine(member: ZipMember): Uint8Array {
  const numbers = asciiBytes(`\u0000${member.crc32}\u0000${member.uncompressedSize}\n`);
  const line = new Uint8Array(member.name.length + numbers.length);
  line.set(member.name);
  line.set(numbers, member.name.length);
  return line;
}

/** The archive's own byte order for names, so the sort does not depend on a decoder or on a locale. */
function byNameThenContents(a: ZipMember, b: ZipMember): number {
  const shorter = Math.min(a.name.length, b.name.length);
  for (let at = 0; at < shorter; at++) {
    if (a.name[at] !== b.name[at]) return a.name[at] - b.name[at];
  }
  if (a.name.length !== b.name.length) return a.name.length - b.name.length;
  if (a.crc32 !== b.crc32) return a.crc32 - b.crc32;
  return a.uncompressedSize - b.uncompressedSize;
}

/** The version line and the numbers, as bytes. ASCII by construction, so the characters are the encoding. */
function asciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let at = 0; at < text.length; at++) bytes[at] = text.charCodeAt(at);
  return bytes;
}

/**
 * The Document Id of this archive. Reads two ranges of it and digests what
 * they say; throws when the archive is not one this build can read — it does
 * not fall back to hashing the file, because a book with two possible ids
 * depending on which path ran is the one thing an identity may not be.
 */
export function documentIdOf(archive: ArchiveBytes): DocumentId {
  return `${DOCUMENT_ID_PREFIX}${sha256Hex(documentManifest(archive))}` as DocumentId;
}

/** `value` as a Document Id, or null when it is not one. */
export function asDocumentId(value: unknown): DocumentId | null {
  return typeof value === 'string' && DOCUMENT_ID.test(value) ? (value as DocumentId) : null;
}
