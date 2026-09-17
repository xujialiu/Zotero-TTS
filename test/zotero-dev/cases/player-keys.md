[Checklist index](../README.md) · [Scripts](../scripts/player-keys/README.md)

## The player keys and the tab they reach

Trusted presses through `nsITextInputProcessor` on the main chrome
window (rulebook step 9); `keydown()` = 1 means someone consumed the
key. Two fixtures open, A speaking.

Items 4.1–4.3, 4.5 and 4.6 of the checklist, under their original numbers.

### 4.1

1. **Speed keys.** Shift+C: `manager.speed` +0.05, the toast `N×` in the
   visible document for ~900 ms, memory `speed`, every language entry's
   `speed`, the log `spread read-aloud speed N to M reader(s)`, the idle
   tab's manager takes the speed without persisting. Shift+X back;
   Shift+Z to 1 (the toast reads `1.0×`; increments retain two decimals); the popup's own
   `setSpeed(1.7, true)` restores.

### 4.2

2. **Skips.** ArrowRight/ArrowLeft ±1 segment, Shift+Arrow to the
   previous/next `paragraphStart` anchor (derive from the controller's
   `_segments`), `view._readAloudPositionLocked` true after each — the
   flag is already true when a session starts, so force it false
   (`Components.utils.waiveXrays(view)._readAloudPositionLocked = false`)
   before each press, or the check proves nothing.

### 4.3

3. **Shift+Space.** `diagnostics.smartKey()` predicts each press:
   playing → `togglePaused (pause)`; paused → resume; idle with nothing
   stored → `startReadAloud (plain start)` (the press supplies the
   activation itself); idle with a stored position → item 5.3.

### 4.5

5. **Shift+O.** `diagnostics.playerOptions(true)` flips `expanded`; the
   real press flips it back, on the picked reader only. The diagnostic
   presses the button of **every** reader with a player, so with two
   players open the other one is left expanded — restore it by clicking
   its own Options button.

### 4.6

6. **Tab routing.** A paused in the background, B visible: the key goes
   to B, the toast in B's document. A speaking in the background, B
   visible: the key goes to A (speaking wins), the toast in the chrome
   window; both managers move under global speed.
