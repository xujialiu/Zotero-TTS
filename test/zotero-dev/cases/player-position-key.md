# Player position shortcut (issue #122)

[Checklist index](../README.md) · [Scripts](../scripts/player-position-key/README.md)

Run the baseline first. Use disposable PDF and EPUB fixtures and muted
output; preserve preferences and user-value flags, restore memory last.
Reuse preparation from the player-controls kit. Retain successful scripts
under `../scripts/player-position-key/` with their prerequisites and cleanup.

## 1. Cycle and persistence

- Open the plugin player. Trusted Shift+P cycles top → A (Bottom bar) →
  B (Floating panel) → top. `diagnostics.pluginPlayer()` reports each
  layout, and every open fixture frame's data-layout matches it.
- Run from the reader view and with a player control focused, playing and
  paused. Layout changes retain manager/controller, voice, speed, active
  segment and paused state. Use bounded real playback; distinguish a
  progressing source from suspended audio.
- Change position manually, then press the key: it advances from the manual
  choice. Settings and other open players agree. Close/reopen and reinstall
  preserve the saved position; verify preference value and user-value flag.
  A full process restart is not required for this check.

## 2. Guards and recorder

- Closed player, plugin player disabled, and no reader context: Shift+P
  falls through without changing the preference or opening a player.
- Holding Shift+P produces one transition, repeat events produce none.
  Inputs/search, extra modifiers and already-consumed events do not change
  position. Unit tests additionally cover an unavailable adapter.
- Settings shows Player position and Shift+P with localized help. Record a
  new key, verify it works immediately and Shift+P no longer does; Clear
  disables it and Restore defaults returns Shift+P. Conflicting shortcuts
  name Player position. Preserve all other shortcut bindings during cleanup.

## 3. Cleanup and limits

Close/erase fixtures, restore exact named preference values and user flags,
restore selected owner tab and check new relevant errors/duplicate nodes.
Playback listening quality and perceived movement remain human observations;
state identity, actual geometry and event consumption are machine checks.
