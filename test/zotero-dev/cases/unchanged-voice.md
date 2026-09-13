[Checklist index](../README.md) · [Scripts](../scripts/unchanged-voice/README.md)

## A voice list landing on the playing voice keeps the controller (issue #75, 1.11.4)

Item 3.27 of the checklist. It was item 3.19 until 2026-09-10, when the
checklist change for #68 wrote over it, and is back here under a new number.

### 3.27

27. **A voice list landing on the voice already playing keeps the
    controller** (issue #75, 1.11.4). `fixture-a.pdf` as a standalone
    attachment, the memory pointed at `local::af_bella`. A tab's **first**
    open resolves the voice before playback and rebuilds nothing; the bug
    is the **second and later** opens, where the still-populated list
    starts playback at once and `loadVoices` lands 1.2–1.6 s later —
    `_resolveVoice`'s keep-branch (reader.js:82428-82432) calls
    `_applyVoice`, which recreates the controller unconditionally
    (reader.js:82523). Check: close the player
    (`toggleReadAloudPopup(false)`), wait a second, start again with a
    trusted `Shift+Space` (`nsITextInputProcessor`, rulebook step 9), and
    sample every 100 ms for 12 s the manager's `active`/`paused`, the
    identity of `_controller` against the first one seen,
    `_controller._audioContext.currentTime`, `_currentIndex` and
    `activeTimestampIndex`. Expected: **one controller for the whole
    window**, the clock monotonic (never back to 0), the word index never
    replaying; `diagnostics.unchangedVoice()` for that tab
    `{patched: true, active: true, voice: "local::af_bella", kept: 1,
    last: "local::af_bella"}`; in the log one `volume gain inserted`, then
    `hid 9 system voices from the Local tier`, then `kept the controller:
    the voice list landed on the voice already playing (local::af_bella)`,
    and the first segment's `local: N word timestamps for M chars` line
    **once**. Zotero's own start (`Ctrl+Shift+R`) after another close is
    the same, `kept: 2`. Contrasts, with
    `zotero-tts.readAloud.sameForAllDocuments` set to `false` for the
    voice change only (memory-sync's `spreadVoice` would otherwise carry
    the pick into every other reading tab, a metered one included):
    `selectVoice('local::am_puck')` while reading gives a **new**
    controller in 30–45 ms — the clock back to ~0, a `volume gain
    inserted` line — with `kept` unchanged, and
    `selectVoice('local::af_bella')` back another; then
    `selectTier('local')`, the chip of the current tier, keeps the
    controller and takes `kept` to 3. Rewind with
    `skipBack('paragraph')` and resume with `play()` rather than closing
    and reopening the popup, or the reopen's own keep is counted too.
    **After an in-place upgrade a tab nobody touched can already read
    `kept: 1`** — the re-attach re-resolves the voice on a live session
    and the guard spares that controller as well (measured on the user's
    paused Zotero-Premium session, 2026-09-08) — so read `kept` as an
    increment, never as an absolute. Was, on 1.11.4-beta5 (the first
    attempt at the fix): a second `volume gain inserted` right after
    `hid 9 system voices`, the clock back to 0 about 1.3–1.65 s after
    the press, the word index replaying from 0, the same `word
    timestamps … (cached)` line twice, and `kept: 0` on every path — the
    guard walked `_allVoices` and `voicesForLanguage` with `find` /
    `some`, whose callback the reader realm silently never honors
    (`undefined` / `false`, while an index loop over the same arrays
    finds the voice). **State**: the memory (byte-identical restore,
    the last write), `extensions.zotero.reader.readAloudVoices` (the
    fixture rewrites its `en` entry — snapshot and rebuild), the fixture
    item (erased in a call of its own). Keep `readAloud.memory` on a
    listed **free** voice throughout: a session on a `d072a0bf-…` id is
    metered. **Budget**: five short Kokoro readings of a 17-segment
    fixture; the fixture ends inside the 12 s window at 1.7×, and the
    manager then rewinds to `_backwardStopIndex ?? 0` still active, so a
    later start resumes at segment 15–16.
