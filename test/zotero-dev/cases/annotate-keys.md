[Checklist index](../README.md) · [Scripts](../scripts/annotate-keys/README.md)

## Highlight and underline the sentence (issue #145, 1.15.1)

Zotero's own H and U annotate the sentence being read (reader.js
82110-82116). The plugin adds bindable keys for the same call:
`shortcuts.highlightSentence` (default `Shift+H`) and
`shortcuts.underlineSentence` (default `Shift+U`), taken only while a Read
Aloud session is open, playing or paused. The key runs
`manager.getSegmentToAnnotate()` and then
`reader._internalReader.addAnnotationFromReadAloudSegment(segment, type)`
(reader.js 84337), which creates the annotation at once and opens the
annotation popup; a second press while the popup is open retypes it
(`setReadAloudAnnotationType`, 84553).

Trusted presses through `nsITextInputProcessor` on the main chrome window;
`keydown()` = 1 means someone consumed the key. Fixture: any PDF with a
voice that plays (fixture A). The annotations the run creates are deleted
at the end; nothing else is touched.

1. **Defaults.** `extensions.zotero.zotero-tts.shortcuts.highlightSentence`
   reads `Shift+H` and `…underlineSentence` `Shift+U`; the settings pane's
   Keyboard shortcuts shows rows *Highlight sentence* and *Underline
   sentence* with those labels (`#ztts-key-highlightSentence`,
   `#ztts-key-underlineSentence`).
2. **Shift+H while playing.** Count the attachment's annotations
   (`Zotero.Items.get(id).getAnnotations()`), press Shift+H: `keydown()`
   1; within ~1 s one more annotation, `annotationType` `highlight`, its
   `annotationText` the text of the segment `getSegmentToAnnotate()`
   returned just before the press (the current sentence, or the previous
   one while under half and under 3 s into the current);
   `_internalReader._state.readAloudState.annotationPopup` non-null and
   naming that annotation's id. Playback keeps going (`paused` false).
3. **Shift+U with the popup open.** The same annotation's type becomes
   `underline`; no new annotation.
4. **Shift+U while paused, popup closed** (close it first: Escape, or
   `_updateReadAloudUIState({annotationPopup: null})`). One more
   annotation, `annotationType` `underline`.
5. **No session.** With the player closed (`manager.active` false),
   Shift+H: `keydown()` 0 from the plugin (the key falls through), no new
   annotation.
6. **Cleanup.** Erase every annotation the run created
   (`item.eraseTx()`), close the popup, close the player if the run
   opened it.
