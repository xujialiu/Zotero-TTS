# Player A/M follows the current document (issue #117)

[Checklist index](../README.md)

Run baseline section 0 and cleanup section 7. Use disposable PDF and EPUB
fixtures, muted output, both placement modes and scrolled/paginated EPUB.
Retain exact preference values and user-value flags, native voice memory,
owner readers and positions. Never start or resume an owner document.

The sandbox source is `diagnostics.pluginPlayer().readers[].state.automatic`.
The visible `.mode` text, tooltip, `aria-label` and `aria-pressed` must agree
with it in bottom, top and floating layouts (the normal polling interval is
250 ms). Compare to `diagnostics.autoScroll()` and `diagnostics.returnKey()`; record the fixture identity, not just the
first reader in an array. The retired `autoScrollEnabled` preference is not
an oracle and an old false value must not suppress following.

## 1. Manual browsing and recovery

- Start a fixture: A. Pause without navigating: still A and no page movement.
- Move the current sentence manually with trusted input: M immediately,
  including when some/all of the sentence is visible. After the gesture
  settles, same-sentence and word updates remain M with no automatic target.
- Move the sentence completely out, then partly back: M throughout. A later
  offscreen sentence stays M; a later visible sentence after input settles
  restores A. Correlate with following/protection/visibility diagnostics.
- Repeat with manual browsing while paused: M, no automatic movement or
  automatic recovery until an explicit action below.
- With keep-following disabled, manual browsing remains M through later
  visible sentences. Explicit recovery still works.

## 2. Explicit manual mode and isolation

- Click A: M. Later visible sentences, settings/layout changes and focus
  changes do not restore following. Clicking A also cancels any outstanding
  visibility-recovery task from a prior gesture.
- Open a second disposable reader. Select M in the first; the second retains
  its state. Neither operation writes the old global preference. Test both
  PDF and EPUB, switching tabs without starting simultaneous real playback.
- Close/reopen the fixture player: a new session starts following. No M choice
  is persisted into another document or a new session.

## 3. Explicit recovery

From explicit M and from gesture-induced M, verify each separately:

- Click M; Shift+Enter; previous/next sentence; previous/next paragraph.
- Each returns to the spoken sentence and displays A. While paused, each
  retains manager.paused=true and positions immediately without awaiting
  a later audio update. Paginated EPUB locates the page; document boundaries
  may limit centering.
- Resume with the real player button and the playback shortcut: A, following
  restored and sentence centered even if offscreen. Pause alone preserves
  whichever A/M state existed before it.
- Ordinary playback retains sentence/word clipping correction from #83 and
  gesture protection from #107. An automatic scroll does not switch to M.

## 4. Cleanup and evidence limits

Close fixture readers before erasing attachments. Restore prefs/user flags,
voice memory, volume, sync switches and original tab; verify new error logs
and absence of duplicate/stale player nodes after teardown. Do not restore
an owner player by starting it.

Report actual trusted key/button execution separately from injected state
progression and positioned viewports. Natural audio progression and perceived
scroll smoothness require actual observation; a suspended AudioContext does
not prove them. Unit tests cover pending gesture cancellation and same-process
reader isolation; old run PASS rows are not current verification.

Retain successfully executed scripts under `../scripts/player-following/`.
