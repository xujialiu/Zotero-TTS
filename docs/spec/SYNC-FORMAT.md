# The sync folder, file by file

The folder on the owner's own WebDAV server that Zotero-TTS and OpenReader
share. It used to be one plugin's private storage; since 2026-09-21 it is a
contract between two products, and this document is that contract. A change
to any file's shape ships in the same change as this document, and the next
session on either side reads this before it reads an implementation.

Glossary terms are OpenReader's (`CONTEXT.md` there): a **Document Id** is the
content-derived identity of a document; a **Reading Position** is a
**Locator** plus a **Text Anchor**; a **Stamp** is a wall-clock time plus the
**Device Name** that wrote it; the **Positions File** is `xujialiu-positions.json`.
One term is this document's own: a document is **Named** on a device once
that device has computed its Document Id — OpenReader names a document when
it is added to its Library, the plugin names an EPUB attachment when its
reader opens — and a device adopts items only for the documents it has named.

## 1. Who writes what

| File | Written by | Read by | Format string | Version |
| --- | --- | --- | --- | --- |
| `zotero-tts-settings_<machine>.json` | the plugin, one per machine | the plugin | `zotero-tts-settings` | 1 |
| `zotero-tts-shared-settings.json` | the plugin, every machine | the plugin | `zotero-tts-shared-settings` | 1 |
| `zotero-tts-positions.json` | the plugin, every machine | the plugin | `zotero-tts-positions` | 1 |
| `xujialiu-positions.json` | the plugin (1.13.2+) and OpenReader | both | `xujialiu-positions` | 1 |

**The naming rule.** `zotero-tts-*` names a file private to the plugin: its
shape may change whenever the plugin's own version policy allows. `xujialiu-*`
names a file that is a contract between the owner's products: its shape
changes only here, by the policy in section 2. A product never writes, rewrites
or deletes a file whose name it does not know; both products filter the
folder's listing to the names above.

## 2. Rules every shared file follows

### 2.1 Version policy

Every file carries an integer `version` at its top level.

- A reader that meets a `version` **higher** than it knows **leaves the file
  alone**: it does not read it, does not write it, does not delete it, and
  tells the owner that this build is too old to sync that file.
- A reader that meets a `version` **lower** than it knows reads it by that
  version's rules.
- **Within a version nothing may be added.** Not a top-level key, not a field
  on an item. The positions files are serialised canonically to a fixed field
  set, so an older writer strips any field it does not know on its next
  merge-and-upload, for every machine, with nothing reported. New information
  is a new file or a new version.
- **A version bump costs every installed copy of the other product** its
  sync of that file until its owner updates. Prefer a new file.

`zotero-tts-settings_<machine>.json` is the exception on the record: its
parser never reads `version` and collects unknown keys into `ignored`. That
was harmless while one product wrote it and it is not a shared file, so it
stays; a shared file follows the rule above.

### 2.2 Malformed files

A file that is not valid JSON, whose `format` is not the expected string, or
whose top-level shape is missing (`items` not an array for the positions
files) is **treated as absent**: the reader proceeds as if the server held no
file, and its next upload replaces it. This is safe because every device holds
its own items locally, so an overwrite loses at most the items of a device that
has not synced since, and that device's next sync puts them back.

A file whose shape is right but whose `version` is too high is **not**
malformed; section 2.1 applies.

### 2.3 Canonical serialisation

Two writers holding the same content must produce the same bytes, because the
transport compares text to decide whether an upload is needed at all.

- UTF-8, no byte-order mark, no trailing newline.
- `JSON.stringify` with no indentation and no spaces.
- Keys in the order this document lists them, at every level.
- Items sorted as each file's section says.
- Integers written as integers; no `-0`, no exponent.

### 2.4 Concurrency

Every sync is **download, merge, conditional upload**. There is no ETag or
`If-Match`; two devices uploading at once lose one write, and the next sync of
the loser puts its items back because the local store is the truth. A sync is
event-driven, single-flight (one running and at most one queued), and a
failure is reported once per retry window and retried at the next moment.

### 2.5 What a reader carries through

A reader re-emits every item it merged, including items it cannot use: an
item whose `format` it does not implement, or whose fields it could not
validate, is carried through with its fields exactly as parsed and is never
adopted. The one item a reader drops is one whose `id` is not a string, because
nothing can key it; that drop is reported, not silent.

## 3. `zotero-tts-settings_<machine>.json`

One complete settings snapshot per machine, written for that machine alone,
never merged: restoring one replaces settings rather than combining them.
`<machine>` is the plugin's machine id (`src/core/machine-id.ts`), a
filename-safe name derived from the hostname and renamable in the pane. Not
read by OpenReader. Shape: `src/core/settings-backup.ts`.

## 4. `zotero-tts-shared-settings.json`

The settings every machine agrees on, merged setting by setting: one item per
setting, `{ key, value, ts, by }`, last writer wins per key by `ts`. Not read
by OpenReader in this version; a later version of this document may open it
to OpenReader under a new file rather than by adding to this one. Shape and
merge: `src/core/settings-sync.ts`.

## 5. `zotero-tts-positions.json`

The plugin's own reading positions, keyed by Zotero's coordinates.

```json
{"format":"zotero-tts-positions","version":1,"items":[{"lib":1,"key":"ABCD1234","pos":{},"ts":1758470000000}]}
```

- `lib`: the attachment's `libraryID`, meaningful only inside one Zotero
  profile. `key`: the item key. `pos`: Zotero's `sourcePosition`, opaque, in
  Zotero's own dialect (`{pageIndex, rects}` for PDF, `{value: <cfi>}` for
  EPUB, `{value: <selector>}` for snapshots). `ts`: milliseconds since the
  epoch.
- Exactly these four fields; the serialiser strips anything else.
- Items sorted by `lib` ascending, then `key` ascending.
- Merged per `lib/key`, newest `ts` wins, an equal `ts` keeps the reader's own
  item. Removal only through the plugin's local tombstones for permanently
  deleted attachments (issue #51); tombstones never travel.

**Retirement.** This file is retired in **2.0.0**, and only once the Positions
File's id rules and locator dialects for `pdf` and `snapshot` are written in
section 6 and shipped in the plugin, so that a desktop-only owner loses no PDF
or snapshot position. Until then every 1.x build writes both files. A 2.0
build neither reads nor deletes this file: machines still on 1.x keep using
it. The condition is written in the code beside the transport, the way
issue #22 records the pref import's deletion.

## 6. `xujialiu-positions.json` — the Positions File

Every device's reading positions, keyed by Document Id, written by the plugin
and by OpenReader alike. It exists because the plugin's file names a document
by `{lib, key}`, which a phone cannot produce, and cannot carry a text anchor
without a version bump (issue #126).

### 6.1 Shape

```json
{"format":"xujialiu-positions","version":1,"items":[{"id":"sha256:5c3d4aee…","format":"epub","publicationId":null,"locator":"epubcfi(/6/34!/4/2/4/2/4)","anchor":{"exact":"铁柱坐在村内的小路边，望着远处的群山。","prefix":"","suffix":""},"stamp":{"at":1758470000000,"device":"iPhone-3f9a2c1b"}}]}
```

Top level: `format`, `version`, `items`, in that order. Items sorted by `id`
ascending, compared by UTF-16 code unit (ids are ASCII, so this is byte
order). One item per `id`.

### 6.2 Fields of an item

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | The Document Id: `sha256:` and 64 lowercase hex digits (section 6.3). The merge key. |
| `format` | string | The document format the locator is written for. `epub` is the only value defined. `pdf` and `snapshot` are reserved: no writer emits them until this document defines their id rule and locator dialect. A reader carries an unknown format through (section 2.5). |
| `publicationId` | string or null | Reserved for the document's own declared identifier (an EPUB's `dc:identifier`). Both writers write `null` in this version. Never a key; never used to match. |
| `locator` | string | Where the position points, in the format's own dialect (section 6.4). Never trusted alone. |
| `anchor` | object | The Text Anchor: `exact`, `prefix`, `suffix`, in that order, all strings (section 6.5). |
| `stamp` | object | `at` (integer, milliseconds since the epoch) then `device` (string, 1–64 characters) (section 6.6). |

An item is **usable** by a reader when its `format` is one the reader
implements and every field validates: `id` matches the pattern, `locator` is
a non-empty string, `anchor.exact` is a non-empty string, `anchor.prefix` and
`anchor.suffix` are strings, `stamp.at` is a finite integer and `stamp.device`
a non-empty string. Anything else is carried through and never adopted.

### 6.3 The Document Id, for `epub`

The rule is OpenReader's ADR 0004 (`src/core/document/identity.ts` and
`zip.ts` there), copied into the plugin rather than reimplemented. Stated in
full so that a second implementation produces the same bytes:

1. The archive's **central directory** is read: find the end-of-central-
   directory record by scanning the last 22 + 65,535 bytes for its signature,
   take the directory's offset and size from it, and read exactly that range.
   The whole file is never digested.
2. For each central-directory entry, one line: the member's **name as its raw
   bytes** (not decoded), a NUL byte, the CRC-32 of the member's uncompressed
   bytes as an unsigned **decimal** number in ASCII, a NUL byte, the
   uncompressed size as a decimal number in ASCII, a line feed.
3. Lines sorted by the name's bytes as unsigned values with a shorter prefix
   first, then by CRC-32, then by uncompressed size, so the order is total even
   when an archive holds two members of one name.
4. The digest input is the ASCII line `epub-zip-v1` and a line feed, followed by
   the sorted lines. The id is `sha256:` plus the lowercase hex SHA-256 of that
   input.

The implementation **refuses** rather than falling back to any other rule,
because a document with two possible ids is not identified: no end record;
ZIP64 (an end-of-central-directory-64 locator, or a member whose uncompressed
size is `0xffffffff`); a split archive; a directory that does not end where the
end record begins; a member count that does not match the records; a NUL byte
in a member name; a read that returns fewer bytes than asked for.

Measured (ADR 0004): 220,092 bytes read and 94,876 digested of a
34,453,009-byte novel; the same book repacked at two other compression levels
has the same id.

### 6.4 The locator, for `epub`

An **element CFI naming the Block the sentence is in**: the spine step, `!`,
then even element steps down to a paragraph-level element, and nothing else.

```
epubcfi(/6/34!/4/2/4/2/4)
```

Grammar: `epubcfi(` `/6/` even integer `!` (`/` even integer)+ `)`. No `[id]`
assertions, no text step (odd integer), no character offset (`:`), no range
(`,`), no temporal or spatial part.

- The plugin writes the SDT block's `anchor.selectorMap` path, assertions
  stripped, of the block the active segment belongs to. Never a text-node
  path: Zotero numbers text steps by the spec (`1 + 2 × elements before`) and
  upstream epub.js counts text nodes, so a text-node path resolved to the
  right node in 81 of 430 cases measured on 2026-09-21.
- OpenReader writes `cfiFromNode(blockElement)` with every `[...]` assertion
  removed. A true assertion resolves identically in Zotero; a wrong one makes
  Zotero's DOM resolver answer null; stripping is the one spelling both sides
  produce.
- A reader resolves the locator to an element or block, then **verifies it by
  the anchor** (section 6.5). It never starts reading from a bare locator: in
  Zotero an element CFI naming a paragraph starts at that paragraph's first
  sentence, one naming a container starts at the section's first sentence,
  and a locator that names the wrong block does so silently. Measured on
  2026-09-21 (OpenReader `notes/NOTES_2026-09-21.md`, 17:11): 121,376 of
  121,376 paragraph and heading blocks in two `.xhtml` books resolved to the
  identical block on both sides, and a `.html` member with self-closing tags
  put a whole chapter one paragraph off on the OpenReader side. The anchor is
  what covers the second case.

### 6.5 The text anchor

`exact` is the sentence speech stopped on, as the writer's own segmenter
delimited it, in Unicode **NFC**. Zotero's segment text is also
whitespace-collapsed and trimmed; OpenReader's is a verbatim slice of the
block's text. The two writers therefore agree on characters and may differ on
whitespace, which is why a reader matches in three steps and stops at the
first that finds anything: the same characters (the anchor as stored, then
NFC, then NFD, against the text as it is); the same words in the same order,
compared on NFKC-folded tokens; then words aligned with a longest common
subsequence, accepted only above a fraction of the anchor's words found. The
reference implementation is OpenReader's `src/core/document/anchor.ts`; the
aligner is `core/align.ts` in both products.

A writer that knows the paragraph but not the sentence in it — the plugin
deriving an item from a position it held before this file existed, whose text
step Zotero's own mapper cannot place — may quote the whole paragraph as
`exact`. A reader resolves such an item to the **start** of the matched text,
which is the paragraph's first sentence; it does not guess a sentence inside it.

`prefix` and `suffix` are up to 32 UTF-16 code units of the **same block's**
text immediately before and after `exact`, NFC, empty at the block's edges.
They never make a match; they only rank places that match `exact` equally
well. A reader that finds two places matching equally well after ranking
**refuses** rather than picking the first.

Resolution order for a reader: the locator's block first; if the block does
not resolve or the anchor is not found in it, every block of the document in
reading order; a match in another block is a *recovered* position and the
reader may write the corrected locator back; no match, or a tie, is
*unresolved* and the reader says so and does not guess.

### 6.6 The stamp

`at` is milliseconds since the epoch, an integer. A writer recording a new
position for a document sets `at = max(now, previous.at + 1)` so a device with
a slow clock still outranks the item it adopted the moment it reads on. `device`
is the Device Name: the plugin's machine id; on a phone a name made once from
the device kind and eight random characters (`iPhone-3f9a2c1b`). It is
attribution only; the merge never compares it.

### 6.7 Merge and lifecycle

- Union by `id`. Between two items with one `id`, the greater `stamp.at` wins;
  equal stamps keep the reader's own item, so merging a file into itself
  changes nothing.
- **Nothing removes an item.** A permanently deleted Zotero attachment, a book
  removed from a phone's shelf, a machine that is gone: the item stays, because
  the document may exist on another device and its place is the whole point.
  An item costs a few hundred bytes.
- A writer emits an item only for a document that has a position. A document
  with no position contributes nothing and cannot beat an item that has one.
- Items for documents a device does not hold are carried through untouched.

### 6.8 When each product syncs (informative)

The plugin: startup, a reader opening, a tab closing, shutdown, a permanent
deletion, the pane opening, a manual import, and, from 1.13.2, ten quiet
seconds after Read Aloud pauses or the player closes, and once before a resume
(bounded at two seconds). OpenReader: launch, return to foreground, opening a
book, adding a book, pause or stop (at once), leaving the reader, entering the
background, and once before Play while paused (bounded at two seconds); never
on a timer while reading.

### 6.9 What each product adopts (informative)

The plugin adopts an item for an attachment it has named when the item's
stamp is newer than the item it already holds for that document, and keeps it
beside its native row. It names an EPUB attachment when its reader opens, and
once more before a resume when the open's naming has not landed, so a book
read on a phone alone resumes at the phone's place on a computer that never
read it (plugin 1.14.2, issue #129; before that only a sentence read there, a
row from before this file or the upgrade's backfill named one, and such a
book started from the top). Whether the adopted item beats this machine's own
native row is decided **at resume** (Shift+Space, or the player's play on a
paused session), by comparing the item's stamp with the row's own time; the
native position is built only then, in the open document, by resolving the
anchor (section 6.5); a resolution that fails falls back to the machine's own
last native position and says so. A native row from before this file existed
gets its item when the document is next opened, stamped with the row's own
time. OpenReader adopts an item for a Library entry when the item's stamp
is newer than the entry's position stamp or the entry has no position; while
the book is open and paused the highlight moves to the adopted sentence; while
playing nothing moves.

## 7. Change log

- **2026-09-21** — first version. Adds section 6 and the naming rule; records
  the retirement condition of `zotero-tts-positions.json`. Plugin 1.13.2,
  OpenReader unreleased. Same day, after implementation: 6.5 allows a
  paragraph-long quotation for an item derived from an older native row; 6.9
  states when the plugin compares an adopted item with its native row.
- **2026-09-22** — the glossary gains *Named*, and 6.9 says when the plugin
  names an attachment: when its reader opens, not only once it has been read
  there (plugin 1.14.2, issue #129). No change to any file's shape.
