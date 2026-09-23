# zotero-tester — driving notes, by topic

The per-topic facts of driving Zotero through the bridge, read on demand
by the section the task needs (the index is in
[`zotero-tester.md`](zotero-tester.md), "How to drive", item 6). Every
entry was paid for by a run that went wrong first; a date names the run.

## §1 The settings pane

An open settings window keeps the OLD pane after a reinstall: close it
(`Services.wm.getMostRecentWindow('zotero:pref').close()` through
`zotero_execute_js`) and reopen it with `zotero_open_preferences`. That
opens the window on the pane it last showed — the General pane on a fresh
profile — whatever paneId it is given, so navigate regardless:
`await win.Zotero_Preferences.navigateToPane('zotero-tts-pane')` on
`win = Services.wm.getMostRecentWindow('zotero:pref')` and wait until
`win.document.getElementById('ztts-provider-openai-official')` exists. The pane is
that window's `document`; the element ids are in
`addon/content/preferences.xhtml` and `src/ui/*-rows.ts`. `button.click()`
fires the XUL `command`. Wait for the voice browser's status line to leave
"Listing voices…" before reading the columns. To see that transient at
all, open the window and poll in ONE script —
`Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top')`,
then read the status line from 0 ms — since the bridge's round trip
outlasts the listing. `win.close()` is asynchronous: poll
`getMostRecentWindow('zotero:pref')` down to null before reopening, or the
next script lands in the dying window. A plugin pane's own sheet reaches
`doc.styleSheets` a beat after `navigateToPane` returns (2026-09-06:
absent at 40 ms, there on the next read) — poll for it before reading its
rules. Never switch Zotero's locale with the settings window open: it
kills Zotero.

## §2 Transient states

`Checking…`, `Testing…`, `Listing voices…`: one `zotero_execute_js` script
that clicks, then polls the attributes every 100 ms into a trace with
timestamps, and returns the trace with the final state — never a click in
one call and a read in the next.

## §3 The Read Aloud manager

`reader._internalReader._readAloudManager` — `active` means the session
is open (paused counts), `paused`, `selectedVoiceID`, `_selectedTier`,
`languages`. Driving the manager: `selectTier()` and `selectVoice()`
activate an idle manager and start synthesis even with the popup closed;
`_prepareReadAloud()` runs the restore path silently, and a second call
skips the SDT language block (reader.js:83987); at the end of a document
the controller rewinds to the run's start (`_backwardStopIndex ?? 0`,
reader.js:39498) with the manager still `active`, so read every "before"
inside the script that acts. An options object built in chrome scope reads
as empty over in the reader compartment (`scrollTo({top, behavior})` does
nothing): `Cu.cloneInto` it, or use positional arguments. Smooth scrolling
did not animate in this window (2026-08-31), so Zotero's own Read Aloud
follow is invisible and "the view returns" is not testable here.

`toggleReadAloudPopup(true)` on a document whose memory names a listed
voice **starts playback at once** (`active`, `paused: false`) — open it
and pause it in the SAME script, and check the voice is one of ours before
opening at all; the voice dropdown is behind the player's Options button
and is not in the DOM until that is clicked. The player's markup mounts
only in the tab that is selected when the popup opens: opened through the
API in a background tab, `popupOpen` goes true and the manager `active`
while `.read-aloud-popup` never appears, not even once the tab is selected
(2026-09-06) — open the player in the selected tab, and drive its
dropdowns there. **Never a bare `_prepareReadAloud()` (or `setLanguage`)
on a tab before its first popup open**: `_updateReadAloudUIState` drops
every write while the popup is closed (reader.js:83565-83569), the SDT
block that writes the UI's `lang` runs only while the manager has none
(83983-83995), and the player then never renders for the tab's life
although the session is active (the render gate, 42586; measured
2026-09-05) — `toggleReadAloudPopup(true)` first, always. An options object
handed to `_updateReadAloudUIState` needs `Cu.cloneInto` like `scrollTo`'s.
The player's option rows select on `pointerup`, not `click`
(reader.js:37954-37958): `element.click()` on one does nothing;
`row.dispatchEvent(new win.PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }))`
does. `diagnostics.playerOptions(true)` presses the Options button of
**every** reader with a player, not the picked one — restore the others by
clicking their own button. `view._readAloudPositionLocked` is already
`true` when a session starts: force it `false` through
`Components.utils.waiveXrays(view)` before asserting that a key locked it.

**Probe the audio before any check that needs playback to advance**: on a
machine without an output device (a remote desktop session with no audio
redirection) the Read Aloud `AudioContext` stays `suspended` at
`currentTime` 0, `source.onended` never fires and `_position` never moves
on its own, while synthesis, timestamps, highlight and prefetch all run;
an `<audio>` element there fails with `OnMediaSinkAudioError` a few ms
after `playing`. Read the controller's `_audioContext.state` and
`currentTime` twice ~500 ms apart in one script; frozen means every
"speaks within N s" is NOT TESTABLE (machine) and the mechanism checks
still run. The device came and went within one day (2026-09-05), the sink
is per content process and does not recover in place (a new reader tab
gets a fresh one), and `AudioContext.resume()` never settles while it is
gone — always `Promise.race` it against a timer, or the script is the
timeout's bare `undefined`. `manager.repositionTo(i)` *replaces*
`_controller`: a script that captured it once polls a dead object — re-read
it every tick, and pause on a word by `m.activeTimestamp.charStart`, not
`activeTimestampIndex`.

`selectTier` **persists**: it runs `_persistCurrentVoice`
(reader.js:82072-82112) and rewrites
`extensions.zotero.reader.readAloudVoices` — snapshot that pref before a
tier switch and write it back after the tab is closed, or a reader
observer re-persists over the restore. A Zotero-tier voice needs
`selectTier('premium')` (or `'standard'`) before `selectVoice(id)`: the
manager's `voices` are filtered by the selected tier
(reader.js:81994-81996) and `_applyVoice` drops an id outside it — `_voice`
null, controller destroyed, no error (2026-09-04). Resuming after a voice
change needs a fresh
`reader._iframeWindow.document.notifyUserGestureActivation()` — on the
reader iframe's *document*; `windowUtils` has no such method in this
Firefox (2026-09-06). While the selected id has no `::` (a metered voice),
resume, poll and pause go in the SAME script — every bridge round trip is
billed audio, and a check capped at four sentences ran thirteen once.
Walking reader-compartment arrays from chrome: `Array.prototype.filter`
returns `[]` (an index loop over the same `_allVoices` counted 1452
premium voices); a voice's fields are prototype getters, so
`Object.keys(voice)` is `impl, provider`. A chrome-scope write of
`extensions.zotero.reader.readAloudVoices` is a voice pick to memory-sync's
observer: it moves `readAloud.memory` onto the written voice and spreads it
to reading tabs (2026-09-06) — plant a fixture entry there only with every
tab idle, reset the memory after, and expect the restore at the end to move
the memory back by itself. The structure pack of a PDF is read from the open
reader (`_internalReader._sdt.structure`), never through
`Zotero.SDT.getPack`, which serves a stale pack and starts a regeneration
that shifts block indices; Zotero's own segment list is
`_internalReader._readAloudSegments.segments`, before the plugin's
interface sees one. Name readers by title:
`(Zotero.Items.get(r.itemID).parentItem ?? Zotero.Items.get(r.itemID)).getField('title')`.

## §4 Hover and tooltips

Move the mouse with
`win.windowUtils.sendMouseEvent('mousemove', x, y, 0, 0, 0, false, 0, 0, false, false)`
— the two trailing `false` (the DOM- and widget-synthesized flags) are what
lets the XUL tooltip listener act; the six-argument form reaches the
element and opens nothing. Approach from 30 px away, rest on the element,
nudge by a pixel, then poll. The pane's ? icons open their own
`<tooltip id="ztts-help-tip">` at once (ui/help-tips.ts, from the icon's
`help` attribute): its `state` and `label` are the evidence, and Zotero's
default tooltip must stay closed. `state` is a property of the popup
(`tip.state`), not an attribute — `getAttribute('state')` is `null` while
it is open (2026-09-04). That default tooltip (`tooltiptext` elements) is
native anonymous content, not in the DOM:
`Array.from(InspectorUtils.getChildrenForNode(doc.documentElement, true, false)).find(c => c.localName === 'tooltip')`
— its `state` (`showing` → `open`, `closed` once the mouse leaves) and
`label` are the evidence. A screenshot never shows it (an OS popup). It
opens only in the OS-active window: `win.focus()` first (with
`Services.focus.activeWindow === null` the `:hover` style applies and the
`label` is filled, but `state` stays `closed`). The pane scrolls on its
own between bridge calls, so `scrollIntoView`, the measurement and the
mouse events go in one script, never coordinates from an earlier call. To
leave an element, park the mouse on a blank spot of the pane, not at
(5, 5): that is the navigation list, and hovering it preloads other
plugins' panes (Zotero One's init throws there).

## §5 Screenshots

`zotero_screenshot` (target `window`, the id from `zotero_list_windows`)
for layout checks. At a chosen scale: `win.windowUtils.drawSnapshot` does
not exist here; use
`win.browsingContext.currentWindowGlobal.drawSnapshot(new win.DOMRect(x, y, w, h), scale, 'rgb(255,255,255)')`
(the rect must be a real `DOMRect`; CSS px of the window), then an
`OffscreenCanvas` → `convertToBlob` → `IOUtils.write`. Screenshots are
static: motion (a scroll, a highlight keeping pace) is a human's check.

## §6 Trusted key events

`windowUtils.sendKeyEvent` does not exist in this Firefox (140) — use
`nsITextInputProcessor` (`@mozilla.org/text-input-processor;1`):
`tip.beginInputTransactionForTests(win)`, then
`tip.keydown(new win.KeyboardEvent('', { key, code, keyCode }))` /
`tip.keyup(...)`, a modifier held as its own keydown/keyup pair around the
key. `keydown()` returning 1 means a handler consumed the event — that
return value is the evidence a shortcut fired, but it says only that
*someone* did: the reader takes the arrows itself when the plugin declines
them, so a negative check needs the page change as its evidence. A trusted
press also supplies the user activation the autoplay gate wants, so a
`Shift+Space` start needs no `notifyUserGestureActivation()` of its own.

## §7 The CSS rules that style an element

`InspectorUtils.getCSSStyleRules` does not exist in this Firefox (140) —
it is `win.InspectorUtils.getMatchingCSSRules(el)`, in increasing order of
precedence, each rule with `selectorText`, `style.cssText`,
`parentStyleSheet.href` and, inside an `@media`,
`parentRule.conditionText`. `(-moz-platform: macos)` there is how Zotero's
platform-only rules show, and why a margin measured on Windows is not the
Mac's (issue #56).
