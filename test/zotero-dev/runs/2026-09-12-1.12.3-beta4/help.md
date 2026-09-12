# Issue #93 beta4 auto-scroll help check

Environment: Zotero 10.0.2-beta.9+c77df79af, Windows / Firefox 140. The
requested XPI was installed in place. Local identity checks reported XPI
SHA256 `ae0f20e9d5d78a8d3aab09df7636c7b56e8d487483f712bf894d457a8ff88633`,
manifest version `1.12.3-beta4`, and bundle SHA256
`b5ad47f4d50bfd2ddc63d134a9acde07694bcb3bea2185fe44b0f0f6d5c8dedf`.

The continuation used the current user state as the baseline. It did not
require an idle reader or the default mode.

| Check | Observed | Expected | Status |
| --- | --- | --- | --- |
| Bridge and installed identity | Bridge connected to Zotero 10.0.2-beta.9+c77df79af; plugin list showed Zotero-TTS `1.12.3-beta4`; local XPI and bundle hashes matched | The requested beta4 build is installed | PASS |
| Startup | `Zotero.ZoteroTTS.diagnostics.startup()` returned version `1.12.3-beta4`, 21 steps with `ok: true`, and `failed: []` | Startup completes without failed steps | PASS |
| Current baseline | Settings window open; `readAloud.autoScrollMode` was `sentence` with `user: true`. One existing reader for `Clinically applicable deep learning for diagnosis and referral in retinal disease` remained untouched; manager `active: true`, `paused: true`, `popupOpen: false`, position `517`, position lock `false` | Snapshot current mode/user flag and preserve existing reader state | PASS; this is user state, not a plugin failure |
| Nested radio/help rows | Radiogroup value `sentence`, `childCount: 2`. Each `hbox` contained exactly one radio and one adjacent `.ztts-help`; rows were `sentence` / `Center each sentence` and `outside` / `Scroll when outside the view`. Help IDs and attributes were distinct and meaningful: `ztts-help-auto-scroll-sentence` and `ztts-help-auto-scroll-outside` | Each option has one adjacent `?` and its own meaningful help attribute | PASS |
| Sentence tooltip | Trusted hover opened `ztts-help-tip` with state `showing -> open`; label explained centering the whole sentence even when visible and avoiding repeated word-level recentering. Default anonymous tooltip stayed `closed` | The sentence option opens its own explanation | PASS |
| Outside tooltip | Trusted hover opened `ztts-help-tip` with state `showing -> open`; label explained leaving fully visible sentences in place and centering only when clipped. Default anonymous tooltip stayed `closed` | The outside option opens a different explanation | PASS |
| Nested radio clicks and persistence | Before: `sentence`, user value `true`. Clicking outside produced preference/group `outside` and user value `false`; clicking sentence produced preference/group `sentence` and user value `true`. `finally` restored the exact original state: `sentence`, user value `true` | Nested controls toggle both modes and save consistently; original state is restored | PASS |
| Reader/controller/player preservation | Before and after radio checks: same reader item, `active: true`, `paused: true`, `popupOpen: false`, position `517`, position lock `false`, clock state `running`. The audio clock advanced from `835.2453` to `836.8613` while the paused reader remained untouched | Settings check does not operate playback or alter reader state | PASS; clock drift is elapsed context time |
| Keyboard navigation | Trusted `ArrowDown`, then optional Space/Arrow probe, returned `keydown: 2` and did not change the group. No reader state changed | Optional keyboard traversal if the focused settings widget accepts it | NOT TESTABLE; trusted key route did not produce a selection change, while required click coverage passed |

Cleanup completed in the same radio script: `readAloud.autoScrollMode` is
back to `sentence` with its original user-value flag `true`; the settings
window remains open; the existing reader remains active/paused with its popup
closed and position unchanged; beta4 remains installed. No playback, reader
navigation, provider, voice, locale, OS audio, or WebDAV operation was run.

Reusable scripts are in
`../../scripts/auto-scroll-help/`: `startup.js`, `baseline.js`,
`reader-snapshot.js`, `inspect-rows.js`, `hover-sentence.js`,
`hover-outside.js`, `radio-binding.js`, and `keyboard-probe.js`.

The final error read contained only existing Zotero background/install noise:
missing `en-AU`, `en-NZ`, and `en-CA` Fluent resources, `uncaught exception:
undefined`, the known `InstallTrigger is deprecated` warning, prior reader
teardown `InvalidStateError` entries, one known Xray warning, and an older
harness `c is null` entry. No new `[zotero-tts]` error was observed.
