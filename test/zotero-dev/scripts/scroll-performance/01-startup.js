return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  let startup;
  try { startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup()); } catch (e) { throw new Error('startup diagnostic failed: ' + String(e)); }
  if (!startup || (startup.failed || []).length) throw new Error('startup diagnostic has failed steps: ' + JSON.stringify(startup));
  state.startup = startup;
  return JSON.stringify({ version: startup.version, steps: Object.keys(startup.steps || {}).length, failed: startup.failed }, null, 1);
})()
