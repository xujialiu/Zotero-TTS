# Issue #96 live verification — 1.12.5-beta4

Date: 2026-09-13. Environment: Zotero `10.0.2-beta.9+c77df79af`, Firefox 140,
Windows, MCP bridge on `127.0.0.1:6100`. Installed plugin: `Zotero-TTS
1.12.5-beta4`. XPI SHA-256:
`fe7e8600ae8e405b4498939dacff11f1f20950bc97d805f033a8afbb84da0995`.

The package was installed in place after `zotero_ping` and
`zotero_plugin_list`. `Zotero.ZoteroTTS.diagnostics.startup()` returned the
same beta version with every startup step `ok` and `failed: []`.

## Baseline and methods

The baseline had one user reader, item `19598`, active and paused with its
existing local voice. The settings window was closed, debug storage was on,
the position store had 66 rows with no queued write or error, and the named
temporary preferences had their original values and user-value flags. The
saved baseline script reports only those named values; it does not print or
save Read Aloud memory.

The tests used four methods:

- **Exact provider request/direct interface:** a temporary fixture reader's
  plugin remote interface wrapped the sandbox `fetch` call and recorded only
  endpoint, prepared input, and mapped timestamp slices. The local Kokoro
  voice supplied real word timings.
- **Synthetic segment/direct interface:** a temporary in-memory segment list
  supplied the following text for prefetch. The list and controller indices
  were restored immediately afterward.
- **Native stub/direct interface:** a restored native prototype stub supplied
  the exact six-word request, metadata and timestamps. No paid native voice was
  used.
- **Real playback:** the initial audio probe found `AudioContext.state` equal
  to `suspended` and `currentTime` fixed at `0`; continuous progression,
  listening quality and moving highlight remain NOT TESTABLE on this machine.

## Results

| Behavior | Observed | Expected | Status |
| --- | --- | --- | --- |
| Startup/build identity | Installed version `1.12.5-beta4`; startup `failed: []` | The tested XPI is the intended bundle and startup completes | PASS |
| Fixture source positions | Seven fixture segments retained identical text, position and sourcePosition values | Speech preparation must not mutate the original document segment | PASS |
| Exact multi-group provider request | `<Log in> <Register> <Play as guest>` was sent as `Log in Register Play as guest`; six returned slices were `Log`, `in`, `Register`, `Play`, `as`, `guest` at original UTF-16 ranges `[1,4]`, `[5,7]`, `[10,18]`, `[21,25]`, `[26,28]`, `[29,34]` | Remove all three outer pairs and map all six words to the original document | PASS |
| Cache repeat | The repeated exact request made no additional fetch; audio size and all timestamps matched | No second synthesis and no cumulative offset shift | PASS |
| Prefetch | Synthetic anchor sent `Prefetch anchor with two groups`; prefetch sent `Prefetch next sentence.`; the following direct request made no new fetch | Prefetch uses the same prepared text and its entry is reusable | PASS |
| Punctuation | `“<A>”, <B>!` was sent as `“A”, B!`; mapped slices were `A` and `B` | Preserve outside punctuation | PASS |
| Nested groups | `<<A>> <B>` became `<A> B`; `<<A> <B>>` became `<A> <B>` | Remove one outer layer per group | PASS |
| Unmatched/comparison cases | `<A> <B`, `<A>> <B>`, `<A> and <B>`, and `a < b > c` were sent unchanged | Avoid guessing ambiguous or ordinary comparison text | PASS |
| Single empty pair | `<>` returned a 6,444-byte silent WAV and made no provider request | Silence without synthesis | PASS |
| Multiple empty groups | `<> <   >` returned a 6,444-byte silent WAV with one whole-segment timestamp `[0, 8]` and `calls: []` | Multiple empty groups take the same silent/no-fetch path | PASS |
| Native exact multi-group request | Stub received prepared text `Log in Register Play as guest` and preserved `lang`, `paragraphStart`, `position` and `sourcePosition`; mapped all six words to the ranges above; `patchRestored: true`, `fixtureClosed: true`, `errors: []` | Native transport receives a copied cleaned segment and maps timestamps back | PASS |
| Opt-out session | While active, `configured:false/effective:true`; after stop/reopen, the full original string was sent; after restoring the setting and reopening, `effective:true` and cached cleaned offsets remained correct | Setting changes apply at the next session, with cache alignment preserved | PASS |
| English UI | Checkbox was checked, bound to `readAloud.stripAngleBrackets`, and its help text described punctuation, multiple groups, outside text and stop/reopen behavior | Setting is visible and accurately described | PASS |
| Chinese live locale | Locale was not switched during this focused pass | Live Chinese rendering | NOT TESTABLE |
| Continuous playback/highlight motion | AudioContext remained suspended at time 0 | Automatic playback progression and listening/motion judgment | NOT TESTABLE (machine audio) |

The EPUB fixture does not contain the exact multi-group source, so the #96
request and native checks used the temporary reader's direct remote interface.
The fixture's real seven segments were still used for source-coordinate and
reader lifecycle checks. This distinction keeps direct mechanism evidence
separate from live document segmentation and playback evidence.

## Native-stub incident

The first native attempt in the first pass closed only the Read Aloud popup.
`Zotero.Reader.open` reused that still-open fixture reader, so the old
`voice-switch-fixture` stub was observed (`nativeCalls: []`, standard one
voice, premium zero). That result was discarded. The fixture reader was then
fully closed and polled out of `Zotero.Reader._readers` before patching the
existing user-reader prototype. The corrected run is
`test/zotero-dev/runs/2026-09-13-1.12.5-beta4/scripts/03-native-multi-group-stub.js` and produced
the PASS row above.

## Restoration and errors

The temporary fixture item `25445` was closed and erased. The final baseline
contained only user reader `19598`, still active and paused with its original
local voice. The settings window was closed; volume, strip setting, sync
switches, cache/prefetch switches and their user-value flags matched the
baseline; debug storage remained on. Position storage returned to 66 rows,
with zero queued writes and no last error.

The final error console contained three Zotero locale-resource messages, one
debugger-eval `can't access dead object`, and one `InvalidStateError:
Navigated away from page` from temporary reader teardown. No error had a
`[zotero-tts]` or `zotero-tts.js` plugin stack, and no plugin dead-object burst
was observed. The debug store contained the expected angle-bracket removal,
cache, prefetch and empty-interior lines.

## Retained scripts and checklist draft

The scripts actually used are indexed in
`test/zotero-dev/runs/2026-09-13-1.12.5-beta4/scripts/README.md`. The older case 3g
setup, source-position and cleanup probes remain linked under
`test/zotero-dev/runs/2026-09-13-1.12.4-beta2/scripts/`; the first-pass scripts in this new
directory retain the adapted item-25444 source and outputs used for the
provider, cache, prefetch and session checks.

Suggested case 3g item 8 update:

> Live 1.12.5-beta4 mechanism checks now cover the exact three-group request,
> all six original UTF-16 word ranges, cache repeat, prefetch reuse, native
> transport metadata, nested/punctuation/unmatched/comparison cases, multiple
> empty groups and the opt-out session snapshot. The exact source is not
> emitted by the EPUB fixture segmenter, so the #96 request is checked through
> the fixture reader's direct interface; the fixture's real segments still
> verify source positions. Continuous playback, moving highlight and live
> Chinese locale switching remain uncovered.

Suggested limitations update:

> Multiple angle-bracket groups (#96) have live direct-interface evidence for
> provider/native requests, original offsets, cache, prefetch, empty groups
> and session opt-out. The fixture does not emit the exact sibling-group
> sentence, so document segmentation for that sentence is not claimed. Audio
> progression, listening quality, moving highlight and live Chinese locale
> rendering remain untested.
