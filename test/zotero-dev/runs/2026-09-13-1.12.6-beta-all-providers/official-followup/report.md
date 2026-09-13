# Official Standard/Premium #95 handoff follow-up

Build: Zotero-TTS 1.12.6-beta; XPI SHA256 DC53B8DBFEAB40E3D8DD218A5FDEEDB443E6D50B757CB6A07EB01DD70A7833F6; Zotero 10.0.2-beta.9+c77df79af (WINNT).

| Case | Source -> target | Result | Ready/controller | Timing evidence |
| --- | --- | --- | --- | --- |
| standard same-tier shortcut | bdd0dcc3-en-US -> da18e317-en-US | PASS_WORD | controller 144 ms; diagnostic audio-ready 2392 ms (first bridge observation 6935 ms) | old/new timings 27/27; word charStart 97, offset 5.12075 |
| premium same-tier shortcut | a6ac2542-en-US -> 5c8d9d0d-en-US | PASS_WORD | controller 132 ms; diagnostic audio-ready 3168 ms (first bridge observation 8344 ms) | old/new timings 27/27; word charStart 122, offset 5.54 |

| Cross-tier entrypoint | Observed | Result |
| --- | --- | --- |
| Standard/Premium live menus (official-only fixture) | standard 6, premium 13, foreign rows standard 0, premium 0 | PASS |
| Manual Standard -> Premium | controller rebuilt true; position 11 -> 11 | manual native tier change, not #95 handoff |
| Local/Standard/Premium menus (Kokoro enabled fixture) | local 30, standard 6, premium 13; foreign rows 0/0/0 | PASS |
| Manual Premium -> Local -> Standard -> Premium | all controller rebuilds true; positions 0->0, 0->0, 0->0 | manual native tier changes, not #95 handoffs |

Fixture cleanup: reader closed=true, item erased=true.
Restoration: PASS; selected user tab restored=true; position rows=66; error-store=26; plugin-matched=0; dead-object-matched=0 (zotero_read_errors returned 120 historical entries).

Official Standard/Premium native tier operations are metered and were bounded to the two same-language voices per tier. Standard first request returned HTTP 500 and the built-in retry returned 200; Premium requests returned 200. AudioContext state is reported in evidence; auditory quality remains human-only.

