---
status: accepted
date: 2026-09-23
---

# Decisions, findings and the product argument are recorded separately

This repo keeps them in four places, plus the issues. `docs/design/` holds a
decision's trade-off as someone who does not read code needs it — the owner,
reading as a product manager. `docs/adr/` holds the technical decision and the
measured facts that forced it, for engineers and AI agents. `notes/` holds what
was measured and when: `NOTES.md`, the standing reference, and the dated log.
`CONTEXT.md` is the glossary and holds none of them. GitHub issues stay what
they were, the running log of one piece of work (`MEMORY/issues.md`).

`docs/design/` and `docs/adr/` are paired by number — `docs/design/0005-…` and
`docs/adr/0005-…` are one decision written for two readers — and not every
decision has both halves. Which half a sentence belongs to is mechanical: strip
every API name, file path, type, library and version from it, and if it stops
making sense it is an ADR sentence. The working rules are in
`MEMORY/docs.md`.

The shape is OpenReader's, the owner's phone reader, which set it up in its own
ADR 0015. The two projects share a provider layer and the WebDAV sync format,
and a reader with both repositories open should find them laid out the same
way.

## Why now

For its first month the plugin's decisions were few and mostly implicit in the
code. The findings behind them went to the dated notes — thirty files by
2026-09-22 — while `notes/DECISIONS.md` gathered three entries. That fitted a
plugin that added voices to Zotero's Read Aloud and otherwise left it alone.

Since 2026-09-15 (issue #109) the plugin is moving off Read Aloud piece by
piece. Every piece that moves — the player first, the engine next — is a real
choice between keeping Zotero's and writing the plugin's own, with a product
cost the owner decides and an engineering cost an agent has to carry. Decisions
have become frequent, and they have two readers who were reading past each
other: the owner, deciding what to build, skips the paragraph on which private
method of Zotero's controller a patch shadows; the agent building it skims the
argument the owner already settled. Splitting them costs a second file per
decision and buys each reader a document that is entirely theirs.

## What moved

`notes/DECISIONS.md` is retired. Its three entries became records 0001–0003,
in the order they were decided, each split into the halves it has. Nothing but
the link at the top of `notes/NOTES.md` pointed at the file, and that link now
points here. This record moves nothing else: the reasoning behind earlier
choices stays where it was written, in the dated notes and on the issues.

`CONTEXT.md` began as the glossary drafted while mapping what could be
separated from Read Aloud. It names each piece of reading aloud — document
analysis, segmentation, the engine, the highlight, following, the player, the
position, the voice catalog — so that a design file, an ADR, an issue and the
code use one word for one thing.

## The risk of the split

The one OpenReader named: **a measured detail paraphrased away while being
moved.** This repository's value is concentrated in sentences that read like
pointless caveats — that Zotero's compressor turns a +6 dB boost into +3 dB on
an ordinary voice (#70), that a Kokoro-FastAPI server speaks a rewritten text
and returns the words of that text (#86), that a reader-realm array's `find`
given a sandbox callback answers `undefined` without a throw (#75). When a
decision is split, those sentences stay in the ADR as written; the design file
is new writing, not a translation of it.

## Consequences

- A decision earns a record when all three hold: reversing it would be costly,
  a later reader would wonder why, and there really was a choice. A finding
  with no choice in it is a note; a choice missing one of the three is
  neither.
- A record is written the moment the decision settles — in a grill, an issue's
  plan or plain chat — not at the end of the work that follows it.
- The records are English, hard-wrapped, untranslated and off the public site:
  `test/docs-translation.test.ts` covers only docs/'s top-level pages, and
  `scripts/render-md.mjs` renders docs/'s subfolders and `CONTEXT.md` for the
  browser preview.
