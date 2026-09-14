// Item 1, first half: the build that is running and its startup.
// diagnostics.startup() is synchronous (it returns the JSON string itself);
// skippedLines() is the proof the new code is in the bundle at all — its
// entries carry `joinEnabled`, a key 1.12.7 does not have.
(async () => {
  const out = { step: 'startup-and-identity' };
  try {
    out.startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
    out.version = out.startup.version;
    const steps = out.startup.steps;
    out.stepCount = Array.isArray(steps) ? steps.length : null;
    out.notOk = [];
    if (Array.isArray(steps)) {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const name = typeof s === 'string' ? s : s && (s.name || s.step);
        const state = typeof s === 'string' ? 'ok' : s && (s.state || s.status || (s.ok === true ? 'ok' : s.ok));
        if (String(state) !== 'ok') out.notOk.push({ name, state });
        if (String(name) === 'skipped lines') out.skippedLinesStep = { name, state };
      }
    }
    out.failed = out.startup.failed;
  } catch (e) { out.startupError = String(e); }
  try {
    const list = JSON.parse(await Zotero.ZoteroTTS.diagnostics.skippedLines());
    out.readerCount = list.length;
    out.joinEnabledKeyPresent = list.length > 0 && list[0] !== null && Object.prototype.hasOwnProperty.call(list[0], 'joinEnabled');
    out.firstEntryKeys = list.length > 0 && list[0] ? Object.keys(list[0]).join(',') : null;
  } catch (e) { out.skippedLinesError = String(e); }
  return JSON.stringify(out);
})()
