/**
 * Item 16's restoration (item 10, applied to a run that swapped the whole
 * file rather than crafting one item): the PDF tab closed and its attachment
 * erased (imported by 08-pdf-tab.js, touched by nothing else), the syncs let
 * settle, then the Positions File put back.
 *
 * If state.positionsBefore holds text (28-file-snapshot.js 'before'), the
 * server file is compared to it with params.fixtureIds removed from the
 * server side first: an exact match after that removal means no other
 * writer touched the file meanwhile, so the ORIGINAL bytes go back verbatim
 * (byte for byte, proven by readback). A mismatch means another writer's
 * items are mixed in with the fixture's: nothing is overwritten wholesale,
 * only params.fixtureIds are deny-listed out of the CURRENT file (as
 * 34-cleanup-two-fixtures.js does), and the drift is reported rather than
 * silently discarded. If state.positionsBefore is undefined (the file was
 * absent when found), the file is deleted instead so the folder returns to
 * that state.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const s = Zotero.ZoteroTTSRun.state;
  const out = { steps: [] };
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const win = Zotero.getMainWindow();
  const idle = async (ms) => {
    const t = Date.now();
    while (Date.now() - t < ms) {
      const d = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
      if (!d.shared.transport.running) return d.shared.transport;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  };

  const pdf = s.pdf;
  if (pdf?.tabID && win.Zotero_Tabs._tabs.some((t) => t.id === pdf.tabID)) {
    win.Zotero_Tabs.close(pdf.tabID);
    out.steps.push('closed the pdf tab');
    await new Promise((r) => setTimeout(r, 2500));
  }
  if (pdf?.itemID) {
    const item = Zotero.Items.get(pdf.itemID);
    if (item) {
      await item.eraseTx();
      out.steps.push('erased the pdf attachment ' + pdf.itemID);
    }
  }
  await new Promise((r) => setTimeout(r, 4000));
  out.afterCloseErase = await idle(20000);

  const fixtureIds = new Set(p.fixtureIds || []);
  const g = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.getStatus = g.status;
  const originalText = typeof s.positionsBefore === 'string' ? s.positionsBefore : null;
  out.originalWasAbsent = originalText === null;

  if (originalText === null) {
    // The file was absent when found: it should be absent again.
    if (g.status === 200) {
      const del = await fetch(url + 'xujialiu-positions.json', { method: 'DELETE', headers: { Authorization: auth }, cache: 'no-store' });
      out.deleteStatus = del.status;
      const g2 = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
      out.finalStatus = g2.status;
    } else {
      out.finalStatus = g.status;
    }
    return JSON.stringify(out);
  }

  if (g.status !== 200) {
    // Nothing to restore against; put the original back as the safest choice.
    const put = await fetch(url + 'xujialiu-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: originalText, cache: 'no-store' });
    out.putStatus = put.status;
    out.restoredFromMissing = true;
  } else {
    const currentText = await g.text();
    const current = JSON.parse(currentText);
    const original = JSON.parse(originalText);
    const currentOwn = current.items.filter((i) => !fixtureIds.has(i.id));
    const originalById = new Map(original.items.map((i) => [i.id, JSON.stringify(i)]));
    const currentOwnById = new Map(currentOwn.map((i) => [i.id, JSON.stringify(i)]));
    const sameIds = currentOwn.length === original.items.length && [...currentOwnById.keys()].every((id) => originalById.has(id));
    const sameContent = sameIds && [...currentOwnById.entries()].every(([id, text2]) => originalById.get(id) === text2);
    out.driftDetected = !sameContent;

    if (sameContent) {
      const put = await fetch(url + 'xujialiu-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: originalText, cache: 'no-store' });
      out.putStatus = put.status;
      out.restoredVerbatim = true;
    } else {
      out.driftDetail = {
        onlyInCurrent: [...currentOwnById.keys()].filter((id) => !originalById.has(id)).map((id) => id.slice(0, 8)),
        onlyInOriginal: [...originalById.keys()].filter((id) => !currentOwnById.has(id)).map((id) => id.slice(0, 8)),
        changed: [...currentOwnById.entries()].filter(([id, t]) => originalById.has(id) && originalById.get(id) !== t).map(([id]) => id.slice(0, 8)),
      };
      const kept = current.items.filter((i) => !fixtureIds.has(i.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const body = JSON.stringify({ format: current.format, version: current.version, items: kept });
      const put = await fetch(url + 'xujialiu-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body, cache: 'no-store' });
      out.putStatus = put.status;
      out.restoredByDenyList = true;
      out.removedIds = current.items.filter((i) => fixtureIds.has(i.id)).map((i) => i.id.slice(0, 8) || '(empty)');
    }
  }

  const g2 = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  const text2 = g2.status === 200 ? await g2.text() : null;
  out.finalStatus = g2.status;
  if (text2 !== null) {
    out.finalBytes = text2.length;
    out.finalMatchesOriginal = text2 === originalText;
    const digest = await Zotero.getMainWindow().crypto.subtle.digest('SHA-256', new TextEncoder().encode(text2));
    out.finalSha256 = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    out.finalItemIds = JSON.parse(text2).items.map((i) => i.id.slice(0, 8) || '(empty)');
  }
  out.tabsLeft = win.Zotero_Tabs._tabs.map((t) => t.id + ' ' + String(t.title || '').slice(0, 40));
  return JSON.stringify(out);
})()
