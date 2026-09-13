# Issue #95 beta2 preparation record — superseded

This directory records the beta2 install that preceded the parent session's
final scheduling fixes. Beta2 was installed in place and its startup
diagnostic passed; no voice-switch behavior result from beta2 is retained.

| Check | Observed | Status |
| --- | --- | --- |
| Build identity | Plugin `1.12.5-beta2`; XPI SHA-256 `1526C5AB2AEA4583FE3EBBDAD71BB28FC38DFD320A2B4BFE32F745EF765B72C3`; bundle `content/zotero-tts.js` SHA-256 `A3370882D62CDA9219B3FAC8950F7A9E2CFD047721BED6687C7B6A1CA2762D2D` | PASS |
| Startup | `diagnostics.startup()` reported version `1.12.5-beta2`, all startup steps `ok`, including `prepared voice switching`, and `failed: []` | PASS |
| Behavior | Parent session then prepared beta3 to remove timestamp-validation clock drift and extra sentence preparation while a ready boundary waited for native delay | NOT RUN; superseded |

The accepted live evidence is in the [beta3 report](../2026-09-13-1.12.5-beta3/report.md).
