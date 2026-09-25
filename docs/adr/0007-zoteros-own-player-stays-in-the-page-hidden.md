---
status: accepted
date: 2026-09-24
issue: 134
---

# The Player is the only player: Zotero's own stays in the page, hidden

*The product argument — what this is for and what it gives up — is
[design 0007](../design/0007-the-plugins-player-is-the-only-one.md).*

`readAloud.usePluginPlayer` and its checkbox are removed. In every reader
the Player (`src/ui/player.ts`) hides Zotero's own player and its headphone
button with one stylesheet rule, `.read-aloud-popup, #read-aloud { display:
none !important; }`, and puts its own toolbar button in the button's place.
Every reader means PDF, EPUB and snapshot, in a tab or in a reader window:
Zotero passes `enableReadAloud: true` to each (`xpcom/reader.js` 264), a
`ReaderWindow` is a `ReaderInstance` (2204), and both kinds enter
`Zotero.Reader._readers` (2952-2995). Nothing brings Zotero's own player
back while the plugin runs.

It ships in the same release as the Engine (ADR 0005), not one release
after as #134 first asked: the owner read with `1.14.4-beta5` and found
nothing wrong (2026-09-24).

Line numbers are Zotero 10.0.3-beta.3's reader bundle,
`resource/reader/reader.js`, unless marked.

## Hidden, not removed

- The popup component is what registers the OS media keys and the
  now-playing session (`useMediaControls`, 38282-38415, called at
  38557-38581; play and pause go through a looping silent `<audio>`, 38233,
  38310-38333). Nothing else in Zotero does.
- `popupOpen`, not the popup being drawn, drives the reading:
  `_onReadAloudEngineStateChanged` activates the manager once a voice
  resolves while `popupOpen && !readAloudFirstRunPopup` (83875-83878); the
  PDF view clears the highlight unless the popup is open (76434); the
  in-document jump button (53701-53704, 75510-75514) and the annotation
  popup (55395) wait on it. The plugin's own follow and highlight gates read
  it too (`dom-follow.ts`, `pdf-follow.ts`, `highlight-style.ts`), and so
  does the Player's open state (`player-controller.ts`).
- The Player takes its colors from the hidden popup's computed style
  (`player.ts`, `syncAppearance`).

So the popup stays mounted and is only never displayed. Taking it out of
the document would need the media keys and the now-playing session rebuilt
first.

## What goes with Zotero's own player

- **Its sample.** This build has no sample button: picking a voice in the
  popup while paused plays one (`handleUserVoiceSelect`, 38585-38593)
  through Read Aloud's sample controller, which the Engine leaves alone
  (ADR 0005) and which plays at Zotero's level. With the popup never shown,
  nobody picks there. The first-run voice dialog, which plays samples too,
  opens only from the headphone button's `toggleReadAloudPopup(true)` while
  `reader.readAloudVoices` is empty (84200-84203 → 83390-83399 →
  `xpcom/reader.js` 640-643). The Player's button starts a reading through
  `smartPlay`, and `startReadAloudAtPosition` (84239-84266) — Zotero's
  shortcut, Shift+Space, *Read Aloud from Here* — never raises the dialog.
  The Manage Voices dialog is unreachable in this build: the bundle never
  calls `onOpenReadAloudVoicesPopup` (`xpcom/reader.js` 644-647).
- **Its annotate button.** The H and U keys stay: the reader handles them
  while Read Aloud is active (82110-82116), with the focus in the document.
  Since issue #145 the plugin has bindable keys for the same call,
  Shift+H and Shift+U by default (`highlightSentence` /
  `underlineSentence`): `getSegmentToAnnotate()` then
  `addAnnotationFromReadAloudSegment(segment, type)` (84337), taken while
  a session is open.
- **Its credits display.** The balance row (38918-38961), each voice's time
  left (38448-38481), the urgent state under 3 minutes (82160,
  82254-82256), the purchase link (`Zotero.launchURL` of
  `https://www.zotero.org/settings/readaloud`, `xpcom/reader.js` 633-635),
  the sign-in row (38863-38874) and the daily-limit message (38962-38978).
  Nothing else in Zotero shows them: Settings → General → Read Aloud holds
  only *Highlight current* (`preferences/preferences_general.xhtml`
  225-240). #140 holds it; meanwhile `ztts-zotero-note` and
  `ztts-help-zotero` say credits are bought on zotero.org instead of in the
  player.
- **The plugin's code that served only the visible popup**:
  `player-expanded.ts` (#81), `favorite-marks.ts` (#45),
  `multilingual-first.ts`, the dropdown half of `provider-tiers.ts` (its
  rewrite of the first dropdown and the signed-out log-in row, #130), and
  the native branches of `player-options.ts` (Shift+O) and
  `notice-position.ts`, with their tests, startup steps and diagnostics.

## When the Player cannot appear

No fallback to Zotero's own player. The hiding rule is the first thing
`attach` puts in a reader, so a fault later in `attach` leaves Zotero's
player hidden. A reader whose Player failed — `attach` threw, or its frame
did not finish loading within 100 × 50 ms — is marked, and a reading opened
there by any entry point is closed at once with a message: the player could
not load, and turning Zotero-TTS off under Tools → Plugins brings Zotero's
own Read Aloud back.

Before this, a frame that never loaded left an empty transparent frame, and
the toolbar button started a reading with no controls, reported only by
the log line "player did not finish loading"; an `attach` that threw before
it painted left that reader on Zotero's player.

Not covered: the `plugin player` startup step failing outright, or the
`Read Aloud shortcuts` step, which registers the `renderToolbar` listener
that attaches every later reader (`index.ts`, `startReadAloudShortcuts`).
Either leaves the readers the plugin never reached on Zotero's own player;
the startup report names the step.

## An update while reading

`shutdown(reason)` hands the tabs back to Zotero only on `ADDON_DISABLE` and
`ADDON_UNINSTALL`, as `stopEngine` already does. On an upgrade or a
downgrade the Player leaves its hiding rule in each reader, so Zotero's
player no longer shows while the successor starts, a gap that can include
the shutdown's bounded flushes of 8 s each. The successor's `attach`
replaces the stale rule.

The successor's Player starts closed even when a paused session is open
(the owner's choice, 2026-09-24): the Engine keeps that session paused at
its segment (ADR 0005), and the toolbar button resumes it. If the successor
never starts, the tabs open at the upgrade keep Zotero's player and button
hidden until they are reopened.

## Considered options

- **Keep the switch.** Two players to keep right, when the one thing
  Zotero's did differently was the sample at Zotero's level.
- **Fall back to Zotero's own player when the Player cannot appear.**
  Reading stays possible, but the popup-only code has to stay alive and
  untried until the day it is needed, and a broken Player goes unnoticed.
- **Reopen the Player by itself after an update**, by opening it in
  `attach` when the snapshot says Zotero's player is open. The owner turned
  it down as not worth it; the place is kept either way.
- **Take the popup out of the document.** The media keys and the
  now-playing session would have to be reimplemented first.

## Consequences

- The old pref stays in profiles, unread, as `speed` (`a694b97`),
  `readAloud.hideZoteroLocalVoices` (#17, `e5ac5b9`) and
  `readAloud.autoScrollEnabled` (#117, `5bc206e`) did. Restoring an older
  backup lists it among the skipped keys (`settings-backup.ts` 115-117); a
  settings sync leaves it in the shared file (`settings-sync.ts` 334-335),
  and an older version on another computer keeps its own value.
- *Open the player expanded* and Shift+O act only in the Floating panel; in
  the Top and Bottom bars they do nothing, as before.
- The live kit: `signed-out-voices` items 4-5, which turned the switch off
  to read Zotero's popup, go, and so do `plugin-player`'s checkbox item,
  `player-position-key`'s disabled-player guard and the whole
  `player-expanded` case; `favorites`, `reader-voice-list`, `player-keys`
  and `word-highlight-key` lose their popup parts.
