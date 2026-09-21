# Scripts: The plugin's strings in Zotero's language (issues #30, #43, #64, #103)

[Case](../../cases/localization.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

Covers items 1.10 and 1.11. Run through [the shared kit runner](../_shared/README.md).

## Scripts

| Script | Checks | Expects | Reads |
| --- | --- | --- | --- |
| `00-before-fix.js` | Issue #103's pre-fix reproduction: opens the pane on a build before 1.13.2-beta4, reads `diagnostics.l10n().pane`, closes the pane, turns the debug store on for `02` | `pane.blank` names `ztts-bracket-pairs` alone, `elements` unaffected; only meaningful while an old build is installed | — |
| `01-baseline.js` | Section 0's baseline, the parts this pane-only case touches: the errors ring, the owner's reader tabs (read-only), the host window's state | no `[zotero-tts]` entries; readers unchanged; host ends minimized (`windowState: 2`) | — |
| `02-item-1-10.js` | Item 1.10: `startup()`'s `strings`/`own strings source` steps, `diagnostics.l10n()`'s source/appLocales/sample/fallback/registry/formatted, the plugin's own Fluent source from chrome scope, the "own strings source" debug line | both steps `ok`; `registry: {locale:"en-US", shared:"present", own:"present", bundles:2}`; `formatted.voices` `"2267 voices available."`, `tier` `"Zotero Standard"`, `isolationMarks: false`; chrome-scope `hasFile('en-US', …)` `present`, `formatValueSync('ztts-heading-sync')` `"Sync"`; the debug line ends `registered: en-US, zh-CN for 46 Zotero locales` | — |
| `03-item-1-11-pane.js` | Item 1.11's diagnostic and its control: opens the pane fresh, `l10n().pane` before/after removing and restoring `#ztts-bracket-pairs`'s `aria-label` | `{elements:202, blank:[], questionless:[]}` before and after restore; `blank:["ztts-bracket-pairs"]` alone with `elements` unchanged while the attribute is off; the restored attribute equals the saved value | — |
| `04-item-1-11-dom.js` | Item 1.11's read-only DOM checks, the pane `03` left open: help icons, the favorites bold run, the highlight preview's four spans, every provider/tier switch, the lines TypeScript writes | every `.ztts-help` has `value:"?"` and a `help` string; the bold run `"favorite voices"`; the four preview texts; every switch `Enable`/`Disable`, none blank; the first column sorted `Name (N)`; the status/About lines well-formed | — |
| `90-teardown.js` | Cleanup: closes the pane, restores the debug store to what `00` read, confirms the host stays minimized, reads the errors ring again | pane closed; debug store back to its prior value; host `windowState: 2`; no new `[zotero-tts]` errors | `debugStoringBefore` |

## Before you start

- Build: `zotero_plugin_list` + `diagnostics.startup()` first (done directly,
  per the tester workflow, not a script here); confirm the profile's
  installed xpi against the built one — `shasum -a 256` the extensions
  folder's `zotero-tts@xujialiu.top.xpi` and grep its `content/zotero-tts.js`
  for a line the build actually added (this profile is shared with other
  worktrees).
- `00` only makes sense while a build before 1.13.2-beta4 is installed;
  skip it once the profile already carries the fix — item 1.11's diagnostic
  in `03` is the fix's own verification either way.
- `00` and `03` each open the settings window themselves, closing one
  already open first (a reinstalled pane keeps the old markup, driving
  notes Sec1). `03` leaves the pane open for `04` and the teardown; run
  them in that order.
- `04` waits for the voice browser's status line to leave "Listing
  voices…" before reading the first column — see Limits for what reading
  it too early looks like.
- State touched: the plugin install; the settings window opened and
  closed; `#ztts-bracket-pairs`'s `aria-label`, removed and restored
  verbatim inside `03`; the debug store, on for the run and restored by
  `90`; the host window minimized (it already was). No preference is
  written, no provider switch is clicked, no reader is opened.
- `90` must run last; it reads `params.debugStoringBefore` from `00`'s
  result, passed in at `start()` — `Zotero.Debug`'s own store, not
  `Zotero.ZoteroTTSRun.state`, is what has to survive the install between
  `00` (before) and the rest (after).

## Limits

- **The voice browser lists asynchronously**: `04`'s first run, moments
  after `03` opened the pane, read `firstColumn: []` with
  `voicesStatus: "Listing voices…"` — caught mid-listing. Revised to poll
  the status line first; the second run read three sorted entries
  (`Fish Audio (339)`, `Zotero Premium (1452)`, `Zotero Standard (28)` on
  this profile, the only three tiers enabled here) and a settled status
  line (`"Default voice: Fish Audio | English (United States) | Dax — Casual
  US male (EN) | 1.35×"`).
- **Three expected details of the case were stale** at this run, none
  of them issue #103's doing, and the case was corrected from it: the
  reading guard's last sentence ("Close the player in that tab, then try
  again."), the provider switches (12 `ztts-enable-*` — azure,
  cloudflare, fish, fishspeech, local, openai-official, compatible,
  speechify, system, mimo, zotero-standard, zotero-premium — since #111
  and #113, not four), and the preview's sentence id
  (`#ztts-highlight-preview`; the markup has no `-sentence`).
- `Zotero.getErrors(true)` is a ring holding Zotero's own noise on this
  profile (missing `browser/menubar.ftl` for `en-AU`/`en-CA`/`en-NZ`, two
  `uncaught exception: undefined` per in-place install) — read for the
  record in `01`/`90`, never asserted against.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-21 | 1.13.2-beta4, Zotero 10.0.3-beta.3+80bc5565e | [#103's closing comment](https://github.com/xujialiu/Zotero-TTS/issues/103) | `00`'s reproduction on 1.13.2-beta3 PASS; 1.10 PASS; 1.11 PASS (diagnostic, control and DOM checks) | First scripts of this kit. `04` revised once for the voice browser's async listing (see Limits) |
