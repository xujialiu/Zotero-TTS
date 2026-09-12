# Auto-scroll beta3 live scripts (issue #93)

These scripts were run against Zotero 10.0.2-beta.9+c77df79af with Zotero-TTS 1.12.3-beta3. They require the zotero-dev bridge, the existing Fish voice in the profile, PDF attachment 25417 (`PDF`), and the retained return-key EPUB attachment 25387 (`ZTTS Return-Key EPUB`).

The run did not change provider configuration, credentials, locale, OS audio, or WebDAV. It changed only the two auto-scroll/shortcut preferences during checks, the two fixture readers' position, flow, zoom, and player state, and the fixture attachment view/bookmark state. All were restored before the end of the run.

## Scripts that actually ran

- `ui-binding-shortcut.js` checks the Highlight radio binding, default mode, and shortcut row.
- `shortcut-recorder.js` records `Ctrl+Shift+F9`, clears it, and restores the original binding.
- `pdf-manual-intent.js` checks trusted wheel, direct manager resume, and the native play/pause resume guard.
- `pdf-shortcut.js` checks trusted Shift+A, toast text, repeat suppression, and preserved paused/manual state.
- `epub-shortcut-before-playback.js` checks Shift+A in an idle paginated EPUB.
- `epub-manual-intent.js` checks trusted wheel, direct/native resume, corrected inner-document PageDown routing, and explicit return.
- `epub-scrolled-sentence.js` checks three or more natural sentence transitions in scrolled flow, full-range center targets, repeated word ticks, and the moving Fish clock. It directly settles each issued target because smooth pixels are unavailable in this bridge.
- `epub-arrowright.js` checks one trusted unmodified `ArrowRight` sentence skip. `Shift+ArrowRight` is the paragraph action and is not used as sentence-skip evidence.
- `epub-paginated-scrolled.js` records paginated entry and scrolled-flow outside/clipped target behavior.

The unchanged reusable identity, audio, geometry, and corrected PDF PageDown scripts were run from `test/zotero-dev/scripts/auto-scroll/identity-startup.js`, `audio-clock-probe.js`, `pdf-outside-visible.js`, `pdf-clipped-target.js`, `pdf-sentence-audio.js`, and `pagedown-routing.js` with beta3 installed. Those source scripts were not modified.

## Expected output and restoration

- The installed version is `1.12.3-beta3`; startup has 21 `ok` steps and `failed: []`.
- The default mode is `outside`; the default toggle binding is `Shift+A`.
- Trusted wheel/PageDown changes `following` to `false`; direct and native playback resume preserve that state. Trusted return/skip restores `following` with `reason: "explicit"`.
- Paginated EPUB reports `flow: "paginated"` and `reason: "page"` when a new starting page is brought in. Scrolled EPUB and PDF report the computed target separately from physical smooth-scroll pixels.
- Restore `readAloud.autoScrollMode`, `shortcuts.toggleAutoScroll`, the Fish memory and voice list, PDF bookmark/view state, EPUB CFI bookmark/flow, player state, and close both fixture readers. Verify `diagnostics.position()` has no open readers, `queued: 0`, and `lastError: null`.
