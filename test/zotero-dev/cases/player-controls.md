# Player menus, floating controls and speed steps (issue #118)

[Checklist index](../README.md)

Run baseline and cleanup. Use disposable PDF/EPUB fixtures and muted output;
retain exact preference values/user flags, native voice memory and owner state.
Require the selected iframe to be visible and not suspended before judging
geometry or following; #117 showed that an old fixed wait is insufficient.
Do not start or resume owner playback.

## 1. Defaults and Options

- A missing layout user value selects top, including when Gecko retains the
  old default A during an in-place upgrade. Explicit A/B/top values survive.
  Settings agrees with the player. Do not overwrite a saved choice.
- Floating: Options at upper left, Layout at upper right; native 20 px Options
  icon and native four skip icons. Layout tooltip/ARIA and Settings caption
  say Layout with no colon (Chinese uses its own translated label).
- Open player expanded false/true initializes a new opening collapsed/expanded.
  Options and trusted Shift+O toggle only provider/language/voice rows, keep
  the other controls usable and change floating height 108/202 px. Reopen
  follows the setting again. Layout changes preserve this session's choice;
  a setting change alone does not override a user's current toggle.
- Bottom/top bars have no four skip controls or visible Options button.
  Their provider/language/voice rows remain visible.
- All three layouts order the controls Speed, A/M, Volume. In floating,
  A/M's horizontal center equals the panel's center (within 1 CSS px),
  both expanded and collapsed, for speed 0.50/1.25/3.00 and volume
  0/40/100. Values and a visible status button do not move the center or
  overlap the controls. Docked bars retain their normal flow rather than
  centering A/M across the entire bar. Speed/volume menus and mode activation
  remain usable after the reorder (issue #124 follow-up).

## 2. Menu placement and search

- For floating provider, language, voice and Layout: with room below, open
  below even if there is also room above; near the window bottom, open above.
  When neither side fits, select the side with more room and constrain height.
- Record anchor/menu/root rectangles at the first visible animation frame
  and across child resize events. The menu is hidden until its final position;
  no visible frame uses a transient upper location. The floating player's
  screen position stays fixed while its iframe extends above/below it, and
  is unchanged after close. Inspect data-side and host menuInset as supporting
  diagnostics, not as substitutes for the actual rectangles.
- Test provider (no search), short locale list, long voice list, Layout,
  filtered/empty search results, repeated opens and all three layouts.
  Bottom/top menus retain the existing 8 px gap to the bar. Switching menus,
  Escape, outside click and second-click close still work.
- All layouts: scroll language/voice choices down/up; the search rectangle
  stays fixed. Playback snapshot refresh must not reset list scroll. Keyboard
  navigation keeps the selected choice visible without moving the search box.
- Drag the floating panel near top/bottom and resize the host window. No menu
  overflows the viewport; closing a menu restores the proper expanded/collapsed
  frame without moving the panel. Tiny viewports may constrain the choices.

## 3. Floating navigation and speed

- Four independent buttons in native order around Play/Pause: previous
  paragraph, previous sentence, next sentence, next paragraph. Only floating
  has them. Titles/ARIA labels and SVG paths match Zotero Read Aloud.
- In PDF and EPUB, each button calls the real navigation path. Record position
  and active-segment change with matching granularity. From M, each returns to
  the spoken position and A; paused clicks retain paused transport. No sample
  voice/player or manual-position substitute may stand in for the command.
- Player and Settings sliders have step 0.05; faster/slower keys add/subtract
  0.05x with bounds 0.5x-3x. Existing remembered non-grid speeds are not silently
  rewritten. Speed reset keeps its old behavior. Verify manager, label and
  stored speed as applicable, then restore exact prior preferences.
- At least one bounded playing check confirms no restart/change of selected
  voice during Options/layout/menu operations. Suspended audio is reported
  separately from manager/controller state.

## 4. Cleanup and limits

Restore all settings and flags after closing/erasing fixtures, including
layout, openExpanded, speed/voice memory, volume and WebDAV switches. Verify
new relevant errors and stale player nodes after teardown. Report first-frame
rectangle traces separately from subjective perceived motion; natural audio
or listening quality needs actual observation, not a suspended clock.

Retain executed scripts under `../scripts/player-controls/` with the run's
identity, exact build hashes, assertions and restoration evidence.
