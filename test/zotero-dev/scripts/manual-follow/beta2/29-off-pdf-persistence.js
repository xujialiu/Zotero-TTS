return (async () => {
  const root = Zotero.__ztts100, reader = root?.pdf?.reader;
  if (!reader) throw new Error('PDF reader is missing');
  const internal = reader._internalReader, manager = internal?._readAloudManager, view = internal?._primaryView, rw = view?.iframeWindow, host = reader._window, container = rw?.document?.getElementById('viewerContainer');
  if (!manager || !view || !rw || !host || !container) throw new Error('PDF state is not ready');
  const keep = 'extensions.zotero.zotero-tts.readAloud.keepFollowingWhileVisible', mode = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const originalKeep = { value: Services.prefs.getBoolPref(keep, true), user: Services.prefs.prefHasUserValue(keep) }, originalMode = { value: Services.prefs.getStringPref(mode, 'sentence'), user: Services.prefs.prefHasUserValue(mode) }, sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const index = () => (Zotero.Reader._readers ?? []).indexOf(reader), diagnostic = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll())[index()] ?? null;
  const snap = label => { const d = diagnostic(); return { label, at: Date.now(), position: manager?._controller?._position ?? null, scrollTop: container.scrollTop, following: d?.following ?? null, interacting: d?.interacting ?? null, keepFollowingWhileVisible: d?.keepFollowingWhileVisible ?? null, reason: d?.reason ?? null, last: d?.last ?? null }; };
  const restoreMode = () => { const defaults = Services.prefs.getDefaultBranch(''); const dv = defaults.getStringPref(mode, 'sentence'); if (originalMode.user && originalMode.value === dv) { defaults.setStringPref(mode, '__ztts100_temporary_default__'); Services.prefs.setStringPref(mode, originalMode.value); defaults.setStringPref(mode, dv); } else if (originalMode.user) Services.prefs.setStringPref(mode, originalMode.value); else if (Services.prefs.prefHasUserValue(mode)) Services.prefs.clearUserPref(mode); };
  Zotero_Tabs.select(reader.tabID); reader.focus?.(); rw.focus?.();
  let output = null;
  try {
    Services.prefs.setBoolPref(keep, false); Services.prefs.setStringPref(mode, 'sentence'); try { manager.repositionTo(0); } catch (e) {} await sleep(450); try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {} container.scrollTo(0, 0); await sleep(180);
    const setup = snap('setup-off');
    const events = [], listener = e => events.push({ trusted: !!e.isTrusted, deltaY: e.deltaY, target: String(e.target?.localName ?? '') }); container.addEventListener('wheel', listener, true); const before = snap('wheel-before'); let wheelError = null; try { const frame = rw.frameElement.getBoundingClientRect(); host.windowUtils.sendWheelEvent(Math.round(frame.x + 100), Math.round(frame.y + 500), 0, 220, 0, 0, 0, 0, 0, 0); } catch (e) { wheelError = String(e); } const immediate = snap('wheel-immediate'); container.scrollTo(0, 20); const afterMove = snap('wheel-after-visible-move'); await sleep(300); const settled = snap('wheel-settled'); container.removeEventListener('wheel', listener, true);
    let playError = null; try { manager.play(); } catch (e) { playError = String(e); } await sleep(350); const directResume = snap('direct-resume'); try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {}
    let nativeError = null; try { internal.toggleReadAloudPaused(false); } catch (e) { nativeError = String(e); } await sleep(350); const nativeResume = snap('native-resume'); try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {}
    container.scrollTo(0, 0); await sleep(150); const scrollBack = snap('scroll-back');
    try { manager.skipAhead('sentence', false); } catch (e) {} await sleep(450); const laterSentence = snap('later-sentence');
    Services.prefs.setStringPref(mode, 'outside'); await sleep(180); const afterModeOutside = snap('mode-outside'); Services.prefs.setStringPref(mode, 'sentence'); await sleep(180); const afterModeSentence = snap('mode-sentence');
    let lockError = null; try { internal._lockPositionToReadAloud(); } catch (e) { lockError = String(e); } await sleep(450); const explicitRestore = snap('explicit-restore');
    output = { setup, events, wheelError, before, immediate, afterMove, settled, playError, directResume, nativeError, nativeResume, scrollBack, laterSentence, afterModeOutside, afterModeSentence, lockError, explicitRestore };
  } finally { try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {} try { container.scrollTo(0, 0); } catch (e) {} if (originalKeep.user) Services.prefs.setBoolPref(keep, originalKeep.value); else if (Services.prefs.prefHasUserValue(keep)) Services.prefs.clearUserPref(keep); restoreMode(); await sleep(180); }
  return JSON.stringify({ output, restored: { keep: { value: Services.prefs.getBoolPref(keep, true), user: Services.prefs.prefHasUserValue(keep) }, mode: { value: Services.prefs.getStringPref(mode, '<none>'), user: Services.prefs.prefHasUserValue(mode) } }, final: snap('final') });
})()
