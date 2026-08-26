# Shift+Space: the one Read Aloud key (2026-08-26)

Design record for merging the position shortcuts into a single smart key.
The `startFromSelection` action (its historical pref name, kept so custom
bindings survive) now covers play, pause, read-from-selection and resume;
the separate `resumeLastPosition` action (Shift+B) is gone.

## Dispatch

First matching row wins, decided at keydown in ui/read-aloud-shortcuts.ts:

| # | State                              | Behavior                              | Zotero path |
|---|------------------------------------|---------------------------------------|-------------|
| 1 | Session open (playing or paused)   | Play ⇄ pause; unpausing with a selection restarts from it (Zotero native, see below) | `toggleReadAloudPaused()` |
| 2 | Idle, selection present            | Start reading at the selection        | bare `startReadAloudAtPosition()` |
| 3 | Idle, no selection, stored position| Resume where the user stopped (the old Shift+B) | positionSync → `startReadAloudAtPosition(pos)` |
| 4 | Idle, no selection, nothing stored | Start like the play button: popup opens, auto-plays from Zotero's own saved position (if near the view) else the first visible segment | bare `startReadAloudAtPosition()` |

Rows 2 and 4 are the same call: bare `startReadAloudAtPosition()` picks up
the selection itself (`position ||= this.getSelectionPosition()`). The
selection check exists only to decide row 2 vs row 3 — an explicit resume
position must not override a selection.

## Why row 1 needs no selection handling

Verified in the installed 10.0.x bundle (`resource/reader/reader.js`):

- `_onReadAloudEngineStateChanged` (~83595): *"If the view has a selection
  target and we're unpausing, restart from the selection"* — it clears the
  segments and recomputes, and `_captureReadAloudStart` puts the selection
  first. So "paused + selection → play from selection" comes for free from
  calling `toggleReadAloudPaused()`; we never pass the selection ourselves.
- `toggleReadAloudPaused` (~83933) also `_lockPositionToReadAloud()` on
  unpause — the view follows the reading again, same as the play button.
- While a session is open the key is therefore an exact synonym of Zotero's
  own bare Space (~81798, taken only while `readAloudActive`); its added
  value is entirely in the idle rows.

## Costs accepted (user decision, 2026-08-26)

- The key is consumed whenever Read Aloud exists on the reader
  (`startReadAloudAtPosition` feature-detect, same policy the resume key
  had). pdf.js's Shift+Space page-up is gone in the reader; PageUp remains.
- Playing + selection pauses (does not jump): jumping to a selection while
  playing is now two presses — pause, then unpause restarts from the still
  live selection. Deliberate: pause must never be stolen by a stray selection.
- Resume-while-active is gone (was: jump to the stored position ≈ restart
  the current sentence — useless; Shift+Enter covers "view back to speech").
- The `NO_SAVED_POSITION` toast is gone: with nothing stored the key falls
  back to row 4 and always does something.

## Implementation map

- ui/read-aloud-shortcuts.ts: deps `canReadAloud` / `hasSelection` /
  `togglePaused` / `startReadAloud` / `resumeLastPosition`; dispatch in
  `smartPlay()`; the old per-action guards and `showMessage` are gone.
- index.ts wires them; `resumeLastPosition` still goes through positionSync
  (explicit position → `consumeTargetPosition` branch, so Zotero's
  near-view erasure of its own copy is bypassed).
- core/shortcut-actions.ts: `PositionAction` is `startFromSelection |
  returnToSpoken`; core/settings.ts and addon/prefs.js dropped the
  `shortcuts.resumeLastPosition` pref (a stale user pref is unread, harmless).
- Settings row label: "Play / pause / resume". Old backups restoring the
  removed pref are harmless for the same reason.
