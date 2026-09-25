# Scripts: Highlight and underline the sentence (issue #145, 1.15.1)

[Case](../../cases/annotate-keys.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

| Script | What it checks | What it expects | Params it reads |
| --- | --- | --- | --- |
| `01-fixture-and-defaults.js` | Mutes; reads the raw `shortcuts.highlightSentence`/`underlineSentence` prefs; opens the settings pane's Keyboard shortcuts rows; imports+opens fixture A; polls `_internalReader`/`_readAloudManager` | Both prefs read `Shift+H`/`Shift+U`, no user value; pane rows "Highlight sentence"/"Underline sentence" show buttons `Shift+H`/`Shift+U`; reader ready, idle, 0 annotations | `fixturesDir`, `fixtureTitle` |
| `02-shift-h-playing.js` | Restores/focuses the host, selects the fixture tab, starts playing, trusted Shift+H | `keydown()` 1; one new `highlight` annotation, text = `getSegmentToAnnotate()` captured just before the press; `annotationPopup` names it; still playing | state from 01 |
| `03-shift-u-popup-open.js` | Trusted Shift+U while the same popup is open | `keydown()` 1; the SAME annotation retypes to `underline`; count unchanged | state from 02 |
| `04-shift-u-paused-new-segment.js` | Dismisses the popup (`dismissReadAloudAnnotationPopup()`), pauses, `skipAhead('sentence')` ×2 to a fresh segment, trusted Shift+U | `keydown()` 1; one more annotation, type `underline`, on a segment distinct from the first | state from 02/03 |
| `05-no-session.js` | Closes the whole session (`toggleReadAloudPopup(false)`), trusted Shift+H, ends the foreground phase | `keydown()` 0 (falls through), no new annotation; original tab reselected, host re-minimized | state from 01 |
| `06-cleanup.js` | Erases every annotation created and the fixture, restores the volume, reports position-store rows | 0 annotations/fixture remain; volume and position rows back to baseline | state from 01-04 |

Before you start:
- Install the candidate xpi, then prove it by grepping the profile's bundle for `addAnnotationFromReadAloudSegment` (not the version string) — 1.15.0 and earlier have none.
- Fixture A's memory-selected voice must already name a listed (`::`) voice (checked live at `01`'s playback in `02`) or the session pauses on a metered Zotero voice at once (rulebook) — not re-checked as a separate gate in this kit since the profile's memory already qualified both runs.
- WebDAV: switch to the test destination and suspend `syncPositions`/`syncSettings`/`autoUploadSettings` BEFORE this kit (outside it — every kit run needs this, not just this case). Restore `url`/`username`/`password` first, only then the toggles: restoring the toggles fires a real switch-on sync against the real account (observed 2026-09-26: 100/15 remote position rows and 61 remote settings merged with 0 adopted/dropped/applied, 1 settings entry pushed — the legitimately-new 1.15.1-beta shortcut defaults). Harmless, but real and worth expecting — do the url/username/password restore and the toggle restore as two separate confirmed steps.
- Trusted input: `nsITextInputProcessor` on `Zotero.getMainWindow()` — its capturing listener sees a press regardless of which tab is focused, so every press script reselects the fixture tab first; the owner's reader must never be selected when a key goes out.
- Window state: `02` restores the host from whatever minimized/normal state it is in; `05` re-minimizes at the end (the workflow's leave-minimized exception) and reselects the owner's original tab.
- Cleanup: `06` erases every annotation this run created (ids logged in its result) before erasing the fixture attachment.

Limits:
- **The host can lose OS focus mid-run and stop responding to `minimize()`/`maximize()`/`restore()`/`Services.focus.activeWindow =` entirely** (2026-09-26): all four become silent no-ops (no error, no state change; confirmed by `Services.focus.activeWindow === null` app-wide) until some outside event returns it to the foreground — opening a new dependent window did not help. `nsITextInputProcessor` presses kept working perfectly throughout regardless; they need no real OS focus. This run's `02` landed on the window's NORMAL bounds (1406×909 @ 89,33) instead of its true starting MAXIMIZED state (1461×949 @ 0,33, `windowState` 1), and `05`'s final `minimize()` then silently failed, leaving the host NORMAL rather than minimized (the correct tab was still reselected). Left open rather than forced, since no retry changed the outcome — see the run's report for the exact values to restore by hand.
- `annotationPopup.annotation.id` is the annotation's Zotero **key** (e.g. `U25S8QCW`), not its numeric item id; `02`-`04` log the created annotation's numeric `id`, not `key`. Cross-checking the two needs `Zotero.Items.get(id).key`, not done live since the item was already erased by the time this was noticed — the match is circumstantial (sole annotation present at that moment) though consistent every time. Add `.key` to the `created` objects before relying on a direct comparison.
- First attempt at `01` threw (`this.navigation is undefined`) calling `navigateToPane` right after the window object appeared, before `Zotero_Preferences`'s own `init()` had run; fixed by awaiting `waitForFirstPaneLoad()` first (bounded at 8s) — kept in the script below.

Runs:

| Date/build | Coverage and result | Run |
| --- | --- | --- |
| 2026-09-26 / 1.15.1-beta (sha1 `b70cadac48937ee801dda2b177e5ae53f8b01c21`) | Items 1-6 all PASS | `2026-09-26-1.15.1-beta-annotate-keys-r2` (first attempt `...-annotate-keys` failed at `01` on the `navigateToPane` race above, not kept) |
