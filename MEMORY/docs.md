# Docs — Zotero-TTS

The rules for the repository's Markdown: where a thing gets written down,
the README and the public site, the Chinese pages, and the notes log. Part
of the project rule book, whose core is `MEMORY/MEMORY.md`.

## Where a thing gets written down

Five places (settled 2026-09-23, ADR 0004; the shape is OpenReader's).
Putting something in the wrong one is how it stops being read.

|                | Who reads it                          | What it holds                                          |
| -------------- | ------------------------------------- | ------------------------------------------------------ |
| `docs/design/` | Someone who does not read code        | The trade-off: what was chosen, what was given up      |
| `docs/adr/`    | Engineers and AI agents               | The technical decision, and the facts that forced it   |
| `notes/`       | A later session                       | What was measured and when: `NOTES.md`, the dated log  |
| `CONTEXT.md`   | Everyone                              | The glossary, and nothing else                         |
| GitHub issues  | Whoever works the change              | The running log of one piece of work (`issues.md`)     |

- **`docs/design/` — the product argument.** A reader who does not know
  the code — the owner, reading as a product manager — reads any file end
  to end and knows what was decided and what it costs. The alternative
  that was turned down is written in the user's terms: what they would
  have seen, what would have gone wrong, what they would have had to do
  instead. **Never here**: an API name, a file path,
  a type, a library, a version number, a code fence, a stack trace. The
  test is mechanical — strip those from a sentence, and if it stops making
  sense it is an ADR sentence. A design file is new writing, not a
  translation of its ADR, and has no front matter: the status is recorded
  once, in the ADR. `docs/design/README.md` is the reader's way in.
- **`docs/adr/` — the engineering record.** What was actually done and
  the facts that forced it, the Zotero internals cited by file and line.
  Front matter: `status` (`proposed`, `accepted`, `superseded by NNNN`),
  `date`, and `issue` when there is one. A measured detail is the most
  valuable sentence in it — that Zotero's compressor turns a +6 dB boost
  into +3 dB, that a Kokoro-FastAPI server returns the words of a text it
  rewrote — and is **never paraphrased away**, when the record is split,
  moved or rewritten. A sentence that reads like a pointless caveat is
  usually a scar.
- **Paired by number.** Four digits: `docs/design/0005-…` and
  `docs/adr/0005-…` are one decision written for two readers, with the
  same slug where it reads naturally; each opens with an italic line
  pointing to the other half. Not every decision has both: a purely
  technical one has only an ADR, a purely product one only a design file.
  The number is spent on the decision either way — a gap is not a
  mistake, and a number never means two decisions. The next number is the
  highest in either folder plus one. `notes/DECISIONS.md` is retired; its
  three entries are records 0001–0003.
- **What earns a record**: reversing it would be costly, a later reader
  would wonder why, and there really was a choice — all three. A finding
  with no choice in it is a note; a choice missing one of the three is
  neither.
- **`CONTEXT.md` — the glossary.** A term, what it means, and the words
  to avoid for it. No implementation, no decisions, no scratch notes: a
  definition that needs a sentence about how something works is too long,
  and that sentence belongs in an ADR. Its words are used strictly — in
  the code, the issues and every file above.
- **Written down the moment it settles** — in a grill, an issue's plan or
  plain chat — in the file it belongs in, never batched for a later sweep.
  A decision is not a note even when a measurement forced it: the note
  says what was seen, the ADR what was then chosen.
- These files are **English only** and hard-wrapped like the rest of the
  repo's Markdown. They are not translated (`test/docs-translation.test.ts`
  covers only docs/'s top-level pages) and not on the public site;
  `npm run docs` renders them with everything else.

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
