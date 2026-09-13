return (async () => {
  const root = Zotero.__ztts100;
  const slot = root?.epub;
  const reader = slot?.reader;
  if (!reader) throw new Error('EPUB reader is missing');
  let popupError = null;
  let closeError = null;
  try { reader._internalReader?.toggleReadAloudPopup(false); } catch (e) { popupError = String(e); }
  try { reader.close?.(); } catch (e) { closeError = String(e); }
  for (let i = 0; i < 160; i++) {
    if (!(Zotero.Reader._readers ?? []).some(r => r?.itemID === slot.itemID)) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const remaining = (Zotero.Reader._readers ?? []).filter(r => r?.itemID === slot.itemID).length;
  slot.reader = null;
  return JSON.stringify({ fixture: 'epub', popupError, closeError, remaining });
})()
