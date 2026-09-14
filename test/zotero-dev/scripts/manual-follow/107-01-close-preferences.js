return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const window = Services.wm.getMostRecentWindow('zotero:pref');
  if (!window) return JSON.stringify({ present: false, closed: true });
  let error = null;
  try { window.close(); } catch (e) { error = String(e); }
  for (let i = 0; i < 100 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(50);
  return JSON.stringify({ present: true, closed: !Services.wm.getMostRecentWindow('zotero:pref'), error });
})()
