return (async () => {
  const report = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  const failed = (report.steps || []).filter(step => !step.ok);
  const result = {
    status: report.version === '1.12.12-beta4' && failed.length === 0 && (!report.failed || report.failed.length === 0) ? 'PASS' : 'FAIL',
    version: report.version,
    failed: report.failed || [],
    failedSteps: failed.map(step => step.name),
  };
  return JSON.stringify(result, null, 1);
})()
