return (async () => {
  const root = Zotero.__ztts100, reader = root?.epub?.reader;
  if (!reader) throw new Error('EPUB reader is missing');
  const internal = reader._internalReader, manager = internal?._readAloudManager, view = internal?._primaryView, iw = view?.iframeWindow, rw = reader._iframeWindow;
  if (!manager || !view || !iw || !rw) throw new Error('EPUB paginated view is not ready');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const index = () => (Zotero.Reader._readers ?? []).indexOf(reader), diagnostic = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll())[index()] ?? null;
  const snap = label => { const d = diagnostic(); return { label, at: Date.now(), offset: view.flow?._offsetLeft ?? null, section: view.flow?._currentSectionIndex ?? null, position: manager?._controller?._position ?? null, following: d?.following ?? null, interacting: d?.interacting ?? null, reason: d?.reason ?? null, last: d?.last ?? null }; };
  const seen = [], listener = e => seen.push({ key: String(e.key), code: String(e.code), keyCode: e.keyCode, trusted: !!e.isTrusted, target: String(e.target?.localName ?? ''), defaultPrevented: !!e.defaultPrevented });
  iw.addEventListener('keydown', listener, true); iw.document.addEventListener('keydown', listener, true);
  Zotero_Tabs.select(reader.tabID); reader.focus?.(); rw.focus?.();
  const before = snap('before');
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor), K = rw.KeyboardEvent, make = () => new K('', { key: 'PageDown', code: 'PageDown', keyCode: 34, bubbles: true, cancelable: true });
  tip.beginInputTransactionForTests(iw);
  const ret = [tip.keydown(make()), tip.keyup(make())];
  const immediate = snap('immediate'); await sleep(120); const held = snap('120ms'); await sleep(350); const settled = snap('470ms');
  iw.removeEventListener('keydown', listener, true); iw.document.removeEventListener('keydown', listener, true);
  return JSON.stringify({ ret, seen, before, immediate, held, settled, offsetDelta: (settled.offset ?? 0) - (before.offset ?? 0) });
})()
