(async () => {
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === 24424) { reader = list[i]; break; }
  if (!reader) return JSON.stringify({ error: 'fixture reader missing' });
  const internal = reader._internalReader;
  const manager = internal && internal._readAloudManager;
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  const calls = [];
  const win = reader._window;
  const bytes = Uint8Array.from([255, 251, 144, 1, 0, 0, 0, 0]);
  const b64 = btoa(String.fromCharCode(...bytes));
  // Exact bug: this source was four backslashes in the outer bridge string,
  // so the evaluated Zotero code contained '\\n\\n' (literal backslash-n).
  const payload = 'data: ' + JSON.stringify({ audio_base64: b64, chunk_seq: 0,
    alignment: { segments: [{ text: 'Hello', start: 0, end: 0.5 }, { text: 'world', start: 0.5, end: 1.0 }] } }) + '\\n\\n';
  sandbox.fetch = function(input, init) {
    if (typeof init?.body === 'string') {
      let text = null;
      try { text = JSON.parse(init.body).text; } catch (e) {}
      calls.push({ path: String(input).split('://').pop().replace(/^[^/]*/, ''), text });
      return new win.Response(payload, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    return Reflect.apply(originalFetch, sandbox, [input, init]);
  };
  const trace = [];
  let error = null;
  try {
    internal.toggleReadAloudPopup(true);
    for (let i = 0; i < 70; i++) {
      const c = manager && manager._controller;
      trace.push({ ms: i * 100, active: !!manager?.active, paused: manager ? !!manager.paused : null,
        voice: manager?.selectedVoiceID ?? null, tier: manager ? manager._selectedTier : null,
        controller: !!c, segments: c?._segments?.length ?? null, position: c?._position ?? null });
      if (manager?.active && c && !manager.paused) {
        try { manager.pause(); } catch (e) { error = 'pause ' + String(e); }
        break;
      }
      if (manager?.active && c && manager.paused) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (e) { error = String(e); }
  finally { sandbox.fetch = originalFetch; }
  const c = manager && manager._controller;
  return JSON.stringify({ error, calls, traceCount: trace.length,
    trace: trace.length > 6 ? [trace[0], trace[1], trace[trace.length - 2], trace[trace.length - 1]] : trace,
    final: trace[trace.length - 1] || null, segments: c?._segments?.length ?? null, position: c?._position ?? null }, null, 1);
})()
