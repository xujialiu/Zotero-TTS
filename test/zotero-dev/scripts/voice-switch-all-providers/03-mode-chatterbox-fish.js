return (() => {
  if (!Zotero.__zttsAllHandoff) throw new Error('baseline script has not run');
  Zotero.__zttsAllHandoff.requestedMode = 'chatterbox-fish';
  return JSON.stringify({ mode: Zotero.__zttsAllHandoff.requestedMode });
})()
