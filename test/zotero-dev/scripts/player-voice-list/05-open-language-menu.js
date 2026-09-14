return (async () => {
  const transport = Zotero.ZoteroTTSRun.state.transport, main = Zotero.getMainWindow?.(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), out = {};
  for (const kind of ['pdf', 'epub']) {
    const entry = transport.readers[kind], doc = entry.reader._iframeWindow.document, popup = doc.querySelector('.read-aloud-popup');
    try { main?.Zotero_Tabs?.select(entry.reader.tabID); } catch (e) {}
    await sleep(100);
    const trigger = popup.querySelector('button[aria-label="Language"]');
    let error = null; try { trigger?.click(); } catch (e) { error = String(e); }
    await sleep(120);
    const options = [], all = popup.querySelectorAll('[role="option"]');
    for (let i = 0; i < all.length; i++) options.push({ id: all[i].id || null, text: String(all[i].textContent || '').trim().replace(/\s+/g, ' '), selected: all[i].getAttribute('aria-selected'), class: all[i].className || null });
    out[kind] = { error, trigger: !!trigger, label: trigger?.textContent?.trim() || null, options };
  }
  return JSON.stringify(out, null, 1);
})()
