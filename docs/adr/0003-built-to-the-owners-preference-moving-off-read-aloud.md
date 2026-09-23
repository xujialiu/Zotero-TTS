---
status: accepted
date: 2026-09-15
issue: 109
---

# The plugin moves off Read Aloud step by step, and document analysis stays Zotero's

*The product argument — what this is for and what it gives up — is
[design 0003](../design/0003-built-to-the-owners-preference-moving-off-read-aloud.md).*

The owner's own preference is the only yardstick; the rules are in
`docs/PHILOSOPHY.md`. The plugin takes Read Aloud's pieces over one at a time
and never takes on Zotero's document analysis. No end state is recorded: a
player of the plugin's own is the direction, not a goal on file.

## The boundary, and what it rests on

Read in the installed Zotero 10.0.3-beta.1, whose `reader.js` was
byte-identical to the 2026-09-14 copy; the full research, with every citation,
is notes/NOTES_2026-09-15.md, "What can be separated from Read Aloud"
(14:31). rj = `resource/reader/reader.js`, wk =
`resource/document-worker/worker.js`. Facts were read in source unless marked
inferred.

- **Document analysis is too heavy to redo.** It runs in the document worker,
  started from chrome by `Zotero.SDT.getPack` (`sdt.js:81`), is cached as
  `.zotero-sdt-cache` beside the attachment (`sdt.js:26`), and is requested at
  every reader open (rj:83041). An ONNX clusterer cuts a PDF's blocks
  (wk:143973), an ONNX classifier labels them body, auxiliary or excluded
  (wk:144026), text repeated in a page's edge band on three or more pages is
  excluded (wk:156173), and a paragraph continues only through a part link
  (wk:155896). Its size: 15.7k lines of PDF structure analysis over 126.7k of
  pdf.js core, a 13.5 MB ONNX runtime and 9 MB of models. Zotero does not keep
  it for Read Aloud alone.
- **The analysis is reachable without Read Aloud.** Chrome's
  `Zotero.SDT.getReader(itemID)` offers `materialize`, `getBlocks` and
  `getPageBlocks` (`structured-document-text.js:326-398`) with no tab open;
  that the sandbox can call it is inferred. Inside a reader,
  `_internalReader._loadSDT()` returns `{ structure, mapper }` (rj:84024),
  which the plugin already shadows (#87, #104); the mapper converts positions
  both ways for PDF, EPUB and snapshot and lives in the reader realm.
- **Segmentation is not reachable.** `buildSDTReadAloudSegments` (rj:71256),
  sentencex (rj:71596) and the mapper factory are private to the bundle,
  which exports only `window.createReader` (rj:85740). The only caller,
  `_requestReadAloudSegments` (rj:84048), returns unless the manager is
  active, and then builds a controller through `setSegments` (rj:82543). A
  port is about 870 lines, plus sentencex (7.6k lines) and eld (737 lines and
  2 MB of data); Zotero and the plugin are both AGPL-3.0.
- **The highlight goes with whoever plays.** Zotero re-pushes it on every Read
  Aloud state change (rj:83388–83390, 83923), and the PDF view clears it
  unless the popup is open (rj:76434).
- **Read Aloud's player and engine** are about 1,855 and 1,908 lines: the popup
  (rj:38480), a controller reading 3 segments ahead with 2 fetches at once
  (rj:40258–40260), a WSOLA time-stretch (rj:39755), an AudioContext chain
  (rj:39944) and the gap timer (rj:39405).
- **The Zotero voices stay reachable** from a player of the plugin's own:
  `Zotero.Sync.Runner.getAPIClient({ apiKey })` speaks `tts/speak`, but that
  bypasses Zotero's audio cache (inferred), so repeated text would be billed
  again unless cached with `noStore` honored, and a replacement rebuilds the
  low-balance warning under 3 minutes (rj:82160), the purchase link and the
  first-run notice that Premium text goes to outside providers
  (`reader.ftl:249-258`).

At the time `src/read-aloud` was 9,509 of 25,237 lines: following and
highlight 2,476, analysis and segmentation patches 966, positions 1,225.

## What changed in the rules

- **Kept**: honest signals; bring your own provider, with the wording
  corrected (keys also go into the backup file and the user's own WebDAV);
  every hook verified against Zotero's source, recorded and pinned to one
  Zotero major, without "thin" and without "the hooks go when Zotero offers an
  API"; a setting must do something.
- **Added**: no silent spending.
- **Softened**: "uninstall and Zotero is as it was" became "Zotero keeps
  working", because the plugin already writes into Zotero's own voice memory.
- **Dropped**: Zotero keeps the reading; add, never take away; when Zotero
  catches up; a second player, a reading list, a mini-reader.

## Turned down

- Framing the plugin for readers with dyslexia or visual impairments: the
  owner dropped both, and preference is the only standard.
- Naming the Read Aloud design choices the owner dislikes, and writing down a
  player of the plugin's own as the end state.
- Keeping PHILOSOPHY English-only; putting only the Chinese page in `docs/`
  with the English at the root, which breaks the same-folder pairing that
  `test/docs-translation.test.ts`, `scripts/pin-docs.mjs` and the site rely on.

## Consequences

Each piece that leaves Read Aloud is its own decision, priced against these
numbers when it is taken; the engine's is ADR 0005. What sits below
segmentation — which text is body text, how a paragraph continues — is at
most patched (#87, #104), never replaced.

The research left one item unverified: that a user not signed in to Zotero
sync sees no plugin voices, because `loadVoices(this._state.loggedIn)` skips
the remote interface. It was confirmed and fixed in #130.
