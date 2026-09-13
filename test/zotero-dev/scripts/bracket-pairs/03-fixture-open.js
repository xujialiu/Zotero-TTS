(() => {
  const fixtureID = 24434;
  try {
    const result = Zotero.Reader.open(fixtureID);
    return JSON.stringify({ called: true, resultType: typeof result, readers: (Zotero.Reader._readers || []).length });
  } catch (e) {
    return JSON.stringify({ called: false, error: String(e), stack: e?.stack || null });
  }
})()
