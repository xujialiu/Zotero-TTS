# CLAUDE.md — zotero-tts

Zotero 10 plugin that adds voices to Zotero's built-in **Read Aloud**: OpenAI
(or any OpenAI-compatible server), Azure Speech, and a local Kokoro-FastAPI.
Zotero's own Standard/Premium voices keep working; ours join the Local tier as
`TTS-<Provider>-<voice>`. Also: shortcuts for the speed (Shift+Z/X/C) and for
skipping by sentence / paragraph (arrows / Shift+arrows), one voice and speed
across documents, settings backup/restore (file or WebDAV), highlight colors.

- `README.md` — user-facing docs, kept short and scannable (header with
  badges, a GIF, emoji feature list, install, providers table, settings;
  long detail goes into `<details>` blocks or `tutorials/`, never into the
  body). **After editing any `.md` under the repo, run `npm run docs`** — it
  renders every doc to `docs/` (gitignored), the source tree mirrored; tell
  the user which `docs/….html` to open.
  `PHILOSOPHY.md` — the plugin is an enhancer for Read Aloud, not a
  replacement; the yardstick for new features.
  `tutorials/` — Azure's free tier, Kokoro-FastAPI and Chatterbox-TTS-Server
  in Docker, remote access through Cloudflare. Provider and server how-tos
  go there, not into the README.
- `notes/NOTES.md` — engineering notes: every production incident, and the Zotero
  internals verified by reading its source. **Read it before touching Read
  Aloud internals; append to it (English) whenever something non-obvious is
  learned or broken.** `notes/NOTES_SUPPLEMENTARY.md` — one-time setup logs and
  overtaken lists moved out of NOTES.md; history, not required reading.
  Both live in `notes/`.

## Working with the user

- Reply in **Chinese**, always, whatever language the input (logs, source,
  instructions) is in. Everything else is **English only, American
  spelling** (color, gray, license, -ize) — code, identifiers, comments,
  commit messages, README, NOTES.md. Verbatim
  product strings (Azure's "多语言" voice names, the rendered "多语种"
  label) and test fixtures for the Chinese collation are data, not prose,
  and stay as they are.
- Architecture-level forks: present the options with concrete costs and a
  recommendation, then wait. Implementation details: pick the sane default,
  state it in one line, move on.
- Research first when asked to: report findings, do not change code.
- Commit only when told ("commit"); push only when told. Simple work
  (docs, wording, one-liners) goes directly on `main`; only hard work
  (bug fixes, features) gets a `feat/...`/`fix/...` branch, merged into
  `main` with `--ff-only` when told. Commit
  messages: `feat: …` / `fix: …` / `docs: …` / `chore: …`, as short as
  possible — usually the subject line alone; a body only when the why is
  not obvious, and then a line or two, never a long description. No
  `Co-Authored-By` trailer.
- Before any push: scan the history for keys (`sk-…`, 32-hex, `ghp_…`).
  Never echo an API key into the conversation or a file. Zotero's
  `prefs.js` holds the user's keys in plaintext — grep it only for the exact
  pref you need, never print whole lines.
- **Only a Fable session delegates** (settled 2026-08-28, gated
  2026-08-28): the `git-chores` and `zotero-tester` agents run Opus at
  maximum reasoning effort, which is worth a round trip only to a session
  running Fable. Every other model — this one included — does that work
  itself, here, in place: no subagent, the whole run in view. The agent
  files stay the rule book either way; read
  `.claude/agents/git-chores.md` / `.claude/agents/zotero-tester.md`
  before doing their work by hand.
- **Git housekeeping** (settled 2026-08-28): committing what is in the
  working tree, deleting merged branches locally and on origin, tagging,
  pushing, and `--ff-only` merges follow `.claude/agents/git-chores.md`.
  A Fable session hands them to `Agent` with `subagent_type:
  "git-chores"` — told exactly what to commit, with which message, and
  what to leave in the working tree — then confirms the report against
  `git log` / `git status`. Only a merge that does not fast-forward —
  conflicts, a diverged `main` — is never handed over at all, and a
  resolution that is a judgment call is asked about. Agent definitions
  under `.claude/agents/` are read when a session starts: one added
  mid-session is "not found" until the next session — then use
  `general-purpose` with `model: "opus"` and the agent file's rules
  pasted into the prompt.

## Commands (Node 22, ESM)

```
npm test              # vitest, ~340 tests, includes test/build.test.ts which runs the build
npm run typecheck     # tsc --noEmit
npm run build         # esbuild → addon/content/zotero-tts.js, zip → build/zotero-tts.xpi
npm run docs          # pandoc → docs/*.html, the Markdown rendered for the browser
```

After any change: tests, typecheck, build — then the xpi goes into the
running Zotero through the zotero-dev bridge (`zotero_plugin_install`
upgrades it in place, no restart) and the live verification below runs
there.

**Test builds carry a beta version.** Every xpi built for testing sets
`addon/manifest.json`'s `version` to the next version plus `-beta`
(`1.7.4-beta`), and a second test build of the same version counts up
(`-beta2`, `-beta3`, …), so Tools → Plugins shows at a glance which build is
actually installed. `package.json` stays at the released version — it is not
what Zotero displays, and leaving it alone keeps the lock file out of it.

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

## Verifying a branch live

The running Zotero is driven from here through the **zotero-dev MCP
bridge** — `introfini/mcp-server-zotero-dev` (MCP server `zotero-dev`,
tools `mcp__zotero-dev__*`) plus the *MCP Bridge for Zotero* plugin, which
opens RDP on 127.0.0.1:6100 when Zotero starts. Settled 2026-08-28, after
the provider-toggle feature was verified end to end this way. Before a
feature branch is merged, its new behavior is verified in Zotero like
this:

- **The driving rules are `.claude/agents/zotero-tester.md`** (the
  bridge's tools, how to drive them, what to report). A Fable session
  hands the pass to `Agent` with `subagent_type: "zotero-tester"` — the
  xpi path, the behaviors to verify, the diagnostics to run with their
  expected output, and what state it may touch — and confirms the
  reported evidence (traces, pref values, screenshots) field by field,
  which keeps its tokens for the work. Any other model drives the bridge
  here, by those same rules, and budgets for the traces and screenshots
  landing in this context.
- **Plan first.** List every new behavior on the branch and the check that
  covers it; name what only unit tests can cover and why, and what only a
  human can judge. Work the list until it is empty, then a last pass for
  whatever was fixed along the way. A failure stops the pass: fix, rebuild,
  reinstall, re-run from the first check.
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

## Releasing

Installed copies auto-update through the manifest's `update_url`, which
points at `update.json` on `main`. A release is these three steps, and
skipping the third strands every installed copy on the old version:

1. Bump the version in **both** `package.json` and `addon/manifest.json`
   to the clean `X.Y.Z`, dropping any `-beta` suffix left by a test build
   (run `npm install --package-lock-only`); tests, typecheck, build.
2. Commit (`chore: release X.Y.Z`), tag `vX.Y.Z`, push with the tag, then
   `gh release create vX.Y.Z build/zotero-tts.xpi` — the asset must be
   named `zotero-tts.xpi`.
3. Update `update.json` on `main`: `version`, and `update_link` to
   `https://github.com/xujialiu/Zotero-TTS/releases/download/vX.Y.Z/zotero-tts.xpi`.

Verify: the `update_link` answers 200 and the raw `update_url` serves the
new version; Zotero's Tools → Plugins → gear → "Check for Plugin Updates"
should then offer it. Diagnostics run through the bridge's
`zotero_execute_js` (chrome context: `Zotero`, `Zotero.Reader._readers`,
`reader._internalReader`, the plugin's `Zotero.ZoteroTTS`; return a string
or JSON to read the result) — the same scope as the user's **Tools →
Developer → Run JavaScript**, the fallback when the bridge is down.
`Zotero.ZoteroTTS.diagnostics.highlight()` reports what highlight-style.ts
sees. For logs, `zotero_read_logs` / `zotero_read_errors`, grepped for
`[zotero-tts]` and `JavaScript Error`; without the bridge, ask for Help →
Debug Output Logging → View Output (the user saves it as an .htm).

Platform notes:
- Windows: the Bash tool is Git Bash; long `cat <<'EOF'` heredocs have failed
  with "unexpected EOF" — write files with the Write tool or a Python
  heredoc. Paths: `$HOME/Works/...` in Bash, `C:\Users\...` for tools that need it.
- macOS: zsh; same npm commands; no Git Bash quirks.
- Zotero source for verification: unpack the installed `omni.ja` into the
  scratch directory (`unzip -q` or Python `zipfile`) —
  Windows `C:\Program Files\Zotero\app\omni.ja`,
  macOS `/Applications/Zotero.app/Contents/Resources/app/omni.ja`.
  Reader bundle: `resource/reader/reader.js` (~85k lines; grep, then `sed -n`
  ranges); chrome side: `chrome/content/zotero/xpcom/reader.js`; prefs:
  `defaults/preferences/zotero.js`; plugin sandbox: `xpcom/plugins.js`.
- Zotero profile prefs: Windows `%APPDATA%\Zotero\Zotero\Profiles\*\prefs.js`,
  macOS `~/Library/Application Support/Zotero/Profiles/*/prefs.js`.
- Kokoro-FastAPI for testing: read the plugin's `local.baseURL` pref before
  assuming an address — on 2026-08-28 it pointed at a remote Kokoro
  (`https://h200-kokoro.xujialiu.top`, reachable from Zotero) while the
  Windows machine's Docker container (`kokoro`, GPU image,
  http://localhost:8880, Docker Desktop) was not running. On macOS use the
  CPU image or the native `start-gpu_mac.sh` (see README).

## Layout and rules

```
src/core/           pure logic, no Zotero globals: settings (DEFAULTS ↔ addon/prefs.js,
                    pinned by test/prefs-defaults.test.ts), providers/{openai,azure,local/kokoro},
                    shortcuts, shortcut-actions, read-aloud-speed, settings-backup,
                    webdav, reader-theme, timeout
src/read-aloud/     the Read Aloud integration: index (intercepts Zotero.Reader._readers and
                    overrides _getReadAloudRemoteInterface per reader), remote-interface
                    (composite of Zotero's native interface + our voices), voice-catalog,
                    catalog, read-aloud-memory (+ memory-sync: one voice/speed across documents
                    and open tabs; default-speed / default-voice: what the voice browser sets),
                    highlight-style (Zotero's highlight colors, sentence under word),
                    system-voices (hide Zotero's own Local voices)
src/ui/             prefs pane (prefs-pane, shortcut-rows, backup-rows, webdav-rows,
                    server-preset-rows, highlight-rows, shortcut-recorder, voice-browser-rows,
                    reading-guard: no new voice while a tab reads), read-aloud-shortcuts, speed-toast
src/index.ts        bootstrap wiring; with core/settings.createZoteroPrefs and ui/prefs-pane the
                    only code that touches Zotero globals (declared in src/globals.d.ts)
addon/              manifest.json, bootstrap.js, prefs.js (defaults), content/preferences.xhtml,
                    content/preferences.css (the ? icons, registered with the pane)
test/               mirrors src/; vitest
assets/             README media (the word-highlight GIF, popup and settings screenshots)
```

- TDD: write the failing test first. Zotero-facing code takes its Zotero
  bits as injected deps so the logic is unit-testable (see `memory-sync.ts`,
  `backup-rows.ts`, `read-aloud-shortcuts.ts` for the pattern).
- Every network call goes through `core/timeout.withTimeout`; failures are
  reported as errors, never left hanging (user rule: fail loudly, never hang).
- Never fabricate per-word timestamps; a voice without them falls back to
  sentence highlighting (`remote-interface.wholeSegmentTimestamp`).
- Providers are enabled independently; OpenAI voices/models are never
  hard-coded as the only option (many servers are OpenAI-compatible).
- Preference pane: no `scripts` in the pane registration — Zotero runs them
  before the markup exists. Everything initializes from the root
  `<vbox onload="Zotero.ZoteroTTS.prefsPane.onPaneLoad(document)">`.
  `preference=`-bound inputs redraw themselves on pref change; unbound rows
  (shortcuts) expose a `refresh()`.

## Zotero pitfalls that have already cost a round-trip

- **Sandbox whitelist**: the plugin scope has no `WebSocket`, `AbortController`
  or `caches`; take them from `reader._window`. It does get `Zotero`,
  `Services`, `ChromeUtils`, `IOUtils`, `PathUtils`, `setTimeout`, `fetch`,
  `atob`/`btoa`, `TextEncoder`/`TextDecoder`, `URL`, `DOMParser`, `crypto`,
  `XMLHttpRequest` (the list: `wantGlobalProperties` in `xpcom/plugins.js`).
- **Compartments**: the reader iframe may not call a bare sandbox function
  (export it with `Components.utils.exportFunction`) nor read a sandbox object
  ("Permission denied to access property …"). Hand reader code primitives
  only; call reader functions with `Reflect.apply`, not `fn.apply`, so the
  argument array stays on our side. Never call `fn.apply` on a reader
  function with sandbox arguments. Inside an exported function, `this` and
  the arguments arrive behind Xray wrappers: a plain object's prototype
  methods are invisible and assignments land on the wrapper — waive them
  (`Components.utils.waiveXrays`) or use references captured on our side;
  objects reached from our side (`reader._internalReader…`) are fine.
- **`Zotero.Prefs.set`** writes through the type the pref is declared with in
  `prefs.js`: an int pref goes through `setIntPref`, which cannot hold a
  fraction — a `preference=`-bound number input hands it "1.5" and the pref
  stays 1 (why the old Speed setting never worked; store a string or a
  percentage instead). Only an undeclared pref takes its type from
  `typeof value`, and a fraction then throws. Undeclared prefs read as
  `undefined`.
  `Zotero.Prefs.registerObserver(name, fn)` takes names relative to
  `extensions.zotero.`; observers fire synchronously inside `set`, **in
  registration order** — a reader opened after the plugin started hears a
  write *after* the plugin does, so inside our observer its
  `_state.readAloudVoices` is still the old value (memory-sync refreshes
  it before resyncing a reader). A `set` with an **unchanged value notifies
  nobody**: a popup pick that re-persists what the entry already holds (the
  only voice under a language) is invisible to a pref observer — memory-sync
  hooks the manager's `selectVoice`/`selectTier`/`setLanguage` for those.
- **`FilePicker`** (`chrome://zotero/content/modules/filePicker.mjs`): the
  chosen path is `fp.file` (a string); there is no `fp.path`.
- **Read Aloud**: `reader._internalReader._readAloudManager` — `active` means
  "session open" (paused keeps it true), speaking is `active && !paused`;
  `setSpeed(speed, persist)` — never persist on an idle manager, it starts
  playback; `skipBack/skipAhead('sentence' | 'paragraph', accelerate)` are
  the popup's skip buttons, followed by `_lockPositionToReadAloud()`. Choices persist in `extensions.zotero.reader.readAloudVoices`,
  keyed by the *detected* base language (`mul` for "Multiple languages");
  `_syncPersistedVoicesToManager` restores them. Highlight colors are
  constants in the bundle (`READ_ALOUD_ACTIVE_SEGMENT_COLOR` / `…SENTENCE_COLOR`),
  reached only by shadowing prototype methods per reader (highlight-style.ts);
  each reader tab has its own bundle and classes. Tiers are hard-coded
  standard/premium/local; unknown tiers are dropped. Word mode draws only
  real word timestamps.
- **Kokoro-FastAPI**: `/dev/captioned_speech` needs `stream: false`;
  `/v1/audio/voices` returns `{ voices: [{ id, name }] }`.
- The Zotero 9 internals used by the user's older standalone plugin
  (`view._readAloud.state.controller.speed`) do not exist in Zotero 10.
