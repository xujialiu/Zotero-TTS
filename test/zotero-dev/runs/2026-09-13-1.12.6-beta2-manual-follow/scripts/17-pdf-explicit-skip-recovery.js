return (async () => {
  const root = Zotero.__ztts100, reader = root?.pdf?.reader;
  if (!reader) throw new Error('PDF reader is missing');
  const internal = reader._internalReader, manager = internal?._readAloudManager, view = internal?._primaryView, rw = view?._iframeWindow, container = rw?.document?.getElementById('viewerContainer');
  if (!manager || !rw || !container) throw new Error('PDF recovery state is missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const snap = label => { const i = (Zotero.Reader._readers ?? []).indexOf(reader), d = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll())[i] ?? null; return { label, position: manager?._controller?._position ?? null, active: !!manager?.active, paused: !!manager?.paused, scrollTop: container.scrollTop, following: d?.following ?? null, interacting: d?.interacting ?? null, reason: d?.reason ?? null, last: d?.last ?? null }; };
  Zotero_Tabs.select(reader.tabID); reader.focus?.(); rw.focus?.();
  const before = snap('before');
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor), K = rw.KeyboardEvent, ev = (key, code, keyCode, shift = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey: shift });
  tip.beginInputTransactionForTests(rw);
  const skipRet = [tip.keydown(ev('ArrowRight', 'ArrowRight', 39)), tip.keyup(ev('ArrowRight', 'ArrowRight', 39))];
  await sleep(550);
  const afterSkip = snap('after-arrow-right');
  tip.beginInputTransactionForTests(rw);
  const returnRet = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev('Enter', 'Enter', 13, true)), tip.keyup(ev('Enter', 'Enter', 13, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
  await sleep(550);
  const afterReturn = snap('after-shift-enter');
  return JSON.stringify({ before, skipRet, afterSkip, returnRet, afterReturn });
})()
