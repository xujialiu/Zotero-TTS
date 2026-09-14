[Checklist index](../README.md) · [Scripts](../scripts/selection-start/README.md)

## Start at the selected sentence (issue #105)

Build: 1.12.8-beta4 or later. Run the baseline first. Use the owner's
loaded PDF only for read-only resolver checks; use a disposable fixture
for playback and trusted keys. Never reposition or resume an owner player.
Keep at most one fixture reader open to avoid unloading owner tabs.
Snapshot volume and its user-value status, suppress sync/backup before
temporary preferences, mute before opening any player, and restore all
state. Only close and erase the fixture this run created.

### 1. Patch identity and the reported PDF

`diagnostics.startup()` has no failed steps, including `selection start`.
`diagnostics.selectionStart()` reports `state.patched: true` on the loaded
reader for attachment `2YW7BJTZ` (when available). From its current
segments, locate the one starting `That said,`; derive its first text
span and let the real mapper construct rectangles for `That said`, `T`,
`hat said`, and `said`. All four calls to `_findReadAloudStartIndex`
return this segment, 200 on the research build, rather than 199.
The sandbox diagnostic's correction counter advances on boundary calls,
and its last indices are native 199, corrected 200. No text, sentence
position, or source rectangle is changed. Repeat with direct structure
positions at the boundary and one character after it.

### 2. PDF selection starts through Shift+Space

On a disposable PDF fixture, obtain actual selection positions with the
reader's mapper and set the selection through the view's normal selection
state; record how the selection was established. Send trusted Shift+Space.
With the player closed and then with it paused on a different sentence,
the first active segment must be the selected sentence for each:

- Its opening word and its first character alone.
- A word inside the sentence.
- A selection beginning in this sentence and ending in the following one.

The source positions and segment text stay native. Prove the first
segment at activation/repositioning, not only a later sample after it
might already have advanced. A temporary observation hook must be
restored. Use real audio where available; document any transport stub or
audio-context limitation separately from actual playback.

### 3. Pause and resume stay predictable

While the fixture is playing with text selected, Shift+Space pauses
without jumping. Paused without a selection, it resumes the same
controller position. `diagnostics.smartKey()` predicts these actions:
paused uses `togglePaused (resume; a selection restarts from it)`. Zotero's
`_onReadAloudEngineStateChanged` handles the selection after the unpause;
the plugin leaves shortcut dispatch unchanged.

### 4. DOM/EPUB and lookup fallbacks

With an available disposable EPUB fixture, repeat first-character and
middle-sentence lookup using its native mapper and selection positions;
verify a trusted selection start if practical. No PDF coordinates are
invented for DOM positions. First and final sentence selections remain
valid; unknown positions preserve the native null/fallback result.
Malformed refs, empty/gapped segments, a mapper that throws, upstream
already-correct lookup, and prototype restoration are unit-test cases,
since altering these structures on a live document would not model an
ordinary reader action.

### 5. Cleanup and limits

Read errors, close/erase only the fixture, restore temporary hooks,
selection, volume/user-value status, voice preferences, sync/backup and
the selected tab. Confirm owner players retain their prior state. No
dead-object or plugin error may result from fixture teardown. Record the
installed build and the probe counters. Hearing the correct spoken words
and judging highlight motion remain human checks when audio output is
unavailable; do not report those as verified by a resolver-only call.
