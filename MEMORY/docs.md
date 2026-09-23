# Docs — Zotero-TTS

The rules for the repository's Markdown: the README and the public site,
the Chinese pages, and the notes log. Part of the project rule book, whose
core is `MEMORY/MEMORY.md`.

## README, tutorials and the site

- `README.md` — user-facing docs, kept short and scannable (header with
  badges, a GIF, emoji feature list, install, providers table, settings;
  long detail goes into `<details>` blocks or `tutorials/`, never into the
  body). **It says the effect, never the mechanism** (settled 2026-09-07,
  the same rule as the settings pane's in `MEMORY/code.md`): every line answers what the
  reader gets, or what they have to do — how it is done stays out. Not
  which Zotero API is patched or hooked, not what a fallback path cannot
  deliver and why, not the internal numbers behind a default, not a color's
  hex or an endpoint's path, not the reasoning behind a refusal. A limit
  the reader will actually meet is an effect and stays: a key stored in
  plain text, a cache a restart empties, one WebDAV folder per computer,
  a voice that sounds different at speed. The mechanism goes to
  `notes/NOTES.md`, which is where a later session reads it.
  **Facts go in points, not paragraphs** (settled 2026-09-07): where a
  section states more than one thing, each is its own bullet, and what it
  is about — the field, the case, the setting — leads it in bold or
  italics. Prose is for a single thought: a section's lead sentence, one
  caveat, a pointer to a tutorial. A paragraph a reader has to comb
  through for the one line that applies to them is the shape this
  replaces.
- **After editing any `.md` under the repo, run `npm run docs`** — it
  renders every doc to `.docs/` (gitignored), the source tree mirrored;
  tell the user which `.docs/….html` to open. `docs/` holds pages of the
  repo (issue #109). The README and `docs/PHILOSOPHY.md` in both languages,
  and `tutorials/`, are also the public site
  https://xujialiu.github.io/Zotero-TTS/ — `npm run site` builds it into
  `site/` (gitignored), `.github/workflows/pages.yml` deploys it on every
  push to `main` that touches them (issue #57); `notes/` and the test
  checklist stay off it, and its links to them go to GitHub.
- `tutorials/` — Azure's free tier, Kokoro-FastAPI and Chatterbox-TTS-Server
  in Docker, remote access through Cloudflare. Provider and server how-tos
  go there, not into the README.

## The Chinese pages

- **The Chinese pages** (issue #29): `README.zh.md`,
  `docs/PHILOSOPHY.zh.md` (issue #109) and `tutorials/<name>.zh.md`,
  siblings of the English files, with a switcher line at the top of both.
  They are one-to-one translations — the same
  sections, the same `<details>` blocks, the same tables — and the only thing
  they add is a `> **国内网络**` blockquote in a tutorial where the English
  would mislead a reader in China (a Docker Hub or Hugging Face mirror, the
  global-vs-世纪互联 Azure split). Settings and player wording is quoted from
  the plugin's own `addon/locale/zh-CN/zotero-tts.ftl` and from Zotero's zh-CN
  files in `omni.ja` — 朗读, 语音模式, 本地 / 标准 / 高级 — never freshly
  translated; product names, voice ids, pref keys, file names and code blocks
  stay English. **A Chinese page is never hard-wrapped**: a line break between
  two CJK characters renders as a space in Chrome and Safari (measured
  2026-09-04: 164.45px wrapped, exactly the width with an explicit space,
  against 160px on one line), so one paragraph is one line, however long —
  the opposite of the English files. For the same reason a space next to
  `**`, `*` or `[` is dropped when both sides are CJK, and kept around inline
  code and Latin.
- **The translation ships in the commit that changes the English page.**
  Every `.zh.md` opens with `<!-- translated-from: X.md sha256:… -->` and
  `test/docs-translation.test.ts` fails when that hash has moved or a page has
  no translation at all; `npm run docs:pin` records the new hashes once the
  translation is up to date. A stale Chinese page therefore cannot be built
  or released. **The translating is `docs-translator`'s** (settled
  2026-09-06, issue #58): a session running Fable or Astra hands it the English
  pages that changed and their diff, and checks the diff that comes back;
  any other model translates in place by
  `.agents/docs-translator.md`.

## The notes log

- The log is `notes/NOTES_<date>.md`, one file per day. **Append to today's
  file** (a new day starts from the shape the others have: the `#` title and
  the `←/index/→` line), never rewrite a past day, and **stamp every heading
  with the date and the time it was written** — `## The voice list is a per-tab
  snapshot (2026-08-30 14:32, issue #11)`, 24-hour local time. The time is what
  orders a day's entries and ties one to the session that produced it; entries
  from before 2026-08-30 carry a date only and stay that way. When a day gains
  an entry, add it to NOTES.md's index under that day.
