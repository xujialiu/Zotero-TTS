// Item 5.9 cleanup, and case 3.26's teardown for the three fixtures: splice
// the dead entry (only a restart or this removes it), close the live tabs,
// erase the fixture items, restore the named prefs (memory last, though
// this case never rewrites it), and report where the error/position state
// landed. WebDAV url/sync-switch restore runs outside this kit, after this
// script, per the workflow.
// params: none. state: reads baseline, fixtures, deadReader, tabReader.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const baseline = state.baseline || {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: 'cleanup' };

  // 1. Splice the dead entry -- the one whose _window.closed is true.
  const list = Zotero.Reader._readers;
  let splicedIndex = -1;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (r?.itemID === state.deadReader.itemID && r?._window?.closed) { splicedIndex = i; break; }
  }
  if (splicedIndex >= 0) list.splice(splicedIndex, 1);
  out.spliced = { index: splicedIndex, remaining: list.length };

  // 2. Close the live fixture tabs (B and C).
  const closed = [];
  for (const id of [state.tabReader?.itemID, state.fixtures?.c?.id].filter(Boolean)) {
    const cur = Zotero.Reader._readers || [];
    for (let i = 0; i < cur.length; i++) {
      const r = cur[i];
      if (r?.itemID !== id) continue;
      try { const pending = r.close(); if (pending && typeof pending.then === 'function') await pending; closed.push(id); } catch (e) { out['closeError' + id] = String(e); }
    }
  }
  out.closed = closed;
  for (let t = 0; t < 50; t++) {
    const cur = Zotero.Reader._readers || [];
    const stillOpen = closed.some((id) => cur.some((r) => r?.itemID === id));
    if (!stillOpen) break;
    await sleep(100);
  }

  // 3. Erase the three fixture items.
  const erased = [];
  const errors = [];
  const ids = [state.fixtures?.a?.id, state.fixtures?.b?.id, state.fixtures?.c?.id].filter(Boolean);
  for (const id of ids) {
    try { const item = Zotero.Items.get(id); if (item) { await item.eraseTx(); erased.push(id); } } catch (e) { errors.push('erase ' + id + ': ' + String(e)); }
  }
  out.erased = erased;
  out.eraseErrors = errors;

  // 4. Restore the named prefs this kit touched (memory last -- unchanged
  // here, since 5.9 never rewrites it, but confirm byte-for-byte anyway).
  const prefix = 'extensions.zotero.zotero-tts.';
  const restoreInt = (suffix) => {
    const snap = baseline.prefs?.[suffix];
    if (!snap) return null;
    Services.prefs.setIntPref(prefix + suffix, snap.value);
    if (!snap.user && Services.prefs.prefHasUserValue(prefix + suffix)) Services.prefs.clearUserPref(prefix + suffix);
    return { value: Services.prefs.getIntPref(prefix + suffix), user: Services.prefs.prefHasUserValue(prefix + suffix) };
  };
  const restoreStr = (suffix) => {
    const snap = baseline.prefs?.[suffix];
    if (!snap) return null;
    Services.prefs.setStringPref(prefix + suffix, snap.value);
    if (!snap.user && Services.prefs.prefHasUserValue(prefix + suffix)) Services.prefs.clearUserPref(prefix + suffix);
    return { value: Services.prefs.getStringPref(prefix + suffix), user: Services.prefs.prefHasUserValue(prefix + suffix) };
  };
  out.restored = { volume: restoreInt('readAloud.volume') };
  // memory last of all, per the workflow, though it was never written this run
  out.restored.memory = restoreStr('readAloud.memory');
  const memoryUnchanged = baseline.prefs?.['readAloud.memory']?.value === Services.prefs.getStringPref(prefix + 'readAloud.memory', null);
  out.memoryUnchanged = memoryUnchanged;

  if (baseline.debugStoring !== undefined && !!Zotero.Debug?.storing !== !!baseline.debugStoring) Zotero.Debug.setStore(!!baseline.debugStoring);
  out.debugStoring = !!Zotero.Debug?.storing;

  // 5. Position rows back to baseline; final reader list; final errors tail.
  let position = null;
  try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (e) { errors.push('position: ' + String(e)); }
  out.positionRows = { before: baseline.positionRows ?? null, after: position?.database?.rows ?? null, legacyPrefAfter: position?.legacyPref ?? null };

  const remaining = [];
  for (const r of Zotero.Reader?._readers || []) {
    const m = r._internalReader?._readAloudManager;
    remaining.push({ itemID: r.itemID, active: !!m?.active, paused: !!m?.paused });
  }
  out.remainingReaders = remaining;

  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  out.finalStartup = { failed: startup.failed, allOk: startup.failed.length === 0 };

  state.cleanup = out;
  return JSON.stringify(out, null, 1);
})()
