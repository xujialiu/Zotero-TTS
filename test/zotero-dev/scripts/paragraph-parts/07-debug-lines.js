// Item 2's other half: the plugin's own debug lines. One
// `paragraph parts joined on page N: "…A" + "B…" (blocks a and b)` per join and
// one `skipped line restored on page N: …` per line put back, in Zotero's debug
// store (02 turns it on if the owner had it off, and 10 puts that back).
(async () => {
  const out = { step: 'debug-lines' };
  try {
    out.storing = Zotero.Debug.storing;
    const text = await Zotero.Debug.get();
    const lines = String(text).split('\n');
    const joined = [];
    const restored = [];
    const other = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.indexOf('[zotero-tts]') < 0) continue;
      if (l.indexOf('paragraph parts joined') >= 0) joined.push(l.trim());
      else if (l.indexOf('skipped line restored') >= 0) restored.push(l.trim());
      else if (other.length < 15) other.push(l.trim().slice(0, 160));
    }
    out.storeLines = lines.length;
    out.joinedCount = joined.length;
    out.restoredCount = restored.length;
    out.joined = joined.slice(-40);
    out.restored = restored.slice(-20);
    out.otherPluginLines = other;
  } catch (e) { out.error = String(e); throw e; }
  return JSON.stringify(out);
})()
