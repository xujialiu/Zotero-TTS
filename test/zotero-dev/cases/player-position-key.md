# Player layout shortcut (issues #122, #136)

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
- Change layout manually, then press the key: it advances from the manual
  choice. Settings and other open players agree. Close/reopen and reinstall
  preserve the saved layout; verify preference value and user-value flag.
  A full process restart is not required for this check.

## 2. Guards and recorder

- Closed player and no reader context: Shift+P
  falls through without changing the preference or opening a player.
- Holding Shift+P produces one transition, repeat events produce none.
  Inputs/search, extra modifiers and already-consumed events do not change
  layout. Unit tests additionally cover an unavailable adapter.
- Settings shows Player layout and Shift+P with localized help. Record a
  new key, verify it works immediately and Shift+P no longer does; Clear
  disables it and Restore defaults returns Shift+P. Conflicting shortcuts
  name Player layout. Preserve all other shortcut bindings during cleanup.

## 3. Cleanup and limits

Close/erase fixtures, restore exact named preference values and user flags,
restore selected owner tab and check new relevant errors/duplicate nodes.
Playback listening quality and perceived movement remain human observations;
state identity, actual geometry and event consumption are machine checks.

## 4. Floating content fits after switching (issue #124)

- On both disposable PDF and EPUB readers, use trusted Shift+P through
  top → A → B → top with Options expanded, then with Options collapsed.
  Repeat the expanded A → B transition three times. Without an open menu,
  B's iframe and panel heights are both 202px expanded or 108px collapsed;
  docked frames are 34px. Inspect actual rectangles, not only data-layout.
  The transport, voice choices when expanded, and bottom controls must fit
  within the floating frame. Manager/controller, voice, speed, position,
  active segment and paused state remain unchanged by each switch.
- Replay the isolated child-renderer regression against installed resources:
  every height notification during expanded A/top → B describes the new
  floating DOM, with no stale 34px report. The final frame/content heights
  match immediately and after an unchanged state snapshot.
- In B, toggle Options both ways, open/close the voice and layout menus,
  and switch layouts with a menu open. Menus remain usable and close on
  switching; closing them restores the matching panel/frame height with
  no clipping or leftover vertical inset. Exercise the manual layout menu
  as well as the shortcut. Retain new executed scripts in this case's kit.
- The regression is a rendered-geometry check in Gecko. Unit tests cannot
  replace it because the local suite has no layout engine; subjective
  animation smoothness remains a human observation.
