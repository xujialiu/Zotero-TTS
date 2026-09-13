(async () => {
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === 24424) { reader = list[i]; break; }
  if (!reader) return JSON.stringify({ error: 'fixture reader missing' });
  const win = reader._window;
  const bytes = Uint8Array.from([255, 251, 144, 1, 0, 0, 0, 0]);
  const b64 = btoa(String.fromCharCode(...bytes));
  const event = JSON.stringify({ audio_base64: b64, chunk_seq: 0,
    alignment: { segments: [{ text: '100', start: 0, end: 0.5 }, { text: 'exp', start: 0.5, end: 1.0 }] } });
  const literalSlashN = String.fromCharCode(92, 110);
  const badPayload = 'data: ' + event + literalSlashN + literalSlashN;
  const goodPayload = 'data: ' + event + String.fromCharCode(10, 10);
  const parseShape = raw => {
    const lines = String(raw).split(/\r?\n/);
    const dataLines = [];
    const parsed = [];
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      dataLines.push(line);
      try { parsed.push(JSON.parse(line.slice(5).trim())); } catch (e) {}
    }
    return { lineCount: lines.length, dataLineCount: dataLines.length, parsedCount: parsed.length,
      parsedAudioBytes: parsed.reduce((n, x) => n + (typeof x.audio_base64 === 'string' ? x.audio_base64.length : 0), 0),
      rawTail: String(raw).slice(-12) };
  };
  const badResponse = new win.Response(badPayload, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  const goodResponse = new win.Response(goodPayload, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  const badRaw = await badResponse.text();
  const goodRaw = await goodResponse.text();
  return JSON.stringify({ bad: { raw: badRaw, parse: parseShape(badRaw) }, good: { raw: goodRaw, parse: parseShape(goodRaw) }, b64Length: b64.length }, null, 1);
})()
