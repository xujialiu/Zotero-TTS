// The kit runner (2026-09-14): Zotero reads a kit's scripts from disk and runs
// them itself, so their text never passes through the tester's context. Chrome
// scope, loaded by one zotero_execute_js call (see README.md beside this file):
//
//   const root = 'C:/Users/<you>/…/zotero_plugin_tts/<worktree>';
//   const file = p => (Zotero.isWin ? p.replace(/\//g, '\\') : p);   // IOUtils rejects '/' on Windows
//   const run = (0, eval)(await IOUtils.readUTF8(file(root + '/test/zotero-dev/scripts/_shared/run.js')));
//   return run.start({ root, kit: 'voice-switch', scripts: ['native-00-startup-diagnostic.js'], runId: '2026-09-14-1.12.8-beta-voice-switch' });
//
// start() returns at once; the scripts run in the background, one after the
// other, so a script may take longer than the bridge's 30 s timeout. Then
// every later call reaches the same runner through the global, no disk read:
//
//   return Zotero.ZoteroTTSRun.api.wait('2026-09-14-1.12.8-beta-voice-switch', 7000, 0);
//
// returns the results so far (each capped at 2,000 characters; the full result
// of every script is written to .tmp/zotero-dev/<runId>/results/<script>.json)
// and `done` once the group has finished. A script is an expression whose value
// is a JSON string or a promise of one — the async IIFE every kit script already
// is; a script with a top-level `return` is wrapped the way the bridge wraps it.
// Scripts read their inputs from Zotero.ZoteroTTSRun.params (root, fixturesDir,
// tmpDir, runId, plus whatever start() was given) and share state across the
// run in Zotero.ZoteroTTSRun.state; they hard-code no path and no item id.
(() => {
  const Z = globalThis.Zotero;
  const G = (Z.ZoteroTTSRun ||= { version: 1, params: {}, state: {}, runs: {}, busy: false, current: null });
  const CAP = 2000;
  const norm = p => (Z.isWin ? String(p).replace(/\//g, '\\') : String(p));
  const now = () => new Date().toISOString();
  const json = v => JSON.stringify(v);

  const summarize = s => (typeof s === 'string' && s.length > CAP
    ? s.slice(0, CAP) + `… [${s.length} chars; the full result is on disk]`
    : s);

  async function writeFile(path, text) {
    await IOUtils.makeDirectory(PathUtils.parent(path), { createAncestors: true, ignoreExisting: true });
    await IOUtils.writeUTF8(path, text);
  }

  // Evaluate a script's text in the global scope, as the bridge would.
  function evaluate(code) {
    try {
      return (0, eval)(code);
    } catch (e) {
      if (e instanceof SyntaxError && /return/.test(e.message)) {
        return (0, eval)(`(async () => {\n${code}\n})()`);
      }
      throw e;
    }
  }

  async function runOne(run, i) {
    const file = run.files[i];
    const entry = { index: i, name: PathUtils.filename(file), startedAt: now(), ms: 0, error: null, result: null };
    const t0 = Date.now();
    let full = null;
    try {
      let value = evaluate(await IOUtils.readUTF8(file));
      if (value && typeof value.then === 'function') value = await value;
      full = typeof value === 'string' ? value : json(value === undefined ? null : value);
    } catch (e) {
      entry.error = { message: String(e), stack: e && e.stack ? String(e.stack).split('\n').slice(0, 6).join('\n') : null };
    }
    entry.ms = Date.now() - t0;
    entry.result = summarize(full);
    run.results.push(entry);
    try {
      await writeFile(PathUtils.join(run.dir, 'results', entry.name + '.json'), JSON.stringify({ ...entry, result: full }, null, 1));
    } catch (e) {
      entry.writeError = String(e);
    }
    return !entry.error;
  }

  async function loop(run) {
    try {
      for (let i = run.index; i < run.files.length; i++) {
        run.index = i;
        const ok = await runOne(run, i);
        if (!ok && run.stopOnError) { run.stopped = true; break; }
      }
    } finally {
      run.done = true;
      run.finishedAt = now();
      G.busy = false;
      try { await writeFile(PathUtils.join(run.dir, 'run.json'), JSON.stringify(run, null, 1)); } catch (e) { run.writeError = String(e); }
    }
  }

  function resolveFiles({ root, kit, dir, scripts }) {
    const base = norm(dir || PathUtils.join(norm(root), 'test', 'zotero-dev', 'scripts', kit));
    return { base, files: scripts.map(s => (PathUtils.isAbsolute(norm(s)) ? norm(s) : PathUtils.join(base, s))) };
  }

  const api = {
    /** Start a group in the background; returns { started, runId, total, dir } at once. */
    start({ root, kit, dir, scripts, runId, params = {}, stopOnError = true }) {
      if (!root || !Array.isArray(scripts) || !scripts.length || (!kit && !dir)) {
        return json({ error: 'start needs root, scripts[] and kit or dir' });
      }
      if (G.busy) return json({ error: 'a run is still in progress', runId: G.current });
      const { base, files } = resolveFiles({ root, kit, dir, scripts });
      runId = runId || `${now().slice(0, 19).replace(/[:T]/g, '-')}-${kit || 'dir'}`;
      Object.assign(G.params, {
        root: norm(root),
        fixturesDir: PathUtils.join(norm(root), 'test', 'fixtures'),
        tmpDir: PathUtils.join(norm(root), '.tmp', 'zotero-dev'),
        runId,
      }, params);
      const run = {
        runId, kit: kit || null, base, files, index: 0, results: [], done: false, stopped: false, stopOnError,
        startedAt: now(), finishedAt: null, dir: PathUtils.join(norm(root), '.tmp', 'zotero-dev', runId),
      };
      G.runs[runId] = run;
      G.busy = true;
      G.current = runId;
      loop(run);
      return json({ started: true, runId, total: files.length, dir: run.dir });
    },

    /** Wait up to ms (keep it under the bridge's window) and return the results from index `from` on. */
    async wait(runId, ms = 7000, from = 0) {
      const run = G.runs[runId || G.current];
      if (!run) return json({ error: 'no such run', runs: Object.keys(G.runs) });
      const until = Date.now() + ms;
      while (!run.done && Date.now() < until) await new Promise(r => setTimeout(r, 200));
      return json({ runId: run.runId, done: run.done, stopped: run.stopped, index: run.index, total: run.files.length, dir: run.dir, results: run.results.slice(from) });
    },

    /** Run one script and wait for it inside this call: only for a script that finishes well under the window. */
    async one({ root, kit, dir, script, params = {} }) {
      if (G.busy) return json({ error: 'a run is still in progress', runId: G.current });
      const { files } = resolveFiles({ root, kit, dir, scripts: [script] });
      Object.assign(G.params, { root: norm(root), fixturesDir: PathUtils.join(norm(root), 'test', 'fixtures'), tmpDir: PathUtils.join(norm(root), '.tmp', 'zotero-dev') }, params);
      const run = { runId: `one-${Date.now()}`, files, index: 0, results: [], done: false, stopped: false, stopOnError: true, startedAt: now(), dir: PathUtils.join(norm(root), '.tmp', 'zotero-dev', 'one') };
      await runOne(run, 0);
      return json(run.results[0]);
    },

    /** Every run this Zotero process has seen, briefly. */
    status() {
      return json({ busy: G.busy, current: G.current, params: G.params, state: Object.keys(G.state),
        runs: Object.values(G.runs).map(r => ({ runId: r.runId, done: r.done, stopped: r.stopped, index: r.index, total: r.files.length })) });
    },

    /** Forget finished runs and the shared state; a run in progress is left alone. */
    reset() {
      for (const [id, r] of Object.entries(G.runs)) if (r.done) delete G.runs[id];
      G.state = {};
      if (!G.busy) G.current = null;
      return json({ busy: G.busy, runs: Object.keys(G.runs) });
    },
  };
  G.api = api;
  return api;
})()
