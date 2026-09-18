[Checklist index](../README.md)

## Scrolling stays smooth while the player is open (issue #125, 1.13.1)

With the Read Aloud player open — playing or paused — the document scrolls
as smoothly as it does with the player closed. Before the fix it did not:
scrolling dropped to 13 fps against 114 with the player closed, 91% of
frames over 50 ms, and the main thread was blocked 83 ms per frame.
Mechanism: the tier of a voice id is read through a factory the walk opens
once (`voiceTiers()`), so the local engine's name — which costs a whole
`loadSettings` over 66 preferences — is read once per walk of the voice
list instead of once per voice. The two walks are `scan()` in
`src/read-aloud/provider-tiers.ts`, which `rewrite()` runs every time the
reader re-renders the player's first dropdown (Zotero repositions the open
popup once per scroll frame, `reader.js` `_handleScroll` 55160 →
`_repositionPopups` 53973), and the list walk in
`src/read-aloud/live-voice-list.ts`. The engine and the server preset can
still change in the pane; the next walk opens a reader that sees them,
which is item 5.

Run the baseline first. Fixture: a long document in scrolled flow — the
owner's own EPUB is what the issue was measured on; any attachment whose
scroll height is at least ten viewports will do, opened and scrolled to
its middle so the sections walked are representative. The player is opened
muted (`readAloud.volume` 0 for the run) and paused at once; the owner's
own paused player is closed first if one is open, noted, and never
reopened. Expected values below are derived from `src/` and from the
issue's measurements, and the frame numbers assume a 120 Hz display —
scale them to the display actually in use and say so.

State it may touch: `readAloud.volume`, the fixture tab's scroll position,
the player's open state, and (item 5 only) the local engine's name.
Cleanup restores each, closes the player it opened, and leaves the owner's
untouched.

### 1. The build and its patches

`zotero_plugin_list` reports `1.13.1-beta`, and
`Zotero.ZoteroTTS.diagnostics.startup()` reports every step `ok` with
`failed` empty.

### 2. Preference reads per walk (the mechanism)

Wrap `Zotero.Prefs.get` with a counter, open the player on the fixture,
and scroll it a fixed number of frames. Expected: the count stays in the
low hundreds over the whole pass — one walk reads at most the 66 keys
`loadSettings` covers, plus the `labels()` read `rewrite` already did once
per render. It must not scale with the voice list: before the fix one walk
alone was voices × 66 (1,819 × 66 ≈ 120,000 on the profile measured). Read
`manager._allVoices.length` in the same script and report it beside the
count, since the count is only meaningful against it.

### 3. Frame rate with the player open against closed

The same scroll run twice on the same fixture from the same position, once
with the player closed and once with it open and paused. Expected: both at
or above 90 fps on a 120 Hz display, within roughly 10% of each other, and
no frame over 50 ms in either. Before the fix the two were 114 fps and
12.8 fps, with 91.2% of frames over 50 ms in the second.

### 4. The main thread is not blocked

During the pass of item 3 with the player open, a 0 ms timer chain's delay.
Expected: a median at or under 15 ms, in the same range as the run with the
player closed. Before the fix it was 82.7 ms against 8.8 ms — the number
that showed the cost was a blocked main thread and not the compositor.

### 5. A settings change still reaches the next walk

With the player open, change the local engine's name in the settings pane,
then reopen the player's first dropdown. Expected: the entry's label is the
new name. This is the contract the hoist must not break — the name is read
afresh per walk, not cached across walks — and it is the one regression the
change could cause.

### 6. The dropdown and the live list are unchanged

The first dropdown still lists one entry per provider with voices, and the
live voice list still re-tags a refreshed list. Both behaviors have their
own cases and are not re-specified here: run
[`cases/provider-tiers.md`](provider-tiers.md) item 1 and
[`cases/reader-voice-list.md`](reader-voice-list.md), since this change
edits the dependency both of them walk through.
