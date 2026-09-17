return (() => {
  const raw = Zotero.ZoteroTTS.diagnostics.startup();
  const d = JSON.parse(raw);
  const ok = d.version === '1.12.12-beta5' && Array.isArray(d.steps)
    && d.steps.every(row => row.ok === true) && Array.isArray(d.failed) && d.failed.length === 0;
  return JSON.stringify({ status: ok ? 'PASS' : 'FAIL', version: d.version, steps: d.steps, failed: d.failed }, null, 1);
})()
