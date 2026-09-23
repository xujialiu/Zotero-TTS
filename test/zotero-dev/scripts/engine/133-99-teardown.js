// Teardown (playback.md item 3.26, folded into this kit's own run): close
// both fixture players and tabs, erase both fixture items, confirm the
// reading-position rows are back to baseline.
// params: none. state: reads fixtures.A, fixtures.B, posBeforeRows; writes
// teardown.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: 'teardown' };
  const ids = [S.fixtures.A.itemID, S.fixtures.B.itemID];

  for (const itemID of ids) {
    let r = null;
    for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
    if (r) {
      try { r._internalReader.toggleReadAloudPopup(false); } catch (e) {}
      await sleep(200);
      try { r._window.Zotero_Tabs.close(r.tabID); } catch (e) {}
    }
  }
  await sleep(500);
  let left = 0;
  for (const itemID of ids) for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) left++;
  out.readersLeftOpen = left;

  for (const itemID of ids) {
    try {
      const item = Zotero.Items.get(itemID);
      if (item) await item.eraseTx();
    } catch (e) {
      out.eraseError = (out.eraseError || []).concat(String(e));
    }
  }

  const posAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  out.posAfterRows = posAfter && posAfter.database ? posAfter.database.rows : null;
  out.posBeforeRows = S.posBeforeRows;
  out.rowsBackToBaseline = out.posAfterRows === out.posBeforeRows;

  S.teardown = out;
  return JSON.stringify(out, null, 1);
})();
