return (async () => {
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (win) try { win.close(); } catch (e) {}
  let remaining = true;
  for (let i = 0; i < 80; i++) {
    remaining = !!Services.wm.getMostRecentWindow('zotero:pref');
    if (!remaining) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return JSON.stringify({ remaining });
})()
