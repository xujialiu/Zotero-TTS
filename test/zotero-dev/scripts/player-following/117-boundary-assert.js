return (async () => {
  const report = Zotero.ZoteroTTSRun.state.boundaryDiagnostic;
  if (!report?.preconditions?.allReady) throw new Error('boundary diagnostic had no valid visible fixture precondition');
  const failures = [];
  for (const row of report.rows || []) {
    if (row.status !== 'PASS') failures.push({ kind: row.kind, keep: row.keep, status: row.status });
    if (row.kind !== 'pdf') continue;
    if (row.fixed) {
      if (row.fixed.fixedPlaying?.following !== true || row.fixed.fixedPlaying?.visibleFragments < 1 || row.fixed.fixedPlaying?.pending !== false) failures.push({ kind: row.kind, keep: row.keep, path: 'fixed', state: { following: row.fixed.fixedPlaying?.following, visibleFragments: row.fixed.fixedPlaying?.visibleFragments, pending: row.fixed.fixedPlaying?.pending } });
      if (row.gated?.start?.following !== true || row.gated.start.visibleFragments < 1 || row.gated.trace?.firstRecoveryAt === null) failures.push({ kind: row.kind, keep: row.keep, path: 'gated', state: { following: row.gated?.start?.following, visibleFragments: row.gated?.start?.visibleFragments, firstRecoveryAt: row.gated?.trace?.firstRecoveryAt } });
    } else {
      if (row.readyLater?.ok !== true || row.fixed300?.following !== true || row.fixed300?.visibilityPaused !== false || row.fixed300?.visibleFragments < 1 || row.trace?.firstRecoveryAt === null) failures.push({ kind: row.kind, path: 'later-visible', state: { ready: row.readyLater?.ok, following: row.fixed300?.following, visibilityPaused: row.fixed300?.visibilityPaused, visibleFragments: row.fixed300?.visibleFragments, firstRecoveryAt: row.trace?.firstRecoveryAt } });
    }
  }
  if (failures.length) throw new Error('boundary expectations failed: ' + JSON.stringify(failures));
  return JSON.stringify({ status: 'PASS', rows: (report.rows || []).map(row => ({ kind: row.kind, keep: row.keep, status: row.status })), allReady: report.preconditions.allReady });
})()
