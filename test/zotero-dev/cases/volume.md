[Checklist index](../README.md)

## 4a. The volume (issue #62)

A gain ahead of Zotero's own filter chain in every controller, at the
percent in `readAloud.volume` (0–100, default 100 = Zotero unchanged and
the most; the boost above 100 went with issue #66). Two fixtures open;
the level back at 100 at the end. `gainValue` is a float32 AudioParam:
0.7 reads `0.699999988079071`, 0.6 reads `0.6000000238418579`; 1 and 0.5
read exactly.

1. **A session's chain carries the gain.** Fixture A reading on a plugin
   voice: `diagnostics.volume()` for that reader → `patched: {manager:
   true, controller: true}`, `active: true`, `level` = the pref, `gain` =
   level/100, exactly one chain `{kind: 'RemoteReadAloudController',
   gainValue: the gain, current: true, inChain: true, contextState:
   'running'}`, `count: 1`; the log carries `volume attached`, `volume
   attached to the controllers` and `volume gain inserted
   (RemoteReadAloudController)` for the tab. A popup opened from chrome
   leaves the context `suspended` (the autoplay gate): the session needs
   `reader._iframeWindow.document.notifyUserGestureActivation()` and a
   `play()` before `contextState` reads `running`. `count` grows by one
   per tab at every in-place install — the interface redelivery (#38)
   rebuilds the controller right after attach.
2. **The keys, in the running chain.** Shift+ArrowDown / Shift+ArrowUp
   through the TIP: each `keydown()` = 1, the pref steps ∓10, the toast
   `Volume N%` in `#ztts-speed-toast` of the visible document with inline
   `opacity: 1` at the press and `0` by ~1100 ms, and `volume()` shows the
   same chain moved to the new gain with `count` unchanged and
   `current` / `inChain` still true: the level lands in the chain being
   spoken, no controller is rebuilt. Works with the session `paused` too.
   At 100, Shift+ArrowUp leaves the pref at 100, still shows `Volume
   100%`, and the chain stays at `gainValue: 1` with `count` unchanged:
   the ceiling is the model's, not the field's, and the key is consumed
   either way (issue #66).
3. **No session: the key falls through.** Popup closed (`active: false`,
   `chains: []`): the press leaves the pref and the toast untouched.
   `keydown()` still returns 1 — the reader takes the arrow itself — so
   the pref and the unchanged toast are the evidence, never the return
   value.
4. **The pane's field is the same number.** `#ztts-volume` (type number,
   min 0, max 100, step 10, bound to the pref) redraws to whatever the
   keys wrote; setting `.value` and dispatching `input` writes the pref at
   the `input` event, and every open chain follows with `count`
   unchanged. The row sits between the Speed slider and the voice
   browser; the shortcut rows `Quieter (−10%)` / `Louder (+10%)` sit
   between `Faster` and `Previous sentence`, showing `Shift+ArrowDown` /
   `Shift+ArrowUp`. The three `?` icons open `ztts-help-tip` at once with
   Zotero's native tooltip `closed`; `diagnostics.l10n()` shows
   `blank: []`.
5. **A popup sample is gained too.** A sample built the popup's own way
   (`voice.getSampleController([{ text }])`, then `paused = false`;
   reader.js:38185-38207) appears beside the session's as `{kind:
   'RemoteSampleReadAloudController', gainValue: the gain, current: false,
   inChain: false}` with `count` one higher and the log line `volume gain
   inserted (RemoteSampleReadAloudController)`; `destroy()` prunes it and
   `count` stays. `current` / `inChain` are read against the manager's
   live controller, so every other chain reports both false by
   construction.
6. **A Zotero voice goes through the same gain — without switching the
   session.** Every voice in `_allVoices` is one class with one
   `getController` (`RemoteReadAloudVoice`, reader.js:40468-40470), whose
   base constructor only builds the chain and fetches nothing
   (reader.js:39923-39927). So `zoteroStandardVoice.getController(segments,
   null, null)` yields a `RemoteReadAloudController` whose
   `_filterChainInput` is a `GainNode` at the current level, and
   `destroy()` prunes it — no credits, the session untouched. **Never
   switch a live session to a Zotero-tier voice while another tab holds a
   session**: memory-sync's `spreadVoice` pushes the pick onto every
   reader with `manager.active`, paused included (memory-sync.ts
   ~753-775), which would put a metered voice on the user's document.
7. **Every tab follows one write.** With N sessions open, a single write
   of the pref moves every current chain to the new gain with all counts
   unchanged; `diagnostics.patches().volume` is `{total: 2N, live: 2N}`
   (a manager prototype and a controller base class per tab), and closing
   a tab leaves its two in `total` while `live` drops.
8. **An in-place reinstall under the sessions.** `startup()` lists `Read
   Aloud volume` with `failed: []`; every open reader is `patched` both
   true again with a current chain at the current gain (the new instance
   inserts its own node ahead of the chain the stopped instance left at
   1); the log repeats `volume attached` per tab. No `can't access dead
   object`, nothing from `zotero-tts.js`.
9. **A stored level outside the range settles at the first start**
   (issue #66).
   `Zotero.Prefs.set('extensions.zotero.zotero-tts.readAloud.volume', 150, true)`
   — what 1.11.1's field could write — before an in-place install:
   afterwards the pref reads 100, the debug log carries exactly one
   `[zotero-tts] volume settled to 100 from 150`, `startup()` lists
   `Read Aloud volume` with `failed: []`, and the pane's field shows 100.
   A second in-place install with the pref already at 100 logs no settle
   line: the settle writes only for a level outside 0–100 or not a whole
   percent.
10. **A level above the range never reaches the audio.** With a session
    speaking, `Zotero.Prefs.set(pref, 200, true)` by hand: `volume()`
    stays `level: 100, gain: 1` and the live chain's `gainValue` stays 1
    with `count` unchanged. With the settings pane open the field shows
    the raw `200` until the next start — the clamp sits under the field,
    so a pref edited outside the plugin cannot boost. Put the pref back
    to 100 afterwards.
11. **Not testable here.** The Windows output-device rebuild
    (`_handleDeviceChange` → `_initAudioContext`, reader.js:39956-39985):
    the shadow covers it, the unit test simulates it. The settings pane's
    own sample player following the level: its `<audio>` never enters the
   DOM; unit-tested.
