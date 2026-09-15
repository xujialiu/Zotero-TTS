// Item 4's "Paused, the same flip repaints the same way with paused true
// throughout" -- fixture A already paused at the end of 06-word-switch.js.
return (async () => {
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  const d = win.document;
  const wordCb = d.getElementById('ztts-highlight-word');
  const setChecked = (cb, value) => {
    cb.checked = value;
    cb.dispatchEvent(new win.Event('command', { bubbles: true }));
  };
  const fixtures = Zotero.ZoteroTTSRun.state.fixtures;
  const readerA = (Zotero.Reader._readers || []).find((r) => r.itemID === fixtures.a.itemID);
  const mA = readerA._internalReader._readAloudManager;
  const viewA = readerA._internalReader._primaryView;

  const snap = () => ({
    paused: !!mA.paused,
    active: !!mA.active,
    position: mA._controller?._position ?? null,
    rectWidths: (viewA._readAloudHighlightedPosition?.rects ?? []).map((r) => Math.round((r[2] - r[0]) * 10) / 10),
    switches: JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels()).switches,
  });

  const before = snap();
  setChecked(wordCb, false);
  const off = snap();
  setChecked(wordCb, true);
  const on = snap();

  return JSON.stringify({ before, off, on }, null, 1);
})();
