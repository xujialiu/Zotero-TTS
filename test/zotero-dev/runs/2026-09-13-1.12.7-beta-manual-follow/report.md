# Zotero-TTS 1.12.7-beta manual-follow reentry

## Identity and fresh baseline

The installed artifact is Zotero-TTS `1.12.7-beta`, XPI SHA-256 `f313bcd34276a184dcd5207a6ee9b9f6b058676f508f5b71fad2dda7a4655e16`, bundle SHA-256 `6c839a5b185cbcdc63bb27dd950497c553bbe2e233c1a11ba294d52bd2f71ccc`, from HEAD `0812b0a28e3bb59483cdb4649cf2a7029706eed4`. Startup returned 23 `ok` steps and `failed: []`.

The fresh baseline used `Zotero.__ztts127Baseline`: reader 19598 was inactive/paused, reader 25227 was active/paused at position 2994 with its popup open, tab `tab-ii8AXoBQ` was selected, and the settings window was open. The temporary run volume was muted and WebDAV sync/upload were disabled before fixture playback.

## Fresh checks

| Check | Observed values | Status |
| --- | --- | --- |
| Settings and bracket configuration | Keep-following label was `Keep auto-scroll while the sentence is visible`; help described automatic reentry. Bracket controls were present, checked, and showed `<> []`; the input was disabled while enabled. | PASS |
| PDF reentry cycle | Trusted wheel was recorded. At `scrollTop=800`, the sentence rect was `[212.941,-615.856,624.281,-582.895]`, `visibleFragments=0`, position stayed `0`, `following=false`, `visibilityPaused=true`, reason `wheel`. After 500 ms these values were unchanged. Returning to target 200 produced a visible rect and settled at `scrollTop=0`, `following=true`, `visibilityPaused=false`, reason `visible`, without an explicit relock. | PASS |
| Scrolled EPUB reentry cycle | Trusted wheel was recorded. At `scrollY=800`, the sentence rect was `[440,-765.100,919.700,-727.100]`, `visibleFragments=0`, position stayed `0`, `following=false`, `visibilityPaused=true`, reason `wheel`. After 500 ms these values were unchanged. Returning to target 50 produced a visible rect and settled at `scrollY=0`, `following=true`, `visibilityPaused=false`, reason `visible`, without an explicit relock. | PASS |
| Cleanup and restoration | Fixtures 25487 and 25488 were erased; both fixture readers closed with `left=0`. Final readers were the two baseline readers, selected tab and settings window were restored, position store was `66 rows / queued 0 / lastError null`, and all baseline preference values/user flags matched. | PASS |

## Errors and limits

The final `Zotero.getErrors()` count remained 26, with no new plugin runtime or dead-object error. Two new relevant entries were the expected manifest warning that a `-beta` version is not a four-integer version string. The error console also contains Zotero sync/locale noise and one native `InvalidStateError: Navigated away from page`; no new `[zotero-tts]` stack was observed.

This run intentionally covers only fresh identity, settings, one PDF cycle, one scrolled EPUB cycle, and cleanup. The earlier beta4 run remains the evidence for the broader PDF/EPUB mode matrix, paginated navigation, off behavior, controlled speech reentry, and hidden/paused lifecycle. Natural audio progression remains untestable on this machine because fixture AudioContexts stayed suspended at `currentTime=0`; it was not retried here.

## Artifacts

- [Executed scripts](scripts/)
- [Artifact identity](00-artifact-identity.raw.txt)
- [Baseline raw return](00-baseline.raw.txt)
- [Startup raw return](02-startup.raw.txt)
- [Settings raw return](03-ui-settings.raw.txt)
- [PDF cycle raw return](09-pdf-reentry-cycle.raw.txt)
- [EPUB cycle raw return](10-epub-reentry-cycle.raw.txt)
- [Close fixtures](11-close-fixtures.raw.txt), [erase fixtures](12-erase-fixtures.raw.txt), [restore state](13-restore-state.raw.txt), [final audit](14-final-audit.raw.txt)
