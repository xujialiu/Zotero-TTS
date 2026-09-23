// Item 5: the divider faces the document. Top bar: the player's root has a
// 1px border-bottom and no border-top. Bottom bar: a 1px border-top (and
// no border-bottom, .layout-A's own rule never added one).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(60); } return test(); };
  const state = Zotero.ZoteroTTSRun.state;
  const host = Zotero.getMainWindow();
  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';
  const itemID = state.fixtures.pdf.itemID;
  const reader = (Zotero.Reader._readers || []).find((r) => r.itemID === itemID);
  host.Zotero_Tabs.select(reader.tabID);
  await sleep(150);
  const doc = reader._iframeWindow.document;
  const setLayout = async (layout) => { Zotero.ZoteroTTS.pluginPlayer.setLayout(layout); await wait(() => Services.prefs.getStringPref(layoutPref, '') === layout ? true : null, 5000); await sleep(150); };
  const borders = () => {
    const frame = doc.querySelector('#ztts-player-frame');
    const cdoc = frame?.contentDocument;
    const player = cdoc?.querySelector('.player');
    if (!player) return null;
    const cs = frame.contentWindow.getComputedStyle(player);
    return { className: player.className, borderTopWidth: cs.borderTopWidth, borderBottomWidth: cs.borderBottomWidth };
  };

  await setLayout('top');
  const top = borders();
  await setLayout('A');
  const bottom = borders();
  await setLayout('top');

  const checks = {
    topHasBottomBorder: top?.borderBottomWidth === '1px',
    topHasNoTopBorder: top?.borderTopWidth === '0px',
    bottomHasTopBorder: bottom?.borderTopWidth === '1px',
    bottomHasNoBottomBorder: bottom?.borderBottomWidth === '0px',
  };
  return JSON.stringify({ top, bottom, checks }, null, 1);
})();
