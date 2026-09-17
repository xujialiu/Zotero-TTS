return (async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const root = String(p.root || '');
  const path = (...parts) => PathUtils.join(root, ...parts);
  const evaluate = async sourcePath => {
    const source = await IOUtils.readUTF8(sourcePath);
    try { return await ((0, eval)(source)); }
    catch (e) {
      if (e instanceof SyntaxError && /return/.test(String(e.message))) {
        return await ((0, eval)(`(async () => {\n${source}\n})()`));
      }
      throw e;
    }
  };
  const baseline = await evaluate(path('test', 'zotero-dev', 'scripts', 'voice-notice', 'notice-01-baseline-and-fixtures.js'));
  const base = typeof baseline === 'string' ? JSON.parse(baseline) : baseline;
  if (base?.status !== 'PASS') throw new Error('reused baseline did not pass');
  const transport = await evaluate(path('test', 'zotero-dev', 'scripts', 'voice-notice', 'notice-02-open-native-transport.js'));
  const tr = typeof transport === 'string' ? JSON.parse(transport) : transport;
  if (tr?.status !== 'PASS') throw new Error('reused native transport did not pass');
  return JSON.stringify({ status: 'PASS', baseline: base, transport: tr }, null, 1);
})()
