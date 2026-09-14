return (async () => {
  const state = Zotero.ZoteroTTSRun.state, transport = state.transport;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const main = Zotero.getMainWindow?.(), out = {};
  for (const kind of ['pdf', 'epub']) {
    const entry = transport.readers[kind], doc = entry.reader._iframeWindow?.document, popup = doc?.querySelector?.('.read-aloud-popup');
    if (!popup) throw new Error(`${kind} popup is missing`);
    try { main?.Zotero_Tabs?.select(entry.reader.tabID); } catch (e) {}
    await sleep(100);
    const triggers = popup.querySelectorAll('button[aria-label="Voice"]');
    const trigger = triggers.length ? triggers[0] : null;
    let clickError = null;
    try { trigger?.click(); } catch (e) { clickError = String(e); }
    await sleep(120);
    const elements = [], all = popup.querySelectorAll('*');
    for (let i = 0; i < all.length && i < 500; i++) {
      const el = all[i], text = String(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160), attrs = {};
      for (const name of ['id', 'class', 'role', 'aria-label', 'data-voice-id', 'data-language', 'value', 'title']) if (el.hasAttribute?.(name)) attrs[name] = el.getAttribute(name);
      if (text || Object.keys(attrs).length) elements.push({ tag: el.localName || el.tagName, text, attrs });
    }
    out[kind] = { trigger: !!trigger, clickError, selected: entry.manager.selectedVoiceID ?? null, elements };
  }
  return JSON.stringify(out, null, 1);
})()
