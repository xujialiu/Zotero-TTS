return (async () => {
  const p = Zotero.ZoteroTTSRun.params, root = String(p.root || '');
  const sourcePath = PathUtils.join(root, 'test', 'zotero-dev', 'scripts', 'voice-notice', 'notice-99-cleanup-and-restore.js');
  const source = await IOUtils.readUTF8(sourcePath);
  let result;
  try { result = await ((0, eval)(source)); }
  catch (e) {
    if (e instanceof SyntaxError && /return/.test(String(e.message))) result = await ((0, eval)(`(async () => {\n${source}\n})()`));
    else throw e;
  }
  const parsed = typeof result === 'string' ? JSON.parse(result) : result;
  Zotero.ZoteroTTSRun.state.cleanup = parsed;
  return JSON.stringify(parsed, null, 1);
})()
