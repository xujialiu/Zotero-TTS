# Issue 94 live run (sanitized)

Case 3g observations and recorded bridge scripts. Read the [script prerequisites](../../scripts/angle-brackets/README.md) before reuse. Raw user state has been redacted.

## Identity

- Zotero: `10.0.2-beta.9+c77df79af`, Firefox 140, Windows
- Plugin: `1.12.4-beta2`
- XPI SHA-256: `9CB08F3F817B605EB65321C82756A095BE2FB855E1E29C436EDA29DB5909C7FC`
- Bundle `content/zotero-tts.js` SHA-256: `8889D58E331BFE71DE5631824A14744228111392134007147DBDCAA420922EEE`
- Fixture item ID during run: `25431`; key `2VDJKQVT`
- Provider: configured Fish free model `s2.1-pro-free`; no native paid transport used

## Baseline (section 0)

```json
{
  "readers": [{"itemID":"[REDACTED_USER_STATE]","active":true,"paused":true,"selectedVoiceID":"[REDACTED_USER_STATE]","selectedTier":"local"}],
  "settingsWindowOpen": true,
  "selectedPane": "zotero-prefpane-general",
  "debugStoring": true,
  "prefs": {
    "readAloud.stripAngleBrackets": {"value":true,"user":false},
    "readAloud.volume": {"value":100,"user":false},
    "webdav.syncPositions": {"value":true,"user":true},
    "webdav.autoUploadSettings": {"value":true,"user":true},
    "webdav.syncSettings": {"value":false,"user":false},
    "readAloud.memory": {"value":"[REDACTED_USER_STATE]","user":true}
  },
  "position": {"databaseRows":66,"legacyPref":null,"queued":0,"lastError":null}
}
```

The temporary run set `webdav.syncPositions=false`, `webdav.autoUploadSettings=false`, `webdav.syncSettings=false`, `readAloud.volume=0`, and `readAloud.stripAngleBrackets=true`. Cache and prefetch probes restored their own values inside each script.

## Exact preparation scripts that ran

The following scripts were run after installation and startup. The baseline script returned the user reader and memory fields; those output values are redacted here. Later restore calls used the recorded baseline result in the same session, but did not persist a global baseline object.

### Baseline snapshot

[Recorded script 1: Baseline snapshot](../../scripts/angle-brackets/01-baseline-snapshot.js)

Observed (sanitized): one pre-existing user reader was active and paused; the settings window was open on General; debug storage was already true; `readAloud.stripAngleBrackets=true/user=false`, `readAloud.volume=100/user=false`, `webdav.syncPositions=true/user=true`, `webdav.autoUploadSettings=true/user=true`, `webdav.syncSettings=false/user=false`; position database rows `66`, legacy pref `null`, queue `0`, `lastError:null`.

### Disable uploads and mute before playback

[Recorded script 2: Disable uploads and mute before playback](../../scripts/angle-brackets/02-disable-uploads-and-mute-before-playback.js)

Observed: sync positions, settings backup and settings sync were false; volume was `0/user=true`; strip was `true/user=false`. `zotero_clear_logs({})` then returned `Logs and error console cleared`; debug storing remained true.

### Fixture import

[Recorded script 3: Fixture import](../../scripts/angle-brackets/03-fixture-import.js)

Observed: temporary standalone EPUB attachment, item ID `25431`, key `2VDJKQVT`, type `attachmentEPUB`.

### Fixture open and manager readiness

[Recorded script 4: Fixture open and manager readiness](../../scripts/angle-brackets/04-fixture-open-and-manager-readiness.js)

[Recorded script 5: Fixture open and manager readiness](../../scripts/angle-brackets/05-fixture-open-and-manager-readiness.js)

Observed: `called:true`; the fixture reader reached `_internalReader` and `_readAloudManager` immediately in the readiness poll. The pre-existing user reader was left untouched.

### Audio motion probe (before playback checks)

This was the first playback-driving script. It opened and paused only fixture item `25431`; the volume had already been set to zero by the preceding script.

[Recorded script 6: Audio motion probe (before playback checks)](../../scripts/angle-brackets/06-audio-motion-probe-before-playback-checks.js)

Observed trace: inactive at 0–200 ms, active/unpaused at 300–500 ms, then the script paused the fixture. The controller reported `audioState:"suspended"`, `audioTime:0`, `position:0`; final manager state was active+paused. Error console then contained autoplay/`AudioContext` blocking messages. Synthesis, timestamp, cache and prefetch mechanisms remained testable; physical speaking/advancement was recorded `NOT TESTABLE`.

## Startup

`return Zotero.ZoteroTTS.diagnostics.startup();`

Observed: version `1.12.4-beta2`; 22 startup steps `ok`; `failed=[]`.

## English UI probe

[Recorded script 7: English UI probe](../../scripts/angle-brackets/07-english-ui-probe.js)

Observed: id `ztts-strip-angle-brackets`, checked `true`, preference `extensions.zotero.zotero-tts.readAloud.stripAngleBrackets`, row `Remove enclosing angle brackets when reading`, help explains outside punctuation and stop/reopen. Chinese strings were verified in the paired locale source and automated l10n tests; the app locale was not switched during live testing.

## Real provider request capture

The following pattern was run against the fixture reader's `manager._options.remoteInterface`. It temporarily disables cache and prefetch, wraps only the plugin sandbox `fetch`, records URL path/method/body `text`/format, and restores fetch and preferences in `finally`. It never reads headers.

[Recorded script 8: Real provider request capture](../../scripts/angle-brackets/08-real-provider-request-capture.js)

Observed true-session calls:

```json
{
  "calls": [
    {"path":"/v1/tts/stream/with-timestamp","method":"POST","text":"Hello world.","format":"mp3"},
    {"path":"/v1/tts/stream/with-timestamp","method":"POST","text":"“The quick brown fox jumps over the lazy dog!”","format":"mp3"}
  ],
  "mappedSlices": [["Hello","world"],["The","quick","brown","fox","jumps","over","the","lazy","dog"]]
}
```

Mapped positions for the first source were `[1,6]` and `[7,12]`; the second source's words began at `[2,5]`, `[6,11]`, `[12,17]` and ended at `[42,45]`, retaining the original curly quote and deleted bracket coordinates.

## Empty pair and prefetch

[Recorded script 9: Empty pair and prefetch](../../scripts/angle-brackets/09-empty-pair-and-prefetch.js)

Observed: empty returned 6444-byte short pause with timestamp `{start:0,end:86400,charStart:0,charEnd:2}` and made no request for `<>`; the only captured request was prefetch text `The final sentence continues after the empty pair.`.

## Session setting and cache probes

`return await Zotero.ZoteroTTS.diagnostics.textSettings();` observed:

- active at start: both readers `patched:true, configured:true, effective:true`;
- after setting the pref false while fixture active/paused: fixture `configured:false, effective:true`;
- after `toggleReadAloudPopup(false)` and reopen: fixture `configured:false, effective:false`; body for `<Hello world>.` was the unchanged original;
- after setting true, stop and reopen: fixture `configured:true, effective:true`;
- two cached `<Hello world>.` requests produced no fetch calls, identical 7940-byte audio and identical mapped timestamps `[1,6]`/`[7,12]`; logs included `(cached)`.

Exact session flip/stop/reopen scripts that ran (each targeted fixture item `25431`):

[Recorded script 10: Session setting and cache probes](../../scripts/angle-brackets/10-session-setting-and-cache-probes.js)

[Recorded script 11: Session setting and cache probes](../../scripts/angle-brackets/11-session-setting-and-cache-probes.js)

[Recorded script 12: Session setting and cache probes](../../scripts/angle-brackets/12-session-setting-and-cache-probes.js)

Observed after the false flip while active+paused: both reports were `patched:true, configured:false, effective:true`; the live checkbox became unchecked. After stop/reopen, the fixture report was `configured:false, effective:false`. The same three scripts were run with `true` for the restore cycle; after stop/reopen the fixture report was `configured:true, effective:true`.

### Exact cache-repeat probe

This ran after the true restore/reopen. It disabled only prefetch for the duration so the two calls tested the existing audio cache without adding another warm chain, then restored the prefetch value and user-value status in `finally`.

[Recorded script 13: Exact cache-repeat probe](../../scripts/angle-brackets/13-exact-cache-repeat-probe.js)

Observed: `calls:[]`; both results had 7940-byte audio and timestamps mapping `Hello` `[1,6]`, `world` `[7,12]`; `sameTimestamps:true`; `prefetchRestored:true`. The debug store contained the corresponding `(cached)` lines.

### Exact source-position equality probe

After the native stub had been restored, this reopened and paused the fixture normally, then compared the controller's seven segment records with the expected original texts, ranges and EPUB CFI positions.

[Recorded script 14: Exact source-position equality probe](../../scripts/angle-brackets/14-exact-source-position-equality-probe.js)

Observed: trace reached active/unpaused at 100 ms and was paused by the script; segment count `7`; `unchanged:true`; both fixture and user session reports were patched, active, configured true, effective true.

## Native stub

The prototype `_getReadAloudRemoteInterface` was replaced only while closing/reopening item `25431`; the stub returned one Standard and one Premium voice, recorded `getAudio`, then the original prototype was restored in `finally`. The stub returned a timestamp over the prepared text, a sample marker, and `{audio:null,error:'native-network',noStore:true}` for the error case.

Exact native-stub script that ran:

[Recorded script 15: Native stub](../../scripts/angle-brackets/15-native-stub.js)

## Cleanup restore order

The fixture cleanup script closed the target reader with `toggleReadAloudPopup(false)`, called `reader.close()`, waited for item `25431` to leave `_readers`, and awaited `Zotero.Items.get(25431).eraseTx()`. It observed `fixtureItemExists:false`, `fixtureReadersRemaining:0`, database rows `66`, queued `0`, and `lastError:null`.

The final restore script ran in this order while uploads were still disabled: clear the temporary volume user value (100/default), clear the temporary strip-angle user value (true/default), set `webdav.syncPositions=true` (user value), set `webdav.autoUploadSettings=true` (user value), clear `webdav.syncSettings` (false/default), then write the baseline `readAloud.memory` string last. It observed all values and user-value flags equal to the baseline. The settings pane was returned to General by clicking `richlistitem[value="zotero-prefpane-general"]` after the async navigation call timed out.

### Exact fixture cleanup script

[Recorded script 16: Exact fixture cleanup script](../../scripts/angle-brackets/16-exact-fixture-cleanup-script.js)

Observed: `closed:true`, `erased:true`, `fixtureReadersRemaining:0`, `fixtureItemExists:false`, position rows `66`, queue `0`, `lastError:null`.

### Exact preference restore script (memory literal redacted)

The executed script used the baseline memory string captured earlier. Its literal is replaced below by `[REDACTED_USER_STATE]`; this is the only redaction in the script transcription.

[Recorded script 17: Exact preference restore script (memory literal redacted)](../../scripts/angle-brackets/17-exact-preference-restore-script-memory-literal-redacted.redacted.js.txt)

Observed after substituting the recorded baseline value at runtime: every named value and user-value flag matched baseline; volume was `100`; debug storage was true. The submitted evidence should retain only `memoryEqualToBaseline:true` and `user:true`, never the raw memory string.

### Settings pane restoration after timeout

This exact navigation attempt timed out at the bridge's evaluator:

[Recorded script 18: Settings pane restoration after timeout](../../scripts/angle-brackets/18-settings-pane-restoration-after-timeout.js)

The fallback that actually restored General was:

[Recorded script 19: Settings pane restoration after timeout](../../scripts/angle-brackets/19-settings-pane-restoration-after-timeout.js)

[Recorded script 20: Settings pane restoration after timeout](../../scripts/angle-brackets/20-settings-pane-restoration-after-timeout.js)

Observed fallback result: `selected:"zotero-prefpane-general"`; the settings window remained open.

Observed: `patchRestored:true`; native saw `Hello.` and `“World!”` with `lang`, `paragraphStart`, position and sourcePosition metadata; mapped timestamps were `Hello` `[1,6]` and `World` `[2,7]`; sample marker and error/noStore were unchanged. No paid native request was made.

## Cleanup and final state

- fixture reader closed; fixture item `25431` erased; no fixture reader/item remained;
- position database rows remained `66`, queue `0`, `lastError:null`;
- settings window remained open and was returned to `zotero-prefpane-general`;
- user reader remained active/paused with its original voice and tier: `[REDACTED_USER_STATE]`;
- restored: volume `100` user=false, strip true user=false, syncPositions true user=true, autoUploadSettings true user=true, syncSettings false user=false, readAloud.memory equal to baseline (`true`) with user=true;
- debug store remained true;
- final plugin errors: none; error console had only non-plugin `TypeError: can't access property "makeGlobalObjectReference", this.dbg is null` from the timed-out bridge pane navigation and `InvalidStateError: Navigated away from page` from fixture lifecycle.

## Verification limits and final artifact

- Actual transport, timestamps, cache and preparation passed with the configured
  Fish free model. The native route passed with a restored local stub, not a
  paid service call.
- AudioContext remained suspended at currentTime 0, with autoplay blocked.
  Continuous playback past the empty segment and subjective listening were
  not verified. Prefetching the following sentence is not playback completion.
- Chinese text passed source/l10n checks; the live locale was not switched.
- After final source whitespace cleanup, a rebuild was compared to the installed
  bundle: identical except build date/time. The delivered XPI and bundle retain
  the exact live-tested hashes above.
- Full automated suite: 2,122 passed; two subsequent edge tests (UTF-16/native
  array handling and concurrent synthesis coordinates) passed in a focused run.
  Final typecheck and build passed. No feature commit or release was made.
