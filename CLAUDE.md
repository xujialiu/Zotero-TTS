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
  body). `PHILOSOPHY.md` — the plugin is an enhancer for Read Aloud, not a
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

## Commands (Node 22, ESM)

```
npm test              # vitest, ~340 tests, includes test/build.test.ts which runs the build
npm run typecheck     # tsc --noEmit
npm run build         # esbuild → addon/content/zotero-tts.js, zip → build/zotero-tts.xpi
```

After any change: tests, typecheck, build — then the user installs the xpi
(Tools → Plugins → Install from file) and restarts Zotero.

## Releasing

Installed copies auto-update through the manifest's `update_url`, which
points at `update.json` on `main`. A release is these three steps, and
skipping the third strands every installed copy on the old version:

1. Bump the version in **both** `package.json` and `addon/manifest.json`
   (run `npm install --package-lock-only`); tests, typecheck, build.
2. Commit (`chore: release X.Y.Z`), tag `vX.Y.Z`, push with the tag, then
   `gh release create vX.Y.Z build/zotero-tts.xpi` — the asset must be
   named `zotero-tts.xpi`.
3. Update `update.json` on `main`: `version`, and `update_link` to
   `https://github.com/xujialiu/Zotero-TTS/releases/download/vX.Y.Z/zotero-tts.xpi`.

Verify: the `update_link` answers 200 and the raw `update_url` serves the
new version; Zotero's Tools → Plugins → gear → "Check for Plugin Updates"
should then offer it. Zotero cannot be
driven from here, but the user will run snippets on request in **Tools →
Developer → Run JavaScript** (chrome context: `Zotero`, `Zotero.Reader._readers`,
`reader._internalReader`, the plugin's `Zotero.ZoteroTTS`; return a string or
JSON to read the result) — ask for that first, it is faster than logs.
`Zotero.ZoteroTTS.diagnostics.highlight()` reports what highlight-style.ts
sees. For logs, ask for Help → Debug Output Logging → View Output (the user
saves it as an .htm) and grep it for `[zotero-tts]` and `JavaScript Error`.

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
- Kokoro-FastAPI for local testing: on the Windows machine it runs in Docker
  Desktop (container `kokoro`, GPU image, http://localhost:8880). On macOS use
  the CPU image or the native `start-gpu_mac.sh` (see README).

## Layout and rules

```
src/core/           pure logic, no Zotero globals: settings (DEFAULTS ↔ addon/prefs.js,
                    pinned by test/prefs-defaults.test.ts), providers/{openai,azure,local/kokoro},
                    shortcuts, shortcut-actions, read-aloud-speed, settings-backup,
                    webdav, reader-theme, timeout
src/read-aloud/     the Read Aloud integration: index (intercepts Zotero.Reader._readers and
                    overrides _getReadAloudRemoteInterface per reader), remote-interface
                    (composite of Zotero's native interface + our voices), voice-catalog,
                    catalog, read-aloud-memory (+ memory-sync: one voice/speed across documents),
                    highlight-style (Zotero's highlight colors, sentence under word),
                    system-voices (hide Zotero's own Local voices)
src/ui/             prefs pane (prefs-pane, shortcut-rows, backup-rows, webdav-rows,
                    server-preset-rows, highlight-rows, shortcut-recorder),
                    read-aloud-shortcuts, speed-toast
src/index.ts        bootstrap wiring; with core/settings.createZoteroPrefs and ui/prefs-pane the
                    only code that touches Zotero globals (declared in src/globals.d.ts)
addon/              manifest.json, bootstrap.js, prefs.js (defaults), content/preferences.xhtml
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
  `extensions.zotero.`; observers fire synchronously inside `set`.
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
