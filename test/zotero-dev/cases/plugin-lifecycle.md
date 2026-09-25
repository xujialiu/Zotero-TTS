[Checklist index](../README.md) · [Scripts](../scripts/plugin-lifecycle/README.md)

## Install, in-place reinstall and reload

What an install, an in-place reinstall with a tab open and a plugin
reload leave behind. Item 5.7's reload is the last thing a pass drives.

Items 1.1, 5.6 and 5.7 of the checklist, under their original numbers,
and 5.9, added after the split.

### 1.1

1. **Install and startup.** As in the baseline; after an in-place
   install no `can't access dead object` in the debug store (issue #5),
   the log `[zotero-tts] stopped` before `[zotero-tts] started`.

### 5.6

6. **In-place reinstall with a tab open** (the path an update takes):
   the log `stopped` (observers unregistered, `Closing database`,
   `Database closed`) before `started`; `startup()` all ok; no
   dead-object error; the store `open`, `imported 0 / swept 0`, the
   fixture's row intact; the pane re-registered once, no `Pane with ID`
   error. **Since 1.10.3 the open tab is handed the new instance's
   interface** (issue #38, `src/read-aloud/interface-redelivery.ts`):
   its popup reopened lists the plugin's voices from the new instance
   and the System voices still work — proved by the log line
   `redelivered the Read Aloud interface to N open reader(s); rebuilt M
   voice list(s)` and by `patches().interfaces` (`hijacked`,
   `slotsPresent`, `slotsCurrent` all true for every open reader;
   2026-09-06: 2267 voices = zotero 1480 + azure 691 + local 68 + openai
   28, and `diagnostics.systemProvider()` with no argument lists 9
   voices with `voicesError` null, no provider switch needed); before
   the fix `system: listing
   voices failed: System voices are not available on this platform.`
   was the sign of the old instance answering. The highlight
   re-attaches only if the tab's pages are rendered at that instant — a
   background tab's canvases are discarded by pdf.js and come back when
   shown; not a fault.

### 5.9

9. **An in-place reinstall with a half-closed reader window listed**
   (issue #143, 1.14.4-beta7). Open a PDF fixture in a reader window
   (`Zotero.Reader.open(itemID, null, { openInWindow: true })`), wait for
   its `_internalReader`, and close it with `reader._window.close()`, the
   script path that skips Zotero's `reader.close()`. The entry stays in
   `Zotero.Reader._readers`: `_window.closed` true and
   `Components.utils.isDeadWrapper(reader._internalReader)` true. Open a
   second fixture as a tab, so that a live reader is listed after it.
   Then reinstall the build in place:
   - `startup()` all `ok`, `failed: []`, the bare `[zotero-tts] started`;
     no `can't access dead object` among the errors from the install on.
   - `highlight()`, `autoScroll()`, `sentenceInView()`, `skippedLines()`,
     `textSettings()` and `playerVoiceList()` each answer with one row per
     listed reader: `{ "gone": true }` for the closed window's, and for
     the tab an object that is neither that nor an error's text (patched
     only if its pages are rendered, as 5.6 says).
   - A fixture tab opened after the reinstall is attached through the
     `renderToolbar` listener: `pluginPlayer()` lists it with `failed:
     null`; its document holds `#ztts-player-toggle` and
     `#ztts-player-style` before any open; the plugin's button opens the
     Player (`open: true`), and `.read-aloud-popup` reads computed
     `display: none`.

   Before the fix (1.14.4-beta6, 2026-09-24), `failed` named Read Aloud
   memory, highlight colors, sentence in view, live voice choices, voice
   switching and Read Aloud shortcuts, and the six diagnostics threw
   `can't access dead object`. Cleanup: only a restart or
   `Zotero.Reader._readers.splice(i, 1)` removes the entry (the one whose
   `_window.closed` is true), and Zotero's own `Reader.open()` fails for
   that item until then. Splice it, then close the tabs and erase the
   fixtures as in 3.26.

### 5.7

7. **One reload, last of all** (`zotero_plugin_reload`, issue #28): after
   it `Zotero.ZoteroTTS` an object, `Zotero.ZoteroTTSPendingShutdown`
   undefined, `startup()` all ok, `stopped` before `started`, the pane
   once, and the push probe (a setter on `_getReadAloudRemoteInterface`,
   a reader pushed and spliced) seeing **one** assignment. Nothing else
   is driven after a reload — restore everything before it. **A reload
   no longer costs the plugin's strings** (issue #64, 1.11.2): Zotero's
   `onDisabled` tail still unregisters the locales the concurrent
   `onEnabling` registered — the log shows `stopped (reason 4)` *after*
   `Calling bootstrap method 'startup' … ADDON_ENABLE` — but the plugin's
   own source carries the file. After the reload
   `diagnostics.l10n().sample` still reads `Voice browser`, `source` is
   true, and `registry` → `{locale: "en-US", shared: "missing", own:
   "present", bundles: 1}`: Zotero's copy gone (the shared source's
   other plugins keep theirs, `zoteroif_preferences.ftl` `present`), ours
   there; `shared: "present"` instead means the race did not happen in
   that reload — reload once more. The log has `own strings source
   registered` (not `replaced`) after `stopped (reason 4)`; the errors
   have no `Missing resource in locale en-US: zotero-tts.ftl` and no
   `translateFragment() failed` (`Missing resource in locale
   en-AU/en-NZ/en-CA: browser/menubar.ftl` is Zotero's own fallback
   chain, not this). Then the settings window, opened on the pane after
   the reload: `diagnostics.l10n().pane` → `{elements: 110, blank: [],
   questionless: []}`, the four provider switches' `label` reading
   `Enable` / `Disable` (they carry no `data-l10n-id`; ui/provider-rows.ts
   paints them through `t()`), and Zotero's own Advanced and Cite panes,
   navigated to in that same window afterwards, 0 blank `[data-l10n-id]`
   elements each — the window's one `document.l10n` lists the file, and
   a listed resource missing empties every pane loaded after ours
   (1.11.1 and earlier lost the strings on 2 of 2 reloads on Windows; the
   fix measured 2026-09-06 on macOS, 1.11.2-beta2). `shared` stays
   `missing` for the rest of the session — nothing can re-register into
   Zotero's source — until a restart or an in-place install, which ends
   the run as before and reads `{shared: "present", own: "present",
   bundles: 2}` again.
