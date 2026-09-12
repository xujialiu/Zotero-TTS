[Checklist index](../README.md)

## 5. Reading positions, colors, the lifecycle

1. **The store follows the reading.** `diagnostics.position()` while
   speaking → the fixture's `stored` a zero-area point at one decimal
   (`{"pageIndex":P,"rects":[[x,y,x,y]]}`, issue #14), moving with the
   sentence; `database.rows` up by one within ~10 s, `store.queued` 0,
   `lastError` null. The sampler reads Zotero's `savedPosition`, not the
   controller's `_position`, so a document that ran to its end keeps the
   last sentence read as its bookmark while Zotero has already rewound
   `_position` to the run's start (item 8).
2. **Close capture.** Popup closed, tab closed: `tabHooks`/`captureHooks`
   back to the baseline's (0 with no other tab open), the `trace`
   `tab.onClose fired` → `reader.uninit fired` →
   the notifier, the row kept with the sentence paused on. One close
   pokes the position transport once (issue #40, 1.10.4).
3. **Resume.** Reopen; `diagnostics.smartKey()` → `resume at the stored
   position`; Shift+Space → the `trace` line `resume item <id> target
   {…}`, speaking within ~3 s from the **start** of the sentence paused
   on, `_position` that segment.
4. **Zotero's own copies** (issue #39). Fixture-c playing, paused on
   page 1; `diagnostics.position()` → the fixture's `zoteroSaved` and
   `zoteroPersisted` both `{"kind":"pdf",…}` and `stored` the point (the
   two copies need not describe the same segment: the setting is written
   from the debounced view state and lags the in-memory copy by one).
   Move the view to page 8 — `view.navigate(Cu.cloneInto({ pageIndex: 7 },
   reader._iframeWindow))`; the bare object reads as empty over there —
   and, a second later (the 300 ms view-state debounce and the
   synced-setting write; measured null at 0.9 s), `position()` again →
   `zoteroPersisted` null, `zoteroSaved` unchanged (Zotero's in-memory
   copy stays until the tab closes), `stored` unchanged; cross-check
   `Zotero.Items.get(id).getAttachmentLastReadAloudPosition()` → null.
   (By the code, not measured: back within five pages the next view-state
   change rewrites the setting from the in-memory copy, `reader.js`
   84641-84647.) Close the tab, reopen: `smartKey()` still resumes at the
   stored position (item 3).
5. **Colors live.** The pane's color input (`preference=`-bound; set
   `value`, dispatch `input`) → the pref, `diagnostics.highlight().style`,
   the drawn word (at the next draw — a word onset while playing, or
   `view._render()` on a paused session; the *sentence under word* switch
   takes effect at the next state push, so a paused session keeps its
   sentence until it resumes — by mechanism, 2026-09-05), the pane's
   preview; *Restore default colors* puts the
   five defaults back (no user value left).
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
8. **The end of a document, and what a resume does** (2026-09-06, from
   a surprise in section 4; driven before item 7's reload). A fixture
   read to its last segment on a plugin voice: at `Complete` the manager
   stays `active` and goes `paused`, `_activeSegment` null (`reader.js`
   82687-82692), and the controller rewinds `_position` to
   `_backwardStopIndex ?? 0` — the **run's** start, not the document's
   (`reader.js` 39500) — while `_currentIndex` and `_indexAtPause` keep
   the last segment. `smartKey()` then reports `togglePaused (resume…)`,
   and Shift+Space replays from the rewind target: `_currentIndex` snaps
   to it within ~100 ms and the position walks forward one segment at a
   time (`reader.js` 84210-84228 → 82548-82557; no reposition anywhere),
   with no `[zotero-tts]` line — the plugin's stored-position restore
   runs only on an **idle** manager. The store still names the last
   sentence actually read (item 1), so a popup closed after a completed
   document and a Shift+Space later resume at the end, not at the run's
   start. Zotero's own behavior, not a fault.
