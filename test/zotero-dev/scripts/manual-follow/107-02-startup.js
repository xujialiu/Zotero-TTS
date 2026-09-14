return (async () => {
  let startup = null;
  let error = null;
  try { startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup()); } catch (e) { error = String(e); }
  return JSON.stringify({ startup, error });
})()
