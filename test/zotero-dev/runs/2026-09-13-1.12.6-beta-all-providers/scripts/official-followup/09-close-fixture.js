return (async () => {
  const state = Zotero.__zttsOfficialFollowup, fixture = state && state.fixture, sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const out = { status: 'PASS', errors: [], readerClosed: true, itemErased: false };
  if (!state || !fixture || !fixture.itemID) { out.status = 'NOT TESTABLE'; out.errors.push('fixture missing'); return JSON.stringify(out, null, 1); }
  let reader = null; const list = Zotero.Reader._readers || [];
  for (let i = 0; i < list.length; i++) if (list[i] && list[i].itemID === fixture.itemID) { reader = list[i]; break; }
  if (reader) {
    try { const internal = reader._internalReader; if (internal && internal._state && internal._state.readAloudState && internal._state.readAloudState.popupOpen) internal.toggleReadAloudPopup(false); } catch (e) { out.errors.push('popup: ' + String(e)); }
    try { await Promise.resolve(reader.close && reader.close()); } catch (e) { out.errors.push('close: ' + String(e)); }
    for (let i = 0; i < 60; i++) { let left = false; const now = Zotero.Reader._readers || []; for (let j = 0; j < now.length; j++) if (now[j] && now[j].itemID === fixture.itemID) { left = true; break; } if (!left) break; await sleep(100); }
  }
  const after = Zotero.Reader._readers || [];
  for (let i = 0; i < after.length; i++) if (after[i] && after[i].itemID === fixture.itemID) out.readerClosed = false;
  try { const item = Zotero.Items.get(fixture.itemID); if (item) { await item.eraseTx(); out.itemErased = true; } else out.itemErased = true; } catch (e) { out.errors.push('erase: ' + String(e)); }
  state.fixtureCleanup = { readerClosed: out.readerClosed, itemErased: out.itemErased, itemID: fixture.itemID, key: fixture.key, title: fixture.title };
  out.status = out.errors.length ? 'FAIL' : (out.readerClosed && out.itemErased ? 'PASS' : 'FAIL');
  return JSON.stringify(out, null, 1);
})()
