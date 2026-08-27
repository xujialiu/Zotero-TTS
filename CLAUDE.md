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

## Commands (Node 22, ESM)

```
npm test              # vitest, ~340 tests, includes test/build.test.ts which runs the build
npm run typecheck     # tsc --noEmit
npm run build         # esbuild → addon/content/zotero-tts.js, zip → build/zotero-tts.xpi
npm run docs          # pandoc → docs/*.html, the Markdown rendered for the browser
```

After any change: tests, typecheck, build — then the user installs the xpi
(Tools → Plugins → Install from file) and restarts Zotero.

**Test builds carry a beta version.** Every xpi built for testing sets
`addon/manifest.json`'s `version` to the next version plus `-beta`
(`1.7.4-beta`), and a second test build of the same version counts up
(`-beta2`, `-beta3`, …), so Tools → Plugins shows at a glance which build is
actually installed. `package.json` stays at the released version — it is not
what Zotero displays, and leaving it alone keeps the lock file out of it.

**Every xpi handed over comes with a Run JavaScript verification snippet
and its expected output** — proof that the *mechanism* works, not only the
visible effect. A fix that merely looks right may be working by accident
(2026-08-26, multilingual-first: the dropdown looked fixed while
diagnostics showed the patch absent — the "fix" and the symptom's cause
had not actually met); every such delivery quietly turns into debt.
Prefer `Zotero.ZoteroTTS.diagnostics.*`, which runs inside the plugin
sandbox — plain Run JavaScript is chrome scope and cannot reproduce the
sandbox's view. A purely visual change states that instead, and names
exactly what to check by eye.

## Verifying a branch live, step by step

Before a feature branch is merged, the user verifies its new behavior in
Zotero, in rounds; the plugin cannot be driven from here. The form was
settled on 2026-08-27, after a round that said "run the diagnostic code"
was rejected as unclear:

- **Plan first.** List every new behavior on the branch and the round and
  step that covers it; name what only unit tests can cover (not
  reproducible by hand) and why. Work the list until it is empty, then
  a last round for whatever was fixed along the way.
- **At most 3 steps per round.** Send one round, wait for the user's
  pasted output, confirm it field by field or diagnose, then the next
  round. A failure stops the round: fix, rebuild, hand over the xpi, and
  re-issue the round from its first step.
- **Every step is self-contained.** (1) What to do in Zotero, naming the
  UI by what it says on screen — "tab 1" / "tab 2" for the documents,
  "the player" for the Read Aloud popup, "the language dropdown", "the ♥
  next to Azure-Brandon" — never a letter or a variable name for a thing
  on screen. (2) The **complete** Run JavaScript code, pasted in full in
  that step even when the previous step used the same code — never "the
  diagnostic code", "as above" or a name for a snippet; say whether "Run
  as async function" must be checked (`Zotero.Debug.get` needs it). (3)
  The expected output, field by field, and what a deviation would mean.
- Snippets pick out the fields that matter (wrap
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
                    catalog, read-aloud-memory (+ memory-sync: one voice/speed across documents
                    and open tabs; default-speed / default-voice: what the voice browser sets),
                    highlight-style (Zotero's highlight colors, sentence under word),
                    system-voices (hide Zotero's own Local voices)
src/ui/             prefs pane (prefs-pane, shortcut-rows, backup-rows, webdav-rows,
                    server-preset-rows, highlight-rows, shortcut-recorder, voice-browser-rows,
                    reading-guard: no new voice while a tab reads), read-aloud-shortcuts, speed-toast
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
