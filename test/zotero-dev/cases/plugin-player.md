# Plugin player

[Checklist index](../README.md)

Run the baseline first. Use disposable PDF and EPUB fixtures, a configured
provider, and muted output. Do not start or resume the owner's document.
Retain exact preference values and user-value flags; restore memory last.

## 1. Entry and layouts

- Install the xpi; all startup steps succeed. `diagnostics.pluginPlayer()`
  reports enabled/layout/readers from the sandbox. Count one frame, style,
  and toolbar icon per reader, with no prototype remnants.
- With Use plugin player on, the plugin icon replaces the native icon.
  The player starts closed with no reserved document space. Clicking on a
  fixture opens the player and activates the real manager; click again
  stops the manager and closes the panel.
- Bottom bar, Top bar and Floating panel switch from the player and from
  Settings. The manager/controller, selected voice, speed, volume, pause
  state and active segment survive a layout-only change. Bars reserve
  34 px outside the sidebar. Menus stay 8 px above/below docked bars as
  the host frame expands; theme colors match native controls.
- Persist layout and Use plugin player, reopen Settings, and reinstall.
  Values remain; the original icon returns when the switch is off.

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
  list. With favorites-only active and a reading session open, editing
  favorites is refused visibly rather than silently changing the catalog.
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

The executed scripts belong in `../scripts/plugin-player/`.
