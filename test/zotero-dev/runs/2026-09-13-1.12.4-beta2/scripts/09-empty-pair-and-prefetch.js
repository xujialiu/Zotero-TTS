(async () => {
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === 25431) reader = list[i];
  const manager = reader._internalReader._readAloudManager;
  const iface = manager._options.remoteInterface;
  const calls = [];
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  sandbox.fetch = function(input, init) {
    let text = null;
    try { if (typeof (init && init.body) === 'string') text = JSON.parse(init.body).text || null; } catch (e) {}
    calls.push({path:String(input).split('://').pop().replace(/^[^/]*/, ''), text});
    return Reflect.apply(originalFetch, sandbox, [input, init]);
  };
  let empty;
  try {
    empty = await iface.getAudio({text:'<>'}, {id:manager.selectedVoiceID});
    for (let i = 0; i < 60 && calls.length === 0; i++) await new Promise(resolve => setTimeout(resolve, 100));
  } finally { sandbox.fetch = originalFetch; }
  return JSON.stringify({empty:{audioBytes:empty.audio.size,timestamps:empty.timestamps},prefetchCalls:calls},null,1);
})()
