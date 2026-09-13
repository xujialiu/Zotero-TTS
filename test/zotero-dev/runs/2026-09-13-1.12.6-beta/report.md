# Issue #97 live verification — 1.12.6-beta

| Check | Observed | Expected | Result |
| --- | --- | --- | --- |
| Build install and identity | Zotero-TTS `1.12.6-beta`; build and installed XPI SHA-256 `DC53B8DBFEAB40E3D8DD218A5FDEEDB443E6D50B757CB6A07EB01DD70A7833F6`; package and installed `content/zotero-tts.js` SHA-256 `ea7525379ad667eeefa3bf2b8424290d9963f95c7b0fffbb8e1021d1b23b92b7`; XPI and bundle hashes matched | The running profile executes the exact `build/zotero-tts.xpi` | PASS |
| Startup diagnostic | `version: 1.12.6-beta`; 23 steps `ok: true`; `failed: []`; prepared voice switching step present | Startup completes cleanly and the prepared voice switching path is installed | PASS |
| Fixture and native catalog | Fresh PDF item `25448` opened as reader index 1; manager became ready; setup ended `active: true`, `paused: true`, `selected: regional97-a`, `language: en`, `speed: 1.25`, `allVoices: 5`, `voicesForLanguage: 4`, `segments: 17`; menu was A(en-US), C(en-US), B(en), wildcard(*); en-GB was outside the en pool | The disposable native pool contains regional, generic, wildcard and another regional voice while the fixture remains paused | PASS |
| Regional next and previous | Trusted keydown result for each press was `[0, 1, true, true]`; selected sequence from A was `C → A` for next and `C → A` for previous wrapping; menu order remained A/C/B/wildcard | Both directions cycle only the selected voice's normalized `en-US` pool and wrap inside that pool | PASS |
| Singleton regional pool | With a temporary menu of A plus generic/wildcard neighbors, next left selected voice at A; active/paused remained `true/true` | A one-voice regional pool is a no-op even when generic or wildcard candidates exist | PASS |
| Generic selection with stale requested region | Before: selected B, actual language `en`, requested `_region: US`; next selected wildcard; menu stayed A/C/B/wildcard | Generic selection keeps native candidate behavior and does not use a stale requested region to filter | PASS |
| Paused state, speed and request discipline | All shortcut transitions stayed paused; speed stayed `1.25`; after setup, `callsDuring.total: 0`, `samples: 0`, `segments: 0` | A paused shortcut selection stays paused, preserves speed and requests no sample or segment audio | PASS |
| Mechanism diagnostic | `mechanism: prepared-native-voice-v1`; bindings `previous: Shift+,`, `next: Shift+.`; fixture handoff report was null because the check intentionally remained paused | The diagnostic identifies the production prepared-native mechanism and default bindings | PASS |
| Cleanup and restoration | Fixture reader/item remaining `0/0`; user reader title remained `Clinically applicable deep learning for diagnosis and referral in retinal disease`, `active: true`, `paused: true`, selected `Fish voice (identifier omitted)`; selected tab restored to `tab-B6Gfh9ig`; position rows `66`, queue `0`, lastError `null`; all listed preference values and user-value flags matched baseline; volume restored to `100`; debug store `true`; prototype patch restored | No fixture, pending patch or temporary preference remains and the user's tab/session state is restored | PASS |
| End errors | `zotero_read_errors` returned 51 ring entries; no `[zotero-tts]` or `zotero-tts.js` error. Fresh teardown entries were Zotero/fixture errors at 11:03:15 (`parentItem.isRegularItem is not a function`, `item.getField is not a function`, `item.isAttachment is not a function`, `updatedItem.isAnnotation is not a function`, `InvalidStateError: Navigated away from page`); older locale, sync, install and pre-existing dead-object entries were unrelated | No new plugin or dead-object error attributable to this run | PASS (known Zotero/fixture noise only) |

The native manager's compatible `en` pool visibly contained all four English
voices, but the trusted keyboard transitions selected only the two voices whose
actual `language` was `en-US`. The generic B voice remained selectable by the
native behavior when its actual language was `en`, even while `_region` was
temporarily `US`, which exercises the stale-request guard. The en-GB fixture
voice remained in the catalog but was not compatible with this en reader.

The four setup segment requests were silent controlled transport calls made by
the fixture's initial playback/prefetch before it was paused. The shortcut
check itself added no calls, so no provider or paid synthesis was used. This
paused pass does not establish audio advancement, pronunciation, audible
continuity or subjective display behavior.

The reusable scripts that ran are in
`test/zotero-dev/scripts/voice-switch-regional/`. The exact sanitized run
fields are in `evidence.json` beside this report. No production source was
changed during live verification. The installed fixed beta remains installed;
the user's volume, sync switches, remembered voice, native voice preference,
debug-store state, selected tab and reader state were restored.
