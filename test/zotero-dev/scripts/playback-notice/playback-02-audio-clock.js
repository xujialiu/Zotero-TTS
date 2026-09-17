return (async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const root = String(p.root || '');
  const sourcePath = PathUtils.join(root, 'test', 'zotero-dev', 'scripts', 'voice-notice', 'notice-03-audio-clock.js');
  const source = await IOUtils.readUTF8(sourcePath);
  let result;
  try { result = await ((0, eval)(source)); }
  catch (e) {
    if (e instanceof SyntaxError && /return/.test(String(e.message))) result = await ((0, eval)(`(async () => {\n${source}\n})()`));
    else throw e;
  }
  const parsed = typeof result === 'string' ? JSON.parse(result) : result;
  Zotero.ZoteroTTSRun.state.audioClock = parsed;
  return JSON.stringify(parsed, null, 1);
})()
