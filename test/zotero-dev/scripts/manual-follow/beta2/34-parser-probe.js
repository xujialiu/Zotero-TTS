return (async () => {
  const events = [];
  const listener = e => events.push({ trusted: !!e.isTrusted, deltaY: e.deltaY, target: String(e.target && e.target.localName || '') });
  return JSON.stringify({ ok: true, n: events.length });
})()
