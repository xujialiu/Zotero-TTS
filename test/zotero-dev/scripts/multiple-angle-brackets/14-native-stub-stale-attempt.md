# Discarded native-stub attempt

The first pass used the retained `angle-brackets/15-native-stub.js` probe with
fixture item `25444` after closing only the Read Aloud popup. `Zotero.Reader.open`
reused that still-open reader, so the probe saw a residual `voice-switch-fixture`
stub: `nativeCalls` was empty, the reported standard tier had one voice,
premium had zero, and the returned marker was `voice-switch-fixture-segment`.

This result was discarded. The fixture reader was then closed and polled out of
`Zotero.Reader._readers` before patching the existing user reader prototype. The
corrected probe is `03-native-multi-group-stub.js`; it reports the six mapped
offsets, restores the prototype, and closes the fixture in `finally`.
