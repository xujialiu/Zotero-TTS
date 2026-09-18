return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const Cu = Components.utils, mw = Zotero.getMainWindow();
  const sleep = ms => new Promise(res => mw.setTimeout(res, ms));
  const r = (Zotero.Reader._readers || []).find(x => x.itemID === state.fixtureID);
  if (!r) throw new Error('fixture reader is gone');
  const ir = r._internalReader;
  const v = Cu.waiveXrays(ir._lastView || ir._primaryView);
  const win = v.iframeWindow;
  const START = 2000;
  // rAF stops while the window is minimized: a minimized pass returns no frames
  if (mw.windowState === 2) { mw.restore(); await sleep(800); }

  const origGet = Zotero.Prefs.get;
  let prefReads = 0, counting = false;
  Zotero.Prefs.get = function (...a) { if (counting) prefReads += 1; return origGet.apply(this, a); };

  async function pass(steps) {
    win.scrollTo(win.scrollX, START);
    await sleep(350);
    const frames = [], pings = [];
    let last = null, pinging = true;
    (function ping() { const t = mw.performance.now(); mw.setTimeout(() => { if (!pinging) return; pings.push(mw.performance.now() - t); ping(); }, 0); })();
    prefReads = 0; counting = true;
    let left = steps;
    await new Promise(done => {
      const step = now => {
        if (last !== null) frames.push(now - last);
        last = now;
        if (left-- <= 0) return done();
        win.scrollBy(0, 14);
        win.requestAnimationFrame(step);
      };
      win.requestAnimationFrame(step);
    });
    counting = false; pinging = false;
    const reads = prefReads;
    await sleep(120);
    const g = frames.filter(x => x > 0 && x < 3000).sort((a, b) => a - b);
    const sum = g.reduce((a, b) => a + b, 0);
    const ps = pings.slice().sort((a, b) => a - b);
    return { frames: g.length, fps: g.length ? +(1000 / (sum / g.length)).toFixed(1) : null,
      medianGap: g.length ? +g[g.length >> 1].toFixed(1) : null, maxGap: g.length ? +g[g.length - 1].toFixed(1) : null,
      over50pct: g.length ? +(100 * g.filter(x => x > 50).length / g.length).toFixed(1) : null,
      prefReads: reads, pingMedian: ps.length ? +ps[ps.length >> 1].toFixed(1) : null,
      pingMax: ps.length ? +ps[ps.length - 1].toFixed(1) : null };
  }

  const out = {};
  try {
    out.A_playerClosed = await pass(60);
    ir.toggleReadAloudPopup(true);
    let m = null;
    for (let i = 0; i < 40; i++) { m = ir._readAloudManager; if (m && m.active) break; await sleep(150); }
    if (!m || !m.active) throw new Error('the fixture player did not activate');
    if (!m.paused && typeof m.pause === 'function') m.pause();
    await sleep(700);
    out.sessionActive = !!m.active; out.sessionPaused = !!m.paused;
    out.allVoices = m._allVoices ? m._allVoices.length : null;
    out.B_playerOpen = await pass(60);
  } finally { Zotero.Prefs.get = origGet; }

  const a = out.A_playerClosed, b = out.B_playerOpen;
  if (!b || b.fps < a.fps * 0.8 || b.over50pct > 0) throw new Error('scrolling degraded with the player open: ' + JSON.stringify(out));
  state.scroll = out;
  return JSON.stringify(out, null, 1);
})()
