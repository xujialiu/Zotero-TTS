# Auto-scroll help verification

This case is the focused issue #93 beta4 settings-only check. It may inspect
the installed identity, startup diagnostic, settings window, and the
`readAloud.autoScrollMode` preference. An existing reader may remain open as
user state, but the check must not operate it, start or resume playback,
change providers, voices, locale, OS audio, or WebDAV state.

The intended help check, when the fresh baseline is valid, is:

1. Navigate the settings window to `zotero-tts-pane` and wait for the pane.
2. Confirm the Highlight auto-scroll radiogroup has exactly two rows, one
   adjacent `?` per radio, and distinct meaningful `help` attributes:
   `ztts-help-auto-scroll-sentence` and `ztts-help-auto-scroll-outside`.
3. Focus the settings window and hover each `?` with the bridge's trusted
   `sendMouseEvent` route. The `ztts-help-tip` popup must open with the
   matching, distinct label for each icon.
4. Click each radio and verify the group value and the named preference move
   to `sentence` and `outside`, then restore the original preference value and
   user-value flag in the same script. Keyboard traversal within the group is
   an optional supporting observation.

The reusable bridge snippets below are the exact probes run in the beta4
attempt. The baseline records the current user-selected mode and any existing
reader, then the UI probe restores the exact mode and user-value flag after its
radio checks. Existing reader/controller/player flags are observed before and
after and must remain unchanged.

- `startup.js`: `Zotero.ZoteroTTS.diagnostics.startup()`.
- `baseline.js`: records the named auto-scroll preference, its user-value flag,
  the settings-window presence/title, and reader count.
- `reader-snapshot.js`: records reader title and read-aloud active/popup flags
  without closing or changing the reader.
- `inspect-rows.js`: reloads the plugin pane and records the nested radio/help
  rows and localized help attributes.
- `hover-sentence.js` and `hover-outside.js`: open each `ztts-help-tip` with
  trusted mouse movement and record its popup label and the default tooltip
  state.
- `radio-binding.js`: clicks both nested radios, attempts trusted arrow
  navigation, observes the reader/controller flags, and restores the original
  preference in `finally`.
- `keyboard-probe.js`: optional trusted Space/Arrow probe; this runtime did
  not change the radio selection through that route, so keyboard navigation is
  left unclaimed while the required click check remains covered.

Prerequisites: Zotero 10.0.2-beta.9+c77df79af, the MCP Bridge for Zotero,
and beta4 XPI `build/zotero-tts.xpi` with the identity recorded in the run
report. Expected baseline: settings window open and the exact preference state
recorded before the UI check. Existing readers are preserved and not operated.

Permitted changes: installing the requested XPI, opening/reloading the settings
pane, and temporarily selecting the two auto-scroll radios. Cleanup: leave
beta4 installed; restore the exact auto-scroll value and user-value flag in the
same UI script; close only a settings window opened by the probe. The active
reader/controller/player state must be unchanged.
