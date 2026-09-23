[Checklist index](../README.md) · [Scripts](../scripts/volume/README.md)

## 4b. The volume (issue #62)

A gain ahead of Read Aloud's filter chain, at the percent in
`readAloud.volume` (0–100, default 100 = Zotero unchanged and the most; the
boost above 100 went with issue #66). Since issue #133 the chain is the
Engine's own copy (ADR 0006), one per reading session, and the gain is its
first node: `diagnostics.engine()`'s `audio.gain` per reader. Two fixtures
open; the level back at 100 at the end. The gain is a float32 AudioParam:
0.7 reads `0.699999988079071`, 0.6 reads `0.6000000238418579`; 1 and 0.5
read exactly.

1. **A session's chain carries the gain.** Fixture A reading on a plugin
   voice: `diagnostics.engine()` → top-level `volume` = the pref, and for
   that reader `controller.ours: true`, `audio: {state: 'running', gain:
   level/100, contexts: 1}`.
2. **The keys, in the running chain.** Shift+ArrowDown / Shift+ArrowUp
   through the TIP: each `keydown()` = 1, the pref steps ∓10, the toast
   `Volume N%` in `#ztts-speed-toast` of the visible document with inline
   `opacity: 1` at the press and `0` by ~1100 ms, and `audio.gain` moves
   to the new level with `audio.contexts` and `stats.controllers`
   unchanged: the level lands in the chain being spoken, nothing is
   rebuilt. Works with the session `paused` too. At 100, Shift+ArrowUp
   leaves the pref at 100, still shows `Volume 100%`, and the gain stays 1:
   the ceiling is the model's, not the field's, and the key is consumed
   either way (issue #66).
3. **No session: the key falls through.** Popup closed (`active: false`,
   `audio.state` `closed` or `none`): the press leaves the pref and the
   toast untouched.
   `keydown()` still returns 1 — the reader takes the arrow itself — so
   the pref and the unchanged toast are the evidence, never the return
   value.
4. **The pane's field is the same number.** `#ztts-volume` (type number,
   min 0, max 100, step 10, bound to the pref) redraws to whatever the
   keys wrote; setting `.value` and dispatching `input` writes the pref at
   the `input` event, and every open chain follows, nothing rebuilt. The row sits between the Speed slider and the voice
   browser; the shortcut rows `Quieter (−10%)` / `Louder (+10%)` sit
   between `Faster` and `Previous sentence`, showing `Shift+ArrowDown` /
   `Shift+ArrowUp`. The three `?` icons open `ztts-help-tip` at once with
   Zotero's native tooltip `closed`; `diagnostics.l10n()` shows
   `blank: []`.
5. **A popup sample is Read Aloud's** (issue #133, an open question on
   the issue). A sample built the popup's own way
   (`voice.getSampleController([{ text }])`, then `paused = false`;
   reader.js:38185-38207) is Read Aloud's own controller with its own
   chain and no gain: it plays at Zotero's level whatever the pref says.
   Until issue #133 `volume.ts` gained it too. The voice browser's samples
   set their element's volume and still follow the level.
6. **A Zotero voice goes through the same gain.** A session on Zotero
   Standard is the Engine's like any other ([engine](engine.md) item 21):
   `audio.gain` the level. **Never switch a live session to a Zotero-tier
   voice while another tab holds a session**: memory-sync's `spreadVoice`
   pushes the pick onto every reader with `manager.active`, paused
   included (memory-sync.ts ~753-775), which would put a metered voice on
   the user's document.
7. **Every tab follows one write.** With N sessions open, a single write
   of the pref moves every tab's `audio.gain` with every count unchanged;
   `diagnostics.patches().engine` holds the Engine's hooks, `live`
   following the open tabs.
8. **An in-place reinstall under the sessions.** `startup()` lists `the
   Engine` with `failed: []`; every reading pauses at its sentence and the
   new instance takes it over (`stats.adopted` 1 per tab with a session,
   [engine](engine.md) item 24); the next Play builds a context at the
   current gain. No `can't access dead object`, nothing from
   `zotero-tts.js`.
9. **A stored level outside the range settles at the first start**
   (issue #66).
   `Zotero.Prefs.set('extensions.zotero.zotero-tts.readAloud.volume', 150, true)`
   — what 1.11.1's field could write — before an in-place install:
   afterwards the pref reads 100, the debug log carries exactly one
   `[zotero-tts] volume settled to 100 from 150`, `startup()` lists
   `the Engine` with `failed: []`, and the pane's field shows 100.
   A second in-place install with the pref already at 100 logs no settle
   line: the settle writes only for a level outside 0–100 or not a whole
   percent.
10. **A level above the range never reaches the audio.** With a session
    speaking, `Zotero.Prefs.set(pref, 200, true)` by hand: `engine()`'s
    `volume` reads 100 and the tab's `audio.gain` stays 1. With the settings pane open the field shows
    the raw `200` until the next start — the clamp sits under the field,
    so a pref edited outside the plugin cannot boost. Put the pref back
    to 100 afterwards.
11. **Not testable here.** The Windows output-device rebuild (the
    Engine's copy of reader.js:39964-39993): on Windows it is
    [engine](engine.md) item 8; the unit tests simulate it. The settings
    pane's own sample player following the level: its `<audio>` never
    enters the DOM; unit-tested.
