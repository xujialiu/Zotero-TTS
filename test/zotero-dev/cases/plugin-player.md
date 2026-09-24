# Plugin player

[Checklist index](../README.md)

Run the baseline first. Use disposable PDF and EPUB fixtures, a configured
provider, and muted output. Do not start or resume the owner's document.
Retain exact preference values and user-value flags; restore memory last.

For floating menu placement, Options, skip buttons, speed steps and the
top-bar default, also run [the player-controls case](player-controls.md).

## 1. Entry and layouts

- Install the xpi; all startup steps succeed. `diagnostics.pluginPlayer()`
  reports layout/readers from the sandbox. Count one frame, style,
  and toolbar icon per reader, with no prototype remnants.
- The plugin icon replaces the native icon in every reader.
  The player starts closed. Clicking on a
  fixture opens the player and activates the real manager; click again
  stops the manager and closes the panel.
- Bottom bar, Top bar and Floating panel switch from the player and from
  Settings. The manager/controller, selected voice, speed, volume, pause
  state and active segment survive a layout-only change. Bars lie 34 px
  over the document's edge, outside the sidebar, and the document area
  keeps its size ([player-cover](player-cover.md)). Menus stay 8 px
  above/below docked bars as the host frame expands; theme colors match
  native controls.
- Persist the layout, reopen Settings, and reinstall. The layout
  remains.

## 2. Real playback and selection

- Compare providers, languages, selected ids and regional voice rows to
  the patched manager and voice browser. No sample catalog remains.
- Pick two available voices and, where configured, two providers. Observe
  actual manager selection and shared memory, then real synthesis for a
  bounded fixture passage. No unexpected fallback to a metered tier.
- Pause/resume, change speed and volume, and close from the icon. Compare
  manager active/paused/speed, the shared volume pref and the actual gain.
  Muting remains in effect except for an explicitly identified check.
- Change voice/speed in Settings or by a shortcut; the player updates.
  Keyboard shortcuts work while a player control is focused; search and
  popup navigation do not trigger reading shortcuts.

## 3. Favorites and following

- Toggle a heart in the player; the shared favorite pref and an open voice
  browser update. Change it in Settings; the player updates. Restore the
  list. With favorites-only active, removing a voice used by any reading
  session is refused visibly; changes to unrelated favorites succeed
  without interrupting playback ([reading guard](reading-guard.md), #121).
- Follow the [A/M state case](player-following.md) for PDF/EPUB status,
  document-local mode selection, manual navigation and explicit recovery.

## 4. Errors and cleanup

- Invalid/stale choices and playback errors are visible, and Retry reaches
  the controller. A provider with no voices shows a useful empty/loading
  state. Do not make unbounded failing network requests for this check.
- Close fixtures, restore all touched preferences and flags, and inspect
  new errors by timestamp. The player must leave no duplicate nodes or
  callbacks that log dead-object errors after closing a tab or reinstalling.
- Report actual audio progression separately from muted transport/state
  evidence. Natural listening quality and perceived animation smoothness
  remain human checks when the environment cannot demonstrate them.

## 5. The only player (issue #134, ADR 0007)

1. **No switch.** Settings → Zotero-TTS → Player has no *Use plugin
   player* row. `diagnostics.pluginPlayer()` has no `enabled`; each
   reader reports `open` and `failed` (`null`). A profile holding
   `zotero-tts.readAloud.usePluginPlayer` `false` (written before the
   install, restored after) gets the plugin icon and the Player on every
   open, and the pref is left as it was.
2. **Every way in opens the Player; Zotero's own never shows.** On a PDF
   and an EPUB fixture, in a tab and in a reader window (*Move to New
   Window*): the plugin's toolbar button, Cmd/Ctrl+Shift+R, Shift+Space
   and *Read Aloud from Here* each open the Player (`open: true`), and
   `.read-aloud-popup` and `#read-aloud` read computed `display: none` on
   every sample, taken every 50 ms from before the open until the reading
   plays. Close a reader window with `reader.close()`, never
   `reader._window.close()`: that skips Zotero's close, leaves a dead
   entry in `Zotero.Reader._readers`, and at the next reinstall six
   startup steps that walk the readers fail on it (2026-09-24).
3. **A Player that cannot load refuses the reading.** Take the Player's
   resource away for the run: `setSubstitution(<the host of
   pluginPlayer().resource>, null)` on
   `Services.io.getProtocolHandler('resource')` as
   `nsISubstitutingProtocolHandler`. Open a new fixture tab. Once its
   connection gives up — 100 × 50 ms, about 5 s, later with the window in
   the background or the bridge busy (2026-09-24) — its reader reports
   `failed: "frame"`, and one `player did not finish loading` error is
   logged. Let the document settle before a key: on a reader given no
   time, Shift+Space started nothing. Then:
   - the plugin's button shows the toast *The Zotero-TTS player could not
     load here. …* and nothing reads (`active` false);
   - Shift+Space's reading is closed at the Player's next check, every
     250 ms and later when Zotero is busy (`popupOpen` false), with the
     same toast, once;
   - Zotero's popup is never displayed.

   Item 4's reinstall registers the resource afresh; close the tab
   first.
4. **An update mid-reading shows no Zotero player.** This beta must
   already be installed: an update *from* a build before #134 still shows
   Zotero's popup once, since that build's shutdown takes the hiding rule
   away. Start a fixture reading, muted and playing, then reinstall the
   same xpi in place. Sample `.read-aloud-popup`'s computed `display`
   every 50 ms from before the install until 2 s after the new
   `pluginPlayer()` answers: `none` on every sample. Afterwards:
   - the Player is closed (`open: false`);
   - the session is paused at the same segment (`diagnostics.engine()`
     `adopted`, as in the Engine case's item 24);
   - the plugin's button opens the Player and resumes from that segment.
5. **A disable hands Zotero's player back.** Tools → Plugins, disable
   Zotero-TTS: no `#ztts-player-style`, `#ztts-player-toggle` or
   `#ztts-player-frame` in any open reader; Zotero's headphone button
   shows and opens Zotero's own player. Enable it again: the Player is
   back in every reader.
6. **An old backup skips the switch.** Human-only: the restore opens
   Zotero's file dialog, which blocks the bridge (see
   [limitations](../limitations.md), section 8); the unit test
   `test/core/settings-backup.test.ts` covers the skip. By hand, restore a
   backup file holding `"readAloud.usePluginPlayer": false` (the current
   backup with that key added): the restore message lists it among the
   skipped keys, and the Player still shows.
7. **The Options key falls through with the Player closed.** The key is
   the profile's *Player options* binding: Shift+O by default, Shift+Q on
   the owner's profile. After item 4, with the reading open and the Player
   closed, it changes nothing:
   `playerOptions()` reads `player: false`, `button: false`. In the
   Floating panel it folds and unfolds the rows.
8. **The wording.** The Zotero section's note says credits are bought on
   zotero.org, and the favorites switch reads *Offer only favorite voices
   in the player* (zh-CN *播放器中只提供收藏的语音*).

The executed scripts belong in `../scripts/plugin-player/`.
