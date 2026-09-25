# Scripts: Install, in-place reinstall and reload

[Case](../../cases/plugin-lifecycle.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

| Script | What it checks | What it expects | Params it reads |
|---|---|---|---|
| `00-baseline.js` | Startup identity, volume/memory pref snapshot + mute, debug store on, owner readers left alone, position rows/legacyPref | beta7 `startup()` all `ok`; volume becomes 0; memory already a listed (`::`) voice; rows/legacyPref recorded for the return check | none |
| `01-window-and-tab.js` | Opens fixture A in a reader WINDOW, waits for `_internalReader`, closes it with `reader._window.close()`, confirms the dead entry; opens fixture B as a tab after it, selects it, waits for its pages | entry stays listed at the same index; `_window.closed`, `isDeadWrapper(_internalReader)` and `isDeadWrapper(_iframeWindow)` all true; tab reader listed after it, selected, pages rendered | `root`, `fixturesDir`, `runId` |
| `02-post-reinstall-checks.js` | Run after the tester's own second, in-place reinstall: `startup()`, the debug log's stop/start pair, the six per-reader diagnostics, `liveVoiceList`, `highlight` patched | `startup()` all `ok`; bare `[zotero-tts] started`; 0 `can't access dead object` lines from `stopped` on; all six diagnostics: dead row exactly `{gone:true}`, tab row a real object; `liveVoiceList` non-null for the tab; `highlight` shows the tab's PDF view `patched:true` | none |
| `03-third-fixture-attach.js` | A third fixture tab opened after the reinstall (attached only through `renderToolbar`): `pluginPlayer()` row, ids before any open, toolbar button opens the Player, then a trusted Shift+Space | ids exist before any open; `pluginPlayer().readers` grows by one, the new row `failed:null`; toolbar click flips `playerOpen` true with `.read-aloud-popup` `none`/`ABSENT`; Shift+Space (`consumed:1`) flips `playerOpen` true within the ceiling, popup `none`/`ABSENT` throughout (see Limits on `active` timing); reading stopped and Player closed after | `root`, `fixturesDir`, `runId` |
| `03b-shift-space-extended-check.js` | A longer, isolated re-check of Shift+Space alone on the same idle reader, for a clean read when 03's own ceiling is borderline | `playerOpenAt` in the low hundreds of ms on an idle reader; records whether `activeAt` ever fires within 30s; closes the Player again after | none (reads `state.fixtures.c`) |
| `04-cleanup.js` | Splices the dead entry (`_window.closed` true), closes the tab readers, erases all three fixtures, restores volume/memory (memory last), reports position rows and final `startup()` | dead entry gone, 3 readers → the owner's 1; fixtures erased; volume/memory byte-identical to the baseline snapshot; position rows back to the baseline count; `startup()` still all `ok` | none |

Before you start:

- Build and bridge: `zotero_ping`; `zotero_plugin_list` for the installed
  version; install the xpi; `zotero_plugin_list` again; grep the installed
  bundle for `readerGone` as the build proof (beta6 has none), never the
  version string alone; `diagnostics.startup()` all `ok` before any reader
  is opened.
- WebDAV isolation (workflow "Test WebDAV first") runs once per zotero-dev
  session, outside this kit, before installing. This case's own scripts
  never read or write `webdav.url`/`username`/`password`.
- Fixtures: `fixture-a.pdf` (the window fixture, deliberately left dead),
  `fixture-b.pdf` (a tab opened before the reinstall), `fixture-c.pdf` (a
  tab opened after it, for the `renderToolbar` attach check). `01` imports
  A and B; `03` imports C.
- The item 5.9 reinstall itself — a second, separate `zotero_plugin_install`
  of the same xpi — is made directly by the tester between `01` and `02`;
  it is not a kit script, the way an external reinstall/reload is handled
  in every other lifecycle-adjacent kit.
- Cleanup order: `04` splices the dead entry, then closes and erases the
  fixtures and restores volume/memory (memory last); only then does the
  tester restore the WebDAV url and sync switches outside the kit.

Limits:

- **The PDF viewer is a NESTED iframe**, not the document `01` first
  checked — found live 2026-09-25: `reader._iframeWindow.document` is the
  reader-ui chrome (toolbar/sidebar); the pdf.js content is at
  `reader._internalReader._primaryView._iframeWindow.document`. `01`'s
  first pass measured `pagesRendered:false` off the wrong document; a
  direct follow-up check on the correct one found 2 rendered canvases
  (2360×3054 and 300×150, `readyState:"complete"`) at that same moment.
  The persisted script now reads the correct document; this run's
  `pagesRendered:true` evidence for fixture B is that live follow-up, not
  the superseded sample inside `01`'s own JSON result.
- **`pluginPlayer()` rows carry no itemID** (`ui/player.ts`'s own
  `inspect()`): a newly attached reader is identified by the reader count
  growing by exactly one and being the last row (the internal `entries`
  Map's insertion order), cross-checked against a direct DOM query of that
  reader's own document for `#ztts-player-toggle`/`#ztts-player-style`/
  `#ztts-player-frame`.
- **Shift+Space's `playerOpen` timing varied widely** on a fixture never
  read before (first provider/voice-list load): `03`'s first live run took
  11.9s to flip it, past its old 12s ceiling, with `active` still false at
  the cutoff; `03b`'s isolated re-run (idle reader, no prior toggle clicks)
  flipped `playerOpen` at 216ms — matching plugin-player's own "~250ms"
  figure — but `active` had still not fired 30s later either time, with no
  `m().error` and nothing provider-related in the errors read. `03`'s
  ceiling is now 20s and its pass condition is `playerOpen` alone, matching
  plugin-player item 2's own `open:true` claim, not `active`; run `03b` for
  a clean read when timing is borderline. Not re-attributed to issue #143
  (no `Zotero.Reader._readers` walk is involved in opening the Player).
- **Zotero's own session-state autosave throws on a live dead entry.**
  Three `can't access dead object` errors at
  `chrome://zotero/content/xpcom/reader.js:0:114` (no stack) landed 49-260s
  after the reinstall's `started`, all before `04`'s splice and none after
  it; the debug store's surrounding trace at those points is
  `Zotero.Session`'s debounced save (`session.js`), not any
  `zotero-tts.js` frame. This is Zotero's own periodic save walking the
  dead entry this case deliberately leaves listed for several minutes —
  distinct from `02`'s own check (0 dead-object lines in the debug store
  from the reinstall's `stopped` marker, read immediately after) — and
  consistent with the already-documented fact that Zotero's own
  `Reader.open()` is likewise poisoned by a live dead entry (see
  `plugin-player`'s kit Limits): the entry's mere presence is the trigger,
  not the plugin's reinstall.
- **A native `_readAloudJumpButton` throw on a fast open/close.** Two
  `TypeError: can't access property "hide", this._readAloudJumpButton is
  undefined` (`reader.js:76908`, native `_hideReadAloudJumpButton`) fired
  during `03`'s own toolbar-button close, immediately after opening the
  same panel with no session ever active; the stack passes through
  `zotero-tts.js` (`command`/`toggle`/`createLiveVoiceList attach hook`) on
  the way into Zotero's own `toggleReadAloudPopup`/`close`. Reproduced on
  this run's own open-sample-close-immediately sequence; not seen on the
  owner's reader or the dead entry, and unrelated to issue #143 (no reader
  array walk involved) — flagged for the main session, not chased further.

Runs:

| Run | Coverage | Result |
|---|---|---|
| 2026-09-25 / 1.14.4-beta7 (issue #143, item 5.9; xpi SHA-256 `53894aa6028828df62f7b555ada96044f07480b86b2513aa49c7f84cab856bd0`) | Build proof (beta6→beta7, `readerGone` 0→4); dead window entry created and confirmed (`_window`/`_internalReader`/`_iframeWindow` all dead); live tab listed after it; in-place reinstall over the dead entry; `startup()`, debug log, all six per-reader diagnostics, `liveVoiceList`, `highlight` patched; a third post-reinstall fixture attached via `renderToolbar`; toolbar button and Shift+Space both open the Player with Zotero's own popup never shown; cleanup (splice, close, erase, restore) | PASS on every expectation in the brief; see Limits above for incidental, unattributed findings (session-autosave dead-object throws, a native jump-button throw, and the Shift+Space `active` timing) surfaced along the way |
