# Scripts: The player keys and the tab they reach

[Case](../../cases/player-keys.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

| Script | What it checks | What it expects | Params it reads |
|---|---|---|---|
| `01-held-speed.js` | Held Shift+C/X from reader and plugin-player focus in paused and playing sessions; saturation, rebinding, input focus, and nonrepeat reset/skip/options | 0.05 steps at each trusted repeat; bounds 0.5–3 do not call setSpeed; old bindings fall through after rebind; reset/skip/options act once; search input blocks speed changes | fixture state from player-controls setup |
| `02-held-speed-supplement.js` | Explicit paused C/X retention, live repeat-flag observation, and old Shift+P fallthrough during Shift+L remap | PDF manager is active/paused before and after C/X; listener sees `false,true,true`; old P has `keyDown:0` while L cycles top→A | fixture state from player-controls setup |

Before you start:

- Install and identify the exact candidate (XPI SHA-256 `0b8f64998783a4ae4634513c4829beeb16a8b0d277de9f4afdad4c204271130c`; bundle SHA-256 `1d95a8918b5619d2d14f1d8407d544f1ac1018877b771be9b4e0ad2f13f26f3d`), run baseline/startup, and reuse `player-controls/02-fixtures.js` for muted disposable PDF/EPUB readers.
- Keep Zotero foregrounded for trusted input; do not start the owner's document. Restore all shortcut bindings, speed/memory values, fixtures, sync guard and host state in cleanup.
- Held speed coverage uses the disposable PDF in both reader-view and plugin-player control focus, including a PDF playing row; the position cycle separately covered PDF and EPUB frames.

Limits:

- Earlier attempts corrected probe setup/timing, foreground focus, modifier synthesis, stale DOM references and diagnostic assumptions; the final revisions listed below ran successfully.

- `nsITextInputProcessor` supplies trusted initial and repeat keydowns in one transaction; the event cadence is represented by the repeat flags. Natural audio quality remains a human observation.

Final results: [issue #122 completion table](https://github.com/xujialiu/Zotero-TTS/issues/122#issuecomment-5717278769).

Runs:

| Date/build | Coverage and result | Run |
|---|---|---|
| 2026-09-17 / 1.12.12-beta7 | Focused §4.1 held-speed and nonrepeat checks PASS; AudioContext running during playing row; the profile’s custom Options binding was restored | `2026-09-17-1.12.12-beta7-player-keys-held13` |
| 2026-09-17 / 1.12.12-beta7 | Supplement PASS: paused C/X state retained, live listener observed repeat flags, and old P fell through while L was active; exact cleanup PASS | `2026-09-17-1.12.12-beta7-player-keys-supplement1`; `one-90-cleanup.js` |
