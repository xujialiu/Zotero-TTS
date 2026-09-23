# Testing — Zotero-TTS

How a change beyond the simple requests is built, installed and verified
in the running Zotero, and how that Zotero is driven for research. Part of
the project rule book, whose core is `MEMORY/MEMORY.md`.

## Building for a test

For changes beyond the simple requests of `MEMORY/MEMORY.md`: tests, typecheck, build — then the xpi goes into the
running Zotero through the zotero-dev bridge (`zotero_plugin_install`
upgrades it in place, no restart) and the live verification below runs
there.

**Test builds carry a beta version.** Every xpi built for testing sets
`addon/manifest.json`'s `version` to the next version plus `-beta`
(`1.7.4-beta`), and a second test build of the same version counts up
(`-beta2`, `-beta3`, …), so Tools → Plugins shows at a glance which build is
actually installed. `package.json` stays at the released version — it is not
what Zotero displays, and leaving it alone keeps the lock file out of it.
Two worktrees started from the same base can name the same `-betaN`
(2026-09-06: #59 and #60 both built 1.11.0-beta3, and one was installed
over the other in the middle of a verification): before naming one, check
`origin/main` and the other worktrees' `addon/manifest.json`, and prove
which build a profile runs by a grep of its bundle or by a diagnostic field
the build adds — never by the version string alone.

**The next version is a patch bump unless said otherwise** (settled
2026-09-07): a test build and a release take `X.Y.(Z+1)` — `1.11.2` →
`1.11.3-beta`, then `1.11.3` — whatever the change is, a feature
included. A minor bump, `+0.1.0`, happens only when the user says
`+0.1.0` or names the version; never because the change looks big.

**Every build is verified by its mechanism, not only by its visible
effect** — a diagnostic that proves the code path ran, with the expected
output stated before it runs. A fix that merely looks right may be working
by accident (2026-08-26, multilingual-first: the dropdown looked fixed
while diagnostics showed the patch absent — the "fix" and the symptom's
cause had not actually met); every such delivery quietly turns into debt.
Prefer `Zotero.ZoteroTTS.diagnostics.*`, which runs inside the plugin
sandbox — chrome-scope JS (`zotero_execute_js`, Run JavaScript) cannot
reproduce the sandbox's view. A purely visual change states that instead,
and names exactly what to check by eye.

## Driving Zotero live

The running Zotero is driven from here through the **zotero-dev MCP
bridge** — `introfini/mcp-server-zotero-dev` (MCP server `zotero-dev`,
tools `mcp__zotero-dev__*`) plus the *MCP Bridge for Zotero* plugin, which
opens RDP on 127.0.0.1:6100 when Zotero starts. Settled 2026-08-28, after
the provider-toggle feature was verified end to end this way. **"Test with
zotero dev" / "用 zotero dev 测试" means exactly this bridge** — drive the
running Zotero with `mcp__zotero-dev__*`; never some other route, and never
hand the checks back to the user except in the two cases below. Two kinds
of run go through it, under the same rules: **verifying** a branch's new
behavior before it is merged, and **researching** — reproducing a bug,
reading a reader's live state, digging an issue's evidence out of Zotero
before the issue is written.

- **Test WebDAV first** (2026-09-22): every zotero-dev run, research
  included, uses `~/.secrets/Zotero-TTS/test_webdav.txt` for the dedicated
  test WebDAV configuration to protect the owner's bookmarks and reading
  positions. On Windows and macOS, resolve `~` to the current user's home
  directory, including when working in a worktree.
  After `zotero_ping`, before
  installing a build or driving checks, snapshot the affected settings
  privately, suspend automatic sync/backup and settle pending requests,
  then switch Zotero-TTS and OpenReader Position to the test configuration
  wherever they use WebDAV. Confirm the effective destinations match the
  file before proceeding; report only the match result, never its contents
  or credentials. If the file is unavailable or isolation cannot be
  confirmed, stop the live run and report the blocker; never fall back to
  the owner's normal WebDAV. During cleanup, keep sync/backup suspended
  until test-created or downloaded bookmark/position data and pending
  writes are isolated and the original local state and settings restored;
  only then restore automatic sync/backup. If cleanup cannot be confirmed,
  leave sync/backup suspended and report what remains. Include isolation
  and cleanup evidence in the report. Mirrored in `.agents/zotero-tester.md`.
- **The driving rules are `.agents/zotero-tester.md`** (the bridge's tools,
  provider test authorization, the kit runner, and reports; the per-topic
  driving notes are `.agents/zotero-tester-driving.md`, read on demand).
  The main agent may drive bug and feature research directly. For live
  testing and implementation verification, it delegates to `zotero-tester`
  by default, except when the user explicitly asks it to drive personally,
  and confirms the report field by field: a PASS / FAIL table
  with the observed values first, scripts and traces verbatim only under
  the rows that failed, were not testable or surprised (settled
  2026-09-06, issue #58), which keeps its tokens for the work. A
  **verification brief** names the xpi path, the behaviors to verify, the
  diagnostics with their expected output, and what state it may touch; a
  **research brief** names the question to settle and what state it may
  touch, and leaves the expected output to the agent. **Choose reuse per
  run, not just by whether the question is the same** (settled
  2026-09-11). Resume through `SendMessage` when the agent's existing
  evidence, live probes, and reasoning would cost more to reconstruct
  than to carry forward. Start a fresh `zotero-tester` when its transcript
  has grown large and a concise handoff covers what the next check needs,
  even on the same question; a new question or verification after research
  usually favors a fresh agent, but neither choice is automatic. Weigh
  context size, the remaining work, and the cost of repeating discovery:
  a resumed agent re-reads its whole transcript on every call — the
  2026-09-08 tester's fourth brief, a few state reads, cost 204k tokens
  where a fresh agent starts from 60k. Say briefly why the chosen route
  costs less. A fresh brief carries the verified findings, remaining
  question, build and state hashes, fixture, precautions, and any live
  probes or cleanup still owed; do not leave two agents driving Zotero
  at once. What comes back is evidence — the issue, the fix and
  the commit stay in the main session.
- **The tester may close the owner's player** (settled 2026-09-16): a
  paused Read Aloud player left open blocks changes affecting its voice
  through the reading guard (issue #121); when a check needs such a
  change, the tester closes
  the player itself with the popup toggle, notes the tab, says so in the
  report and never reopens it — the owner is not asked first. Mirrored
  in `.agents/zotero-tester.md`.
- **Plan first.** List every new behavior on the branch and the check that
  covers it — for research, every question and the observation that would
  settle it; name what only unit tests can cover and why, and what only a
  human can judge. Work the list until it is empty, then a last pass for
  whatever was fixed along the way. A failure stops the pass: fix, rebuild,
  reinstall, re-run from the first check.
- **The list is `test/zotero-dev/README.md`** (settled 2026-09-01): the index
  of the live checklist, whose `cases/` hold one behavior each, every item
  a check of it (a diagnostic or an observation) and the expected output;
  the fixtures it uses are `test/fixtures/`. **A feature adds its items to
  its case file before it merges** — the check that proves the new
  behavior by its mechanism, what it may touch, what only a human can
  judge — and its verification brief runs that case plus the baseline
  (section 0). **The case is written by the main session once the fix
  is built and its verification brief is about to go out** (settled
  2026-09-14): its expected outputs come from the design and the
  diagnostics the build carries, are stated before the run, and are
  corrected from the tester's table afterwards; the tester drafts nothing
  for `cases/`, and no case file is written during research. A fix that
  changes an expected output changes it there in the same commit. **A
  case holds
  one behavior** (settled 2026-09-13): one user-facing feature, whose
  checks stay in its case wherever they run. A feature or fix whose
  behavior no case holds gets a case file of its own rather than growing
  a neighbor — cited by its file name, its items numbered from 1, its line
  added under its group in the index in the same change — and a case that
  has come to hold several is split, every item keeping its number as a
  `### <section>.<item>` heading so older references still resolve. The
  **whole checklist runs only when the user asks for it** — never on a
  session's own initiative: not after a release, not after a Zotero
  update, not because a batch of features landed, however much changed.
  Those are the occasions the user may choose to ask on; the file exists
  so that when they do, nothing is left out. The first full pass was the
  1.10.1 bug hunt of 2026-08-31 (issues #31–#39), on request.
- **Retain live test methods incrementally** (settled 2026-09-12):
  `test/zotero-dev/README.md` indexes the case files, baseline, and cleanup;
  `limitations.md` holds both human-only checks and coverage gaps. Do not
  create a separate `manual.md`. Preserve existing case numbers when moving
  checks so prior reports and cross-references remain usable.
  For every new live test, retain the scripts that actually ran, together
  with prerequisites, fixtures, expected output, permitted state changes,
  and restoration steps: **the tester writes them itself** (settled
  2026-09-14) into the case's kit, successful scripts included even though
  the short report omits them, and the main session reviews the diff and
  commits. **Zotero runs a kit from disk** (settled 2026-09-14):
  `test/zotero-dev/scripts/_shared/run.js` loads a group of scripts by
  path, runs them in the background and hands back capped results, the
  full ones under `.tmp/zotero-dev/<runId>/results/`, so a script's text
  never passes through the tester's context and a script may outlast the
  bridge's 30 s timeout (a call that does comes back as a bare
  `undefined`, and so does a throw — measured 2026-09-14: 12 s returned,
  35 s did not; the ~8 s window believed until then was throws). Measured on the 2026-09-13 angle-brackets
  verification: 44 kit files read into the context (50k tokens) before
  the first bridge call, 254k characters of scripts retyped as tool
  input, 58M context tokens processed in 73 minutes. Scripts read their
  inputs from `Zotero.ZoteroTTSRun.params` / `.state` and hard-code no
  path and no item id; the steps every kit repeats live in `_shared/`,
  moved there from the kit that ran them.
  **No run archive** (settled 2026-09-14; `test/zotero-dev/runs/`
  was deleted that day and is in the history before it): a run's report
  is its table — a verification's on the issue's closing comment, a
  research run's in the issue's evidence, a user-requested full pass's in
  that day's NOTES entry — and a failed attempt leaves one line under the
  kit README's limits, not a file. `test/zotero-dev/` exists so the next
  run repeats the check; the kits exist so it costs fewer tokens.
  Research probes go to `.tmp/zotero-dev/<topic>/` (gitignored, one
  worktree's scratch) and never into `test/zotero-dev/`. Never commit
  credentials or raw preference snapshots.
  **One scripts folder per case** (settled 2026-09-13): `cases/<name>.md`
  keeps its reusable scripts in `test/zotero-dev/scripts/<name>/`, which
  holds a `README.md` and the scripts and nothing else — no subfolder per
  run, build or issue, and never a second folder beside it, except
  `_shared/`, the one folder no case owns: the runner and the steps every
  kit uses. The folder is
  the case's current kit: a run that revised a script replaces it there, a
  new check adds its script, a script that no longer works or is no longer
  needed leaves, and only scripts that ran successfully are in it. The
  README, written by the tester with the scripts, is a table first and at
  most 150 lines (settled 2026-09-14: it is read whole on every run, and
  one had grown to 12k tokens; a kit over the cap is trimmed by the run
  that next uses it) and gives the order, what each script checks and
  expects, the params it reads, the state it touches, the cleanup, the
  limits, and the case's runs — date, build,
  the issue comment holding the table, the items each observed PASS or
  FAIL and any NOT TESTABLE attempts — with the run each script was last
  executed in; the next run of the case starts there, and the case file
  links it and names a run only where an expected output or limitation
  comes from it. A run covering several cases updates the kit of each
  case it produced a reusable script for. The tester writes under
  `test/zotero-dev/scripts/` and nowhere else in the repository — never
  `cases/`, `src/`, `notes/` or `MEMORY/`. A new case gets its folder and
  README with its first verification run.
  Do not rerun tests for this documentation reorganization or backfill
  unverified scripts. Backfill existing cases incrementally during the next
  full pass the user requests, from the scripts and observations of that
  run. Reuse preparation methods, not old PASS results: a new full pass
  checks every case again. Continuing an interrupted run first verifies
  build identity, environment, and restored state; changed conditions
  invalidate affected results, and the failure/rebuild rule above still
  applies. Keep per-case baseline and cleanup rather than sharing
  unverified temporary state across cases.
- **The user takes over only** when a check needs a human — how a voice
  sounds, whether the word highlight keeps pace, how the popup behaves in
  motion (screenshots are static; nothing here records) — or when the
  bridge is down (`zotero_ping` fails: Zotero needs a restart, which only
  the user can do; `netstat -ano -p tcp | grep 6100` shows whether the
  listener is up). Then a hand round in the old form: at most 3
  self-contained steps, each with (1) what to do in Zotero, naming the UI
  by what it says on screen — "tab 1" / "tab 2", "the player" for the Read
  Aloud popup, "the language dropdown", "the ♥ next to Azure-Brandon" —
  never a letter or a variable name for a thing on screen; (2) the
  **complete** Run JavaScript code pasted in full in that step, never "the
  diagnostic code" or "as above", saying whether "Run as async function"
  must be checked; (3) the expected output field by field and what a
  deviation would mean. Snippets pick out the fields that matter (wrap
  `Zotero.ZoteroTTS.diagnostics.*` and `JSON.parse` its result) and name
  readers by the item's title, never by itemID.

## Diagnostics and test servers

Diagnostics run through the bridge's
`zotero_execute_js` (chrome context: `Zotero`, `Zotero.Reader._readers`,
`reader._internalReader`, the plugin's `Zotero.ZoteroTTS`; return a string
or JSON to read the result) — the same scope as the user's **Tools →
Developer → Run JavaScript**, the fallback when the bridge is down.
`Zotero.ZoteroTTS.diagnostics.highlight()` reports what highlight-style.ts
sees. For logs, `zotero_read_logs` / `zotero_read_errors`, grepped for
`[zotero-tts]` and `JavaScript Error`; without the bridge, ask for Help →
Debug Output Logging → View Output (the user saves it as an .htm).

- Kokoro-FastAPI for testing: read the plugin's `local.baseURL` pref before
  assuming an address — on 2026-08-28 it pointed at a remote Kokoro
  (`https://h200-kokoro.xujialiu.top`, reachable from Zotero) while the
  Windows machine's Docker container (`kokoro`, GPU image,
  http://localhost:8880, Docker Desktop) was not running. On macOS use the
  CPU image or the native `start-gpu_mac.sh` (see README).
