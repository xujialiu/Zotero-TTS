[Checklist index](../README.md) · [Scripts](../scripts/shortcut-recorder/README.md)

## The shortcut recorder

Trusted presses through `nsITextInputProcessor` (rulebook step 9): the
recording on the settings window, the new key on the main chrome window
with a fixture reader open; `keydown()` = 1 means someone consumed the
key.

Item 4.8 of the checklist, under its original number.

### 4.8

8. **The recorder.** Click a shortcut field → `Press the new keys… (Esc
   cancels)`; Shift+V through the TIP on the pref window → the field and
   the pref read `Shift+V`, the new key fires on a reader and the old
   one does not; a bare letter is rejected with the modifier message;
   Escape cancels. Restore the pref; the row repaints from its own
   handlers only.
