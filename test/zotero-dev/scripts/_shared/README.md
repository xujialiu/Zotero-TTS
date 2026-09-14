# Scripts: the shared kit — the runner, and the steps every case uses

[Checklist index](../../README.md) · [All scripts](../README.md) · [Tester workflow](../../../../agents/zotero-tester.md)

Not a case's folder: what every kit uses. Today that is the runner. The
steps several kits repeat — the baseline snapshot, mute and sync off, the
fixture import, cleanup and restore, the startup identity check — move in
here the next time a run exercises one of them, taken from the kit that
ran it, and the kits then name them instead of carrying a copy; nothing is
written here that has not run.

## `run.js` — Zotero runs a kit's scripts from disk

The scripts of a kit never pass through the tester's context: one
`zotero_execute_js` call loads the runner and starts a group, later calls
collect the results. Chrome scope; `root` is this checkout's absolute path
with forward slashes (the runner normalizes it on Windows, but the load
line below has to do its own — see the Windows bullet).

```js
// 1. Load and start (returns at once).
const root = 'C:/Users/xujia/orca/workspaces/zotero_plugin_tts/bug';
const file = p => (Zotero.isWin ? p.replace(/\//g, '\\') : p);
const run = (0, eval)(await IOUtils.readUTF8(file(root + '/test/zotero-dev/scripts/_shared/run.js')));
return run.start({
  root,
  kit: 'voice-switch',                       // or dir: '<absolute folder>' for .tmp probes
  scripts: ['native-00-startup-diagnostic.js', 'native-01-baseline-snapshot.js'],
  runId: '2026-09-14-1.12.8-beta-voice-switch',   // <date>-<build>-<kit>; the results folder
  params: { fixtureTitle: 'ztts 2026-09-14 A' },  // anything the scripts should read
  stopOnError: true,                         // a failure stops the pass (the default)
});
```

```js
// 2. Collect, through the handle the load left on the global — no second disk read.
//    Wait up to 7 s for the group to finish and return every result from index 0 on;
//    call again with the last index seen until done.
return Zotero.ZoteroTTSRun.api.wait('2026-09-14-1.12.8-beta-voice-switch', 7000, 0);
```

| Call | Does | Returns |
| --- | --- | --- |
| `start({ root, kit \| dir, scripts, runId?, params?, stopOnError? })` | Starts the scripts in order, in the background; refuses while another run is busy | `{ started, runId, total, dir }` |
| `wait(runId, ms = 7000, from = 0)` | Waits up to `ms` for the run to finish, then answers | `{ done, stopped, index, total, dir, results[from…] }`, each result `{ index, name, ms, error, result }` with `result` capped at 2,000 characters |
| `one({ root, kit \| dir, script, params? })` | Runs one script inside the call — only for one that finishes well under the window | that script's entry |
| `status()` | Every run this Zotero process has seen, the shared params, the state keys | summary |
| `reset()` | Forgets finished runs and clears `state`; `params` and a run in progress are left alone | `{ busy, runs }` |

- **A long group.** `wait` returns `done: false` with what has finished;
  rather than polling every 7 s, run `sleep 60` in the background with the
  Bash tool (the harness wakes you when it exits) and collect once. A wait
  issued in the same call as `start` is what proves a group is still
  running — between two bridge calls a dozen seconds can pass.
- **Results on disk.** Every script's full result is
  `.tmp/zotero-dev/<runId>/results/<script>.json` (`index`, `name`, `ms`,
  `error`, the whole `result`), and `run.json` beside them holds the run
  with the capped results; read a file only for a row that failed or
  surprised you. `.tmp/` is gitignored.
- **A script** is an expression whose value is a JSON string or a promise
  of one — the `(async () => { … return JSON.stringify(out); })()` every
  kit script already is; a top-level `return` is wrapped as the bridge
  wraps it. It reads its inputs from `Zotero.ZoteroTTSRun.params` (`root`,
  `fixturesDir`, `tmpDir`, `runId`, and whatever `start` was given) and
  keeps what later scripts need in `Zotero.ZoteroTTSRun.state` (a fixture's
  item id, a snapshot); it hard-codes no path and no item id. A script that
  waits on Zotero (playback, a listing) may take longer than the window:
  under the runner only the whole group is limited, by nothing.
- **Errors.** A throw is `error: { message, stack }` in the entry and, with
  `stopOnError`, ends the run there (`stopped: true`); the entries before it
  stand and the scripts after it are never read.
- **State it touches.** `Zotero.ZoteroTTSRun` on the Zotero global (gone at
  restart) and files under `.tmp/zotero-dev/`; nothing else. `reset()` at
  the end of a run.

### Limits

- **Windows paths.** `IOUtils` and `PathUtils` reject a forward-slash path
  — `OperationError: … could not parse path (NS_ERROR_FILE_UNRECOGNIZED_PATH)`,
  and `PathUtils.join('C:/…', 'test')` throws before it can help. The runner
  normalizes `root`, `dir` and every script name itself, so a forward-slash
  `root` is right in `start`; only the load line above reads a path of its
  own, which is why it carries `file()` (2026-09-14: without it the runner
  never loaded and the call came back a bare `undefined`).
- **A bare `undefined` means the eval threw, or it outran the window** —
  the two are indistinguishable in the answer, so read `zotero_read_errors`
  straight after one: a throw is logged there with its message, a window is
  not. The window is the bridge's 30 s timeout, not the ~8 s the workflow
  once gave: measured 2026-09-14, a
  12 s eval returned its result and a 35 s one came back `undefined` (the
  bridge's own 30 s timeout). `wait`'s 7,000 ms default stays the safe
  figure, and a script that needs longer belongs in a group either way.
- **One run at a time per Zotero process.** `start` and `one` refuse a
  second with `{ error: 'a run is still in progress', runId }`; `wait` on an
  unknown id answers `{ error: 'no such run', runs: [...] }`.
- **`one()` is outside the run bookkeeping**: its entry is returned but not
  kept in `status()`, and it writes to the shared
  `.tmp/zotero-dev/one/results/<script>.json`, overwritten by the next call.
  It does not set `params.runId` either — a script it runs reads whatever
  the last `start` left there, so nothing named by `runId` should go
  through `one`.
- **Chrome scope only.** A script's `Zotero.ZoteroTTSRun` reads are
  chrome-scope reads; nothing here reaches the plugin sandbox —
  `Zotero.ZoteroTTS.diagnostics.*` still does that.

## Runs

| Run | What it verified | Observed |
| --- | --- | --- |
| 2026-09-14, Zotero-TTS 1.12.7, Zotero 10.0.2-beta.9 | The runner's first pass: a group of five probes from disk (`dir`), the 2,000-character cap and the full results on disk, a 12 s script under the runner, a throw stopping the run and `stopOnError: false` carrying on, a top-level `return`, `params`/`state`, `one`, `status`/`reset`, a start while busy | All nine PASS after one fix — the load line needed `file()` (see the Windows limit). `start` 0 ms while a 12 s script ran; group of five done in 10 ms total, results 1,925 / 2,032 / 4,979 / 1,800 / 1,553 chars, the two over 2,000 capped to 2,000 + the suffix in `wait`, whole on disk; throw run `stopped: true` with two entries, `stopOnError: false` three; `params.root` back with backslashes, `state.x` 41 → 42 across scripts |
