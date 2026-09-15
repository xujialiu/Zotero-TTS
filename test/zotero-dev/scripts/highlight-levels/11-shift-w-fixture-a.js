// Item 9 (highlight-levels) and word-highlight-key.md 4.10's PDF/paused/
// sentence-off/sentence-on/hand-edited sub-checks, run once and reported
// under both. Trusted Shift+W on the main chrome window (as 4.10 says),
// fixture A's controller already approved by a trusted gesture
// (03-audio-probe.js), so resume/pause between presses is a plain call.
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const win = Zotero.getMainWindow ? Zotero.getMainWindow() : Services.wm.getMostRecentWindow('navigator:browser');
  const fixtures = Zotero.ZoteroTTSRun.state.fixtures;
  const readerA = (Zotero.Reader._readers || []).find((r) => r.itemID === fixtures.a.itemID);
  const mA = readerA._internalReader._readAloudManager;
  const viewA = readerA._internalReader._primaryView;
  win.Zotero_Tabs.select(readerA.tabID);
  readerA.focus?.();
  win.focus();

  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  const ev = (key, code, keyCode, shiftKey = false) => new win.KeyboardEvent('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
  function pressShiftW() {
    tip.beginInputTransactionForTests(win);
    const ret = [
      tip.keydown(ev('Shift', 'ShiftLeft', 16)),
      tip.keydown(ev('W', 'KeyW', 87, true)),
      tip.keyup(ev('W', 'KeyW', 87, true)),
      tip.keyup(ev('Shift', 'ShiftLeft', 16)),
    ];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return ret;
  }
  const toastText = () => readerA._iframeWindow.document.getElementById('ztts-speed-toast')?.textContent ?? null;
  const toastOpacity = () => readerA._iframeWindow.document.getElementById('ztts-speed-toast')?.style?.opacity ?? null;
  const levels = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels());
  const snap = () => ({
    switches: levels().switches,
    zoteroPref: Zotero.Prefs.get('reader.readAloud.highlightGranularity'),
    readersAllSame: new Set(levels().readers.map((r) => r.state)).size === 1 ? levels().readers[0].state : 'MIXED',
    rectWidths: (viewA._readAloudHighlightedPosition?.rects ?? []).map((r) => Math.round((r[2] - r[0]) * 10) / 10),
    position: mA._controller?._position ?? null,
    controllerRef: mA._controller ?? null,
    paused: !!mA.paused,
  });

  // Ensure clean start: both on, resume for the live PDF-playing checks
  Zotero.Prefs.set('zotero-tts.highlight.sentence', true);
  Zotero.Prefs.set('zotero-tts.highlight.word', true);
  if (mA.active && mA.paused) mA.togglePaused();
  await sleep(250);

  const beforePress1 = snap();
  const ret1 = pressShiftW();
  const rightAfterPress1 = snap();
  const controllerSame1 = beforePress1.controllerRef === rightAfterPress1.controllerRef;
  delete beforePress1.controllerRef;
  delete rightAfterPress1.controllerRef;
  const toast1 = { text: toastText(), opacityAtPress: toastOpacity() };
  await sleep(500);
  const toast1Mid = { opacity: toastOpacity() };
  await sleep(550); // ~1050ms since press
  const toast1Late = { opacity: toastOpacity() };

  const press2Before = snap();
  const ret2 = pressShiftW();
  const press2After = snap();
  const controllerSame2 = press2Before.controllerRef === press2After.controllerRef;
  delete press2Before.controllerRef;
  delete press2After.controllerRef;
  const toast2 = toastText();

  // Re-pause A for the paused-variant press
  if (mA.active && !mA.paused) mA.togglePaused();
  await sleep(150);
  const pausedBefore = snap();
  const retPaused = pressShiftW();
  const pausedAfter = snap();
  const stayedPausedThroughout = pausedBefore.paused && pausedAfter.paused;
  delete pausedBefore.controllerRef;
  delete pausedAfter.controllerRef;
  // Undo (back to both on) for the next scenarios, still paused
  pressShiftW();
  await sleep(100);

  // --- Sentence off, Word on -> press -> {sentence:true, word:false} ---
  Zotero.Prefs.set('zotero-tts.highlight.sentence', false);
  Zotero.Prefs.set('zotero-tts.highlight.word', true);
  const sentOffBefore = levels().switches;
  const retSentOff = pressShiftW();
  const sentOffAfter = { switches: levels().switches, toast: toastText() };

  // --- Sentence on, Word off -> press -> both on ---
  Zotero.Prefs.set('zotero-tts.highlight.sentence', true);
  Zotero.Prefs.set('zotero-tts.highlight.word', false);
  const wordOffBefore = levels().switches;
  const retWordOff = pressShiftW();
  const wordOffAfter = { switches: levels().switches, toast: toastText() };

  // The "hand-edited, both prefs false" press is NOT tested here: the
  // settings window is open on this same script's Highlight pane, and
  // highlight-rows.ts's own watcher (resident once the pane has loaded,
  // regardless of which pane is currently shown -- driving doc §1) writes
  // sentence back to true the moment both raw prefs go false, before the
  // press ever runs (found live: bothFalseBefore read {sentence:true,
  // word:false} instead of {false,false}, silently duplicating the
  // "Sentence on, Word off" case above). 12-shift-w-hand-edited.js does
  // this press correctly, with the settings window closed first.

  // Restore both true (the run's steady state)
  Zotero.Prefs.set('zotero-tts.highlight.sentence', true);
  Zotero.Prefs.set('zotero-tts.highlight.word', true);
  await sleep(100);
  const finalState = { switches: levels().switches, zoteroPref: Zotero.Prefs.get('reader.readAloud.highlightGranularity'), paused: !!mA.paused, active: !!mA.active };

  return JSON.stringify(
    {
      beforePress1, ret1, rightAfterPress1, controllerSame1, toast1, toast1Mid, toast1Late,
      press2Before, ret2, press2After, controllerSame2, toast2,
      pausedBefore, retPaused, pausedAfter, stayedPausedThroughout,
      sentOffBefore, retSentOff, sentOffAfter,
      wordOffBefore, retWordOff, wordOffAfter,
      finalState,
    },
    null,
    1,
  );
})();
