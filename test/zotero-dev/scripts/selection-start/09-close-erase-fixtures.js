return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const root = state.fixtures;
  const out = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  for (const kind of ['pdf', 'epub']) {
    const slot = root?.[kind];
    let reader = slot?.reader || null;
    if (!reader) for (const open of Zotero.Reader._readers || []) if (open?.itemID === slot?.itemID) { reader = open; break; }
    let popupError = null;
    let closeError = null;
    if (reader) {
      try { reader._internalReader?.toggleReadAloudPopup(false); } catch (e) { popupError = String(e); }
      try { reader.close?.(); } catch (e) { closeError = String(e); }
      for (let i = 0; i < 120; i++) {
        let present = false;
        for (const open of Zotero.Reader._readers || []) if (open?.itemID === slot.itemID) { present = true; break; }
        if (!present) break;
        await sleep(50);
      }
    }
    let left = 0;
    for (const open of Zotero.Reader._readers || []) if (open?.itemID === slot?.itemID) left++;
    let eraseError = null;
    try { const item = slot?.itemID ? Zotero.Items.get(slot.itemID) : null; if (item) await item.eraseTx(); } catch (e) { eraseError = String(e); }
    out.push({ kind, itemID: slot?.itemID ?? null, popupError, closeError, left, erased: !!slot?.itemID && !Zotero.Items.get(slot.itemID), eraseError });
    if (slot) slot.reader = null;
  }
  await sleep(600);
  return JSON.stringify({ out });
})()
