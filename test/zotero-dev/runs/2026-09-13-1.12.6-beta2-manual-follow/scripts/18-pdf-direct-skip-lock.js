return (async () => {
  const root = Zotero.__ztts100, reader = root?.pdf?.reader;
  if (!reader) throw new Error('PDF reader is missing');
  const internal = reader._internalReader, manager = internal?._readAloudManager, view = internal?._primaryView, rw = view?._iframeWindow, container = rw?.document?.getElementById('viewerContainer');
  if (!manager || !rw || !container) throw new Error('PDF direct recovery state is missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const snap = label => { const i = (Zotero.Reader._readers ?? []).indexOf(reader), d = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll())[i] ?? null; return { label, position: manager?._controller?._position ?? null, active: !!manager?.active, paused: !!manager?.paused, scrollTop: container.scrollTop, following: d?.following ?? null, interacting: d?.interacting ?? null, reason: d?.reason ?? null, last: d?.last ?? null }; };
  Zotero_Tabs.select(reader.tabID); reader.focus?.(); rw.focus?.();
  const before = snap('before');
  let skipError = null;
  try { manager.skipAhead('sentence', false); } catch (e) { skipError = String(e); }
  await sleep(550);
  const afterSkip = snap('after-manager-skip');
  let lockError = null;
  try { internal._lockPositionToReadAloud(); } catch (e) { lockError = String(e); }
  await sleep(550);
  const afterLock = snap('after-explicit-lock');
  return JSON.stringify({ before, skipError, afterSkip, lockError, afterLock });
})()
