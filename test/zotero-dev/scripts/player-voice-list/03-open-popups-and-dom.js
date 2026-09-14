return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const transport = state.transport;
  if (!transport?.readers) throw new Error('transport state is missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const main = Zotero.getMainWindow?.();
  const rows = {};
  for (const kind of ['pdf', 'epub']) {
    const entry = transport.readers[kind], reader = entry.reader, manager = entry.manager, internal = entry.internal;
    if (!reader || !manager) throw new Error(`${kind} reader is missing`);
    try { main?.Zotero_Tabs?.select(reader.tabID); } catch (e) {}
    await sleep(150);
    let toggleError = null;
    try { internal.toggleReadAloudPopup(true); } catch (e) { toggleError = String(e); }
    await sleep(1200);
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
    await sleep(250);
    const doc = reader._iframeWindow?.document;
    const popup = doc?.querySelector?.('.read-aloud-popup');
    const elements = [];
    if (popup) {
      const all = popup.querySelectorAll('*');
      for (let i = 0; i < all.length && i < 300; i++) {
        const el = all[i];
        const text = String(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160);
        const attrs = {};
        for (const name of ['id', 'class', 'role', 'aria-label', 'data-voice-id', 'data-language', 'value', 'title']) if (el.hasAttribute?.(name)) attrs[name] = el.getAttribute(name);
        if (text || Object.keys(attrs).length) elements.push({ tag: el.localName || el.tagName, text, attrs });
      }
    }
    rows[kind] = { toggleError, popup: !!popup, active: !!manager.active, paused: !!manager.paused,
      selected: manager.selectedVoiceID ?? null, lang: manager.lang ?? null, region: manager.region ?? null,
      segmentCount: manager._segments?.length ?? null, offered: manager.voicesForLanguage?.length ?? null,
      calls: transport.calls.slice(), elements };
  }
  return JSON.stringify(rows, null, 1);
})()
