# Issue #101 live verification — 1.12.6-beta3

Date: 2026-09-13. Environment: Zotero `10.0.2-beta.9+c77df79af`, Firefox
140, macOS (`macosx`/Darwin), MCP bridge on `127.0.0.1:6100`, live locale
`en-US` (not switched). Installed plugin: Zotero-TTS `1.12.6-beta3`.

XPI SHA-256:
`b71fe5a4b4b2c07e00f02211e3b2de7432505987c95961cea0278e8b972eef58`.
Bundle SHA-256:
`4fbb821a4a39f6a5df20ac9df385715c21f565ad541286c2b118cae1543c57f5`.

The run installed the requested XPI after `zotero_ping` and
`zotero_plugin_list`. `diagnostics.startup()` immediately after installation
returned `1.12.6-beta3`, every step `ok`, and `failed: []`. The focused run
covered baseline section 0 and case 3g item 9; it did not run the full
checklist.

## Results

| Behavior | Observed values | Expected | Status |
| --- | --- | --- | --- |
| Build and startup | Plugin list `1.12.6-beta3`; startup 23/23 steps `ok`; `failed: []` | Requested bundle is installed and startup completes | PASS |
| Baseline/fixture | User reader `24246` remained active/paused on its Fish local voice; EPUB fixture imported as item `24434` | User tabs are left alone; fixture is disposable | PASS |
| Default UI | Checkbox `ztts-strip-angle-brackets`, `checked:true`, `preference:null`; input `ztts-bracket-pairs`, value `<> []`, disabled; visible label and help were present | Default on, checkbox unbound, input locked | PASS |
| Disable/edit/re-enable | Off made input editable; valid `【】 ()` draft persisted; re-enable checked and locked it | Disabled state permits editing and valid input enables/locks | PASS |
| Empty validation | Dialog message named an empty list; buttons `Use defaults` / `Cancel`; Cancel left empty draft and switch off | Localized empty-list error and cancel preservation | PASS |
| Entry validation | `<`, `aa`, and `**` each showed the invalid-pair message; both buttons present; Cancel preserved draft/off | Two different punctuation/symbol characters are required | PASS |
| Duplicate validation | `<> <>` showed duplicate-pair message; Cancel preserved draft/off; Use defaults wrote `<> []`, enabled, and locked | Duplicate entries are refused; both actions work | PASS |
| External preference refresh | External writes changed both controls immediately: custom pairs while locked, off/unlocked, default pairs, on/locked | Preference observers refresh checkbox and input | PASS |
| Active session settings | `textSettings()` reported `patched:true`, `configured:false/effective:true` after disabling while active; `configuredPairs`/`effectivePairs` stayed `<> []` | Active session keeps its activation snapshot | PASS |
| Stop/reopen setting | After stop/reopen, fixture entry reported `configured:false/effective:false`; reactivation with defaults reported both true | Effective setting updates only at the next session | PASS |
| Default real transport | `<Hello> [World]` request body was `Hello World`; Fish returned real two-word timings at source `[1,6]` and `[9,14]`; segment stayed unchanged | Default angle/square pairs are removed and offsets map to original text | PASS |
| Custom real transport | With `【】 ()`, `【Hello】 (World)` request body was `Hello World`; timings mapped to `[1,6]` and `[9,14]`; source stayed unchanged | Configured Unicode/custom pairs are removed with original offsets | PASS |
| Cache repeat | Custom request made one network call across two `getAudio` calls; audio sizes `7104/7104`; timestamps identical | Cache stores prepared text and does not shift ranges again | PASS |
| Custom prefetch | Anchor prepared as `Prefetch anchor with two groups`; next prepared as `Prefetch next sentence.`; next call reused the prefetched entry | Prefetch uses the configured list and cache coordinates | PASS |
| Mixed nesting | `<[Hello]> [<World>]` was sent as `[Hello] <World>`; source unchanged | One outer layer per configured pair is removed | PASS |
| Malformed nesting | `<[Hello>]` was sent unchanged as `<[Hello>]`; source unchanged | Mismatched input is preserved | PASS |
| Empty default pairs | `<> []` returned a `6444`-byte silent WAV, one whole-segment timestamp `[0,5]`, and zero provider calls | Empty pairs skip synthesis | PASS |
| Native Standard/Premium | Restored stub received `Hello World` / `“World!”` with original metadata; ranges mapped to `[1,6]`, `[9,14]` and `[2,7]`; sample and `noStore` error passed through; patch restored | Native routes use copied prepared segments without paid synthesis | PASS |
| Audio progression | Fresh probe and a second sample 500 ms later both had `AudioContext:suspended`, `currentTime:0`, position `0` | Continuous playback and audio-driven progression | NOT TESTABLE (machine audio) |
| Listening/highlight motion | No audible interval was used; volume stayed `0` during playback-capable actions | Sound quality and moving highlight timing | NOT TESTABLE (human/device) |
| Chinese live locale | Live locale remained `en-US` | Chinese rendering | NOT TESTABLE (explicitly not switched) |
| Final errors | No current-run `[zotero-tts]` error or `zotero-tts.js` stack; only expected Zotero locale misses/install `uncaught exception: undefined`; older Fish errors predated this run | No plugin regression errors | PASS |
| Cleanup | Fixture erased; no fixture reader; one original reader remained with same active/paused/voice state; position rows `66`, queued `0`, last error `null`; all named prefs and user flags matched; debug store and settings window returned to baseline | Restore all state and temporary probes | PASS |

The Fish service returned one word timing for the mixed nested request while
the prepared text was correct; the default and custom simple requests returned
complete real word timings. This is recorded as a provider timing limitation,
not a bracket preparation failure. No rebuild was required.

The exact example strings were supplied directly to the live fixture reader's
remote interface. These checks prove the actual request/response path and
source preservation, but not that Zotero segments the fixture into these
examples or plays through them continuously.

## Artifacts

The exact bridge scripts, prerequisites, expected values and cleanup procedure
are indexed in
[`scripts/bracket-pairs/README.md`](../../scripts/bracket-pairs/README.md).
Sanitized outputs are in [`outputs/`](outputs/), with build/environment data in
[`metadata.json`](metadata.json), cleanup evidence in
[`outputs/25-cleanup.json`](outputs/25-cleanup.json), and the final error read
in [`outputs/99-errors-summary.txt`](outputs/99-errors-summary.txt).

## Draft checklist additions

Add to case 3g item 9:

> Live `1.12.6-beta3` evidence covers the unbound checkbox and locked input,
> valid `【】 ()` editing, empty/entry/duplicate localized dialogs, Cancel draft
> preservation, Use defaults (`<> []` plus enabled/locked), external preference
> refresh, active/effective diagnostics, default and custom real provider
> requests, original offsets, cache repeat, custom prefetch, mixed/malformed
> input and empty-pair silence. Standard/Premium metadata, ranges, sample and
> `noStore` behavior pass through a restored stub without paid synthesis.

Add to limitations:

> Issue #101 configurable pairs have live mechanism evidence on macOS with
> Fish real timestamps and restored native stubs. Audio progression, listening
> quality, moving highlight timing and live Chinese locale rendering remain
> untested. Fish returned only one word timing for the mixed nested sample,
> although the prepared request and source preservation were correct.

## Restoration

The run muted Read Aloud at volume `0`, disabled automatic settings/position
uploads, and restored the original volume `100` (user flag false), sync flags,
cache/prefetch flags, strip setting, new bracket-pairs preference and all
user-value flags. `readAloud.memory` was restored last by the private baseline
snapshot and matched without being written to an artifact. The native
prototype and sandbox fetch wrappers restored themselves in `finally` blocks.
The preferences window was closed to its baseline state. No credentials or
raw preference snapshot was retained.
