[Checklist index](../README.md) · [Scripts](../scripts/late-audio/README.md)

## Audio that arrives after its tab closed is dropped (issue #116, 1.12.11)

Zotero's controller keeps up to three sentences of audio on the way
(`_prefetchFrom`, `resource/reader/reader.js:40258-40260`: MAX_WINDOW 3,
two requests at a time), and nothing cancels them when the popup closes
(`deactivate`, reader.js:82728) or the tab does: `Zotero_Tabs.close` runs
`tab.onClose()` synchronously (`chrome/content/zotero/tabs.js:767-768`) and
removes the browser element a `setTimeout` later (tabs.js:773-774), which
nukes the reader window. A result landing after that used to throw twice —
the prefetcher reading the dead `_internalReader` for the next segments,
then the interface wrapper cloning the result into the dead window — two
`can't access dead object` lines per late result, `line: 0` in
`Zotero.getErrors()` and the bundle line in the console message's
`columnNumber`. Since 1.12.11 the result is **dropped**: not cloned, not
resolved, not logged as an error (`src/read-aloud/window-interface.ts`);
the prefetcher answers `[]` for a reader whose window is gone
(`src/read-aloud/upcoming-segments.ts`); and the plugin's own prefetch
chain stops before its next request once the reader is gone
(`prefetchAfter`, `src/read-aloud/remote-interface.ts`). The count is
`JSON.parse(Zotero.ZoteroTTS.diagnostics.patches()).lateResults` —
`{ dropped, byMethod: { getAudio: n, … }, last: [{ method, at }] }`, the
last ten drops — and `patches()` is synchronous, like `startup()`. The
debug store carries one `late result dropped: getAudio answered after its
reader window was gone` line per drop and one `prefetch: <provider>:
stopped, the reader is gone` line per chain ended.

Run the baseline first. Fixtures: `fixture-a.pdf` and `fixture-b.pdf` as
standalone attachments, erased in calls of their own. The plugin's volume
at 0 for the whole case; `readAloud.memory` pointed at a listed **free**
voice of a plugin provider whose synthesis takes about a second or more
(Kokoro on the h200 is ~1 s; MiMo several, but paid per request — say
which was used and why). `play()` is called on the fixtures only, never
on the owner's document. Nothing here is audible by design; the check is
the diagnostic, the debug store and the console. Read `lateResults`
before every item and report the rise, never the absolute: the counter is
the instance's, and a drop from another tab counts too. Expected values
come from the design and are corrected from the run.

### 1

1. **A late result after the × path.** Open `fixture-a.pdf`, open the
   player, `play()`, and about 200–300 ms later close the tab the way the
   × does: `reader._window.Zotero_Tabs.close(reader.tabID)`. Wait ~5 s.
   Expected: `lateResults.dropped` up by ≥ 1 with the rise in
   `byMethod.getAudio` and `last[last.length - 1].at` within the seconds
   after the close; one `late result dropped: getAudio answered after its
   reader window was gone` line per drop in the debug store; the reader
   gone from `Zotero.Reader._readers`; **no** `can't access dead object`
   in the console after the close, found by content and timestamp
   (`Services.console.getMessageArray()`, an entry's `timeStamp`). If
   `dropped` did not rise, the request landed before the window died:
   repeat with a shorter delay or a slower provider, and say so.

### 2

2. **The prefetch chain stops with the reader.** Prefetch on (its
   default, 3 sentences; raise `zotero-tts.prefetch` toward 10 for the
   check if the chain is too short to catch, restored after) on a fixture
   whose audio is not cached yet (`fixture-b.pdf`, or a restart emptied
   the cache). `play()`, wait until the first `prefetch: <provider>: N
   chars ready ahead of playback` line appears (the chain is running),
   then close the tab as in item 1. Expected: exactly one `prefetch:
   <provider>: stopped, the reader is gone` line, no `ready ahead of
   playback` line after it, `dropped` up by the requests Zotero itself
   had in flight (1–3). If the chain had finished before the close, NOT
   TESTABLE with the reason and the retry taken.

### 3

3. **The erase path, as the kits' teardown does it.** A fixture tab
   reading; `toggleReadAloudPopup(false)` about 300 ms after `play()`,
   then `item.eraseTx()` about 300 ms later — the sequence of
   `openai-split/05-cleanup-restore.js`, and the one the issue was found
   on. Expected as in item 1: `dropped` up by ≥ 1, no dead-object line,
   no other line from `zotero-tts.js`; Zotero One's
   `NS_ERROR_FILE_UNRECOGNIZED_PATH` at an erase is its own noise, not a
   finding.

### 4

4. **Control: a quiet close.** A fixture tab whose popup has been closed
   for ≥ 5 s, so nothing is in flight, closed with `Zotero_Tabs.close`.
   Expected: `dropped` unchanged, no `late result dropped` line, no error.

### 5

5. **Playback itself is untouched.** After item 1, open a fixture again
   and read two sentences: the manager's `_currentIndex` advances, the
   `<provider>: … chars` synthesis lines and the `ready ahead of playback`
   lines appear as before, `dropped` unchanged while the tab lives.

**State**: the plugin's volume (snapshot and restore, user-value state
included), `readAloud.memory` (byte-identical restore, the last write),
`extensions.zotero.reader.readAloudVoices` (a fixture rewrites its `en`
entry — snapshot and rebuild), `zotero-tts.prefetch` if raised, the
fixture items. **Budget**: a handful of short readings on the chosen
provider; on Kokoro nothing is metered. **Human-only**: nothing — the
feature's whole effect is the absence of console lines.
