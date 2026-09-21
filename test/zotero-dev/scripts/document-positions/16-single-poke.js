/**
 * One sync, and only one, outside the transport's 60 s failure window
 * (SHARED_SYNC_RETRY_MS): the wait, then the PDF tab closed — a single poke —
 * so the stats read belong to that sync and not to a skipped one behind it.
 * params.waitMs (default 62000); params.expectFileText, when given, is the text
 * the Positions File must still hold afterwards — an erroring sync may not
 * write a byte. Reads state.pdf.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const s = Zotero.ZoteroTTSRun.state;
  const out = {};
  const stats = async () => {
    const d = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    return { shared: d.shared.transport, own: { lastOutcome: d.transport.lastOutcome, lastTrigger: d.transport.lastTrigger, lastError: d.transport.lastError, uploaded: d.transport.uploaded, syncs: d.transport.syncs }, documents: d.shared.documents };
  };
  out.before = await stats();
  await new Promise((r) => setTimeout(r, p.waitMs ?? 62000));
  const win = Zotero.getMainWindow();
  if (s.pdf?.tabID && win.Zotero_Tabs._tabs.some((t) => t.id === s.pdf.tabID)) {
    win.Zotero_Tabs.close(s.pdf.tabID);
    out.closed = s.pdf.tabID;
    s.pdf.tabID = null;
  } else {
    const reader = await Zotero.Reader.open(s.pdf.itemID);
    const started = Date.now();
    while (Date.now() - started < 20000 && !reader?._internalReader) await new Promise((r) => setTimeout(r, 700));
    s.pdf.tabID = reader?.tabID ?? null;
    out.opened = s.pdf.tabID;
  }
  // The stats are only this sync's once the single-flight has let go: a read
  // taken while `running` is true still shows the sync before it (2026-09-21)
  const settle = Date.now();
  let seen = null;
  while (Date.now() - settle < 25000) {
    seen = await stats();
    if (seen.shared.running === false && seen.shared.lastAt > (out.before.shared.lastAt ?? 0)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  out.settledMs = Date.now() - settle;
  out.after = seen;
  const debug = String(await Zotero.Debug.get());
  out.sharedLines = debug.split('\n').filter((l) => l.indexOf('shared position sync') !== -1).slice(-2).map((l) => l.slice(l.indexOf('[zotero-tts]')));
  if (typeof p.expectFileText === 'string') {
    const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
    const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
    const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    const auth = 'Basic ' + btoa(binary);
    const g = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
    const text = g.status === 200 ? await g.text() : null;
    out.fileStatus = g.status;
    out.fileBytes = text === null ? null : text.length;
    out.fileUnchanged = text === p.expectFileText;
  }
  return JSON.stringify(out);
})()
