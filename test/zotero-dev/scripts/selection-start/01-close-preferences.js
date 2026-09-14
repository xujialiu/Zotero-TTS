return (async () => {
  const before = !!Services.wm.getMostRecentWindow('zotero:pref');
  let error = null;
  try { Services.wm.getMostRecentWindow('zotero:pref')?.close(); } catch (e) { error = String(e); }
  for (let i = 0; i < 60 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await new Promise(r => setTimeout(r, 50));
  return JSON.stringify({ before, closed: !Services.wm.getMostRecentWindow('zotero:pref'), error });
})()
