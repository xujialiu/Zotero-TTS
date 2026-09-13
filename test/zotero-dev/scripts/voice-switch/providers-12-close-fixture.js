return (async () => {
  const state = Zotero.__zttsAllHandoff, fixture = state && state.fixture, sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const out = { errors: [], readerClosed: false, itemErased: false };
  if (!fixture || !fixture.itemID) { out.readerClosed = true; out.itemErased = true; out.absent = true; return JSON.stringify(out, null, 1); }
  let reader = null;
  const list = Zotero.Reader._readers || [];
  for (let i = 0; i < list.length; i++) if (list[i] && list[i].itemID === fixture.itemID) { reader = list[i]; break; }
  if (reader) {
    try { const internal = reader._internalReader; if (internal && internal._state && internal._state.readAloudState && internal._state.readAloudState.popupOpen) internal.toggleReadAloudPopup(false); } catch (e) { out.errors.push('popup: ' + String(e)); }
    try { await Promise.resolve(reader.close && reader.close()); } catch (e) { out.errors.push('close: ' + String(e)); }
    for (let i = 0; i < 60; i++) { let left = false; const now = Zotero.Reader._readers || []; for (let j = 0; j < now.length; j++) if (now[j] && now[j].itemID === fixture.itemID) { left = true; break; } if (!left) break; await sleep(100); }
  }
  out.readerClosed = true;
  const after = Zotero.Reader._readers || [];
  for (let i = 0; i < after.length; i++) if (after[i] && after[i].itemID === fixture.itemID) out.readerClosed = false;
  try { const item = Zotero.Items.get(fixture.itemID); if (item) { await item.eraseTx(); out.itemErased = true; } else out.itemErased = true; } catch (e) { out.errors.push('erase: ' + String(e)); }
  state.fixture = null; state.run = null;
  return JSON.stringify(out, null, 1);
})()
