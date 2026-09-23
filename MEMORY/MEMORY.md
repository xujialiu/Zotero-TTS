# Project rules — Zotero-TTS

This file is the core of the shared project rule book, maintained in
version control: the rules every session needs, and a pointer to each
topic file under `MEMORY/` that holds the rest. All paths are relative to
the repository root unless stated otherwise. `AGENTS.md` is the shared
entry point for Codex and Claude Code; edit shared rules here and in the
topic files.
This is not an automatically maintained session memory file.

Zotero 10 plugin that adds voices to Zotero's built-in **Read Aloud**: OpenAI
(or any OpenAI-compatible server), Azure Speech, Cloudflare Workers AI,
Speechify, Fish Audio (its cloud and a Fish Speech server of the user's
own), and a local Kokoro-FastAPI.
Zotero's own Standard/Premium voices keep working; each of our providers is
an entry of the player's first dropdown beside them, its voices under their
own names (`af_bella` under Kokoro; issue #110 retired the Local tier and
the `Kokoro-` prefix, as issue #9 had retired `TTS-`). Also: shortcuts for the speed (Shift+Z/X/C), for skipping by
sentence / paragraph (arrows / Shift+arrows), for the word highlight on
or off (Shift+W) and for stopping Read Aloud in every tab (Shift+S), one
voice and speed across documents, settings backup/restore (file or
WebDAV), highlight colors.

## Topic files

Read a topic file in full when its trigger fires, before the work it
covers — its rules bind that work as much as this file's do:

- **Docs** — `MEMORY/docs.md`: before editing any `.md` in the repo
  (README, `docs/`, `tutorials/`, a Chinese page, `notes/`) or the public
  site.
- **Issues** — `MEMORY/issues.md`: whenever you find a bug or start a
  feature that needs a design decision, and before researching, opening,
  commenting on or closing a GitHub issue.
- **Code** — `MEMORY/code.md`: before changing `src/`, `addon/` or
  `test/`, and before reading Zotero's source or its profile.
- **Testing** — `MEMORY/testing.md`: before building an xpi to test,
  verifying a change, or driving the running Zotero through the zotero-dev
  bridge, research included. Its test WebDAV prerequisite applies before
  every live run, including Zotero-TTS and OpenReader Position work.
- **Agents** — `MEMORY/agents.md`: before delegating to an agent or doing
  its work yourself, and before editing an agent definition or workflow.
- **Git** — `MEMORY/git-workflow.md`: before any commit, merge, push, tag
  or release.

Two project documents are reached the same way:

- `notes/NOTES.md` — the standing reference: what the plugin is, the Zotero
  internals verified by reading its source, what is still open, and an index
  of the log. **Read it before touching Read Aloud internals.** The log itself
  is `notes/NOTES_<date>.md`, one file per day — every production incident and
  everything non-obvious learned or broken, in English; how an entry is
  written is in `MEMORY/docs.md`.
- `docs/PHILOSOPHY.md` — the plugin is built to the owner's own preference
  and moves off Read Aloud step by step, leaving document analysis to
  Zotero (settled 2026-09-15, issue #109); its rules are the yardstick for
  new features, and a feature they do not settle is put to the user.

## Working with the user

- **Maintain one source for shared instructions** (settled 2026-09-12,
  split into topic files 2026-09-22): `MEMORY/` holds the shared project
  rules — this file, which every session reads, and the topic files it
  points to — and each rule lives in exactly one of them. A rule every
  session needs belongs here; one that only some work needs belongs in
  that work's topic file, whose trigger above names the work, not the
  content. `AGENTS.md` is the thin shared entry point; do
  not copy the shared rules into it, and never `@`-import a topic file,
  which would load it into every session. A change to a rule that
  `zotero-tester` carries (`.agents/zotero-tester.md`, "The rules you
  carry") is mirrored there in the same change.
- Reply in **Chinese**, always, whatever language the input (logs, source,
  instructions) is in. Everything else is **English only, American
  spelling** (color, gray, license, -ize) — code, identifiers, comments,
  commit messages, README, NOTES.md. Verbatim
  product strings (Azure's "多语言" voice names, the rendered "多语种"
  label) and test fixtures for the Chinese collation are data, not prose,
  and stay as they are.
- **The plugin is called `Zotero-TTS`** (settled 2026-08-30, issue #20):
  that hyphen, that capitalization, everywhere a person reads it — the
  manifest's `name` (which is what Tools → Plugins shows), the settings
  pane's label, dialog titles, error messages, the README and tutorials,
  the rule book, NOTES.md, commits and issues. Never `Zotero TTS`, never bare
  `TTS` — `TTS` names the technology, not this plugin. The lowercase
  `zotero-tts` is a different thing, an identifier, and is never "fixed"
  to match: the plugin id `zotero-tts@xujialiu.top`, the
  `extensions.zotero.zotero-tts.*` prefs, `zotero-tts.xpi` and the bundle,
  the `[zotero-tts]` log prefix, the `zotero-tts-pane` id, the
  `zotero-tts-settings` backup format, `package.json`'s npm name. Renaming
  any of those throws away every user's settings or breaks the update
  flow, so a sweep for the display name leaves them alone. The name in the
  plugin store at zotero-chinese.com is scraped from a release's
  `manifest.json` and needs no submission of its own.
- Architecture-level forks: present the options with concrete costs and a
  recommendation, then wait. Implementation details: pick the sane default,
  state it in one line, move on.
- **A solution put to the user is said in plain words** (settled
  2026-09-06, issue #62): what it does for them, what it costs, and what
  they have to decide, in everyday language — no internals, no
  identifiers, no jargon, no file or line. A reader who does not know the
  code must be able to say yes or no to it. The mechanism, the Zotero
  internals and the files it touches go on the issue's plan comment and
  into NOTES.md, which is where a later session reads them.
- Research first when asked to: report findings, do not change code.
- Commit only when told ("commit"); push only when told. Simple work
  (docs, wording, one-liners) goes directly on `main`; only hard work
  (bug fixes, features) gets a `feat/...`/`fix/...` branch, merged into
  `main` with `--ff-only` when told. **One standing exception** (settled
  2026-09-16, issue #113): a change that is done — tests, typecheck and
  build green, docs and notes written — is committed on its branch
  before its verification brief goes to `zotero-tester`, without a
  separate "commit": the tester then verifies a committed state, the
  closing comment names that commit, and whatever the run turns up is
  fixed in a commit of its own. The push still waits for the word. No
  `Co-Authored-By` trailer; the message format is in `MEMORY/git-workflow.md`.
- Before any push: scan the history for keys (`sk-…`, 32-hex, `ghp_…`).
  Never echo an API key into the conversation or a file. Zotero's
  `prefs.js` holds the user's keys in plaintext — grep it only for the exact
  pref you need, never print whole lines.
- **A session is one issue, and it reads in batches** (measured
  2026-09-06 over the transcripts since 08-28, issue #58): a session's
  cost is its context times its calls — some 60k tokens of harness and
  rules on every call, plus its own thinking, which stays in the context
  until the next user message. So the session that closed an issue ends
  there; the next chore gets a fresh one, not a 300k context (the
  2026-08-31 session's second day cost six times what a fresh one would
  have). Everything a step needs is read in one call — never one file
  per call — and what only the agent needs (its rulebook, the checklist
  case it will run) is not read at all.

## Commands (Node 22, ESM)

```
npm test              # vitest, ~340 tests, includes test/build.test.ts which runs the build
npm run typecheck     # tsc --noEmit
npm run build         # esbuild → addon/content/zotero-tts.js, zip → build/zotero-tts.xpi
npm run docs          # pandoc → .docs/*.html, the Markdown rendered for the browser
npm run site          # the public docs site → site/, what .github/workflows/pages.yml deploys
npm run docs:pin      # record which English revision each .zh.md follows
```

**Simple requests do not need testing** (settled 2026-09-13): for small,
straightforward changes such as settings labels, help text, documentation,
or formatting, review the diff and finish. Do not run tests, typecheck,
builds, or live Zotero verification, or delegate testing, unless the user
explicitly asks. When a commit is requested, commit after reviewing the diff.
Every other change is built and verified by `MEMORY/testing.md`.

Platform notes:
- Windows: the Bash tool is Git Bash; long `cat <<'EOF'` heredocs have failed
  with "unexpected EOF" — write files with the Write tool or a Python
  heredoc. Paths: `$HOME/Works/...` in Bash, `C:\Users\...` for tools that need it.
- macOS: zsh; same npm commands; no Git Bash quirks.
