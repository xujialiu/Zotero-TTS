# design

Why Zotero-TTS is the way it is, written for someone who does not read code.

Every file here is one decision: what was chosen, what was turned down, and
what that costs the person using the plugin. You should be able to read any of
them end to end without knowing what a prototype patch or a sample rate is. If
you hit a sentence that needs one, that is a defect in the file — the
engineering half of the same decision lives in [`../adr/`](../adr/), and that
is where such a sentence belongs.

## What the plugin is

A plugin for Zotero 10 that reads documents aloud — papers and novels — with
voices from the text-to-speech services the owner chooses and pays for
directly, from a server of the owner's own, or from the operating system, and
that keeps the place in each document across the owner's computers and their
phone.

It began as extra voices for Zotero's own Read Aloud, and it is moving off Read
Aloud piece by piece: each piece that moves is a decision recorded here.
Everything it relies on belongs to the owner — the provider, the keys, and the
server that keeps positions and settings in step.

## The yardstick

From [`../PHILOSOPHY.md`](../PHILOSOPHY.md), which everything here is measured
against:

> **I build Zotero-TTS for the way I read, and step by step it is moving off
> Zotero's Read Aloud.**

The owner listens to papers and novels with the plugin every day, and a feature
is built because the owner wants it. One thing stays Zotero's on purpose: the
analysis of a document's layout — which text is the body, and how a paragraph
runs on across columns and pages — which Zotero maintains for more than reading
aloud. When a file here explains a cost being paid, it is usually paid for one
of that page's rules: honest signals, bring your own provider, no silent
spending, uninstalling is safe, every hook written down, a setting must do
something.

## How to read a decision

Each file is numbered, and the same number in [`../adr/`](../adr/) is the same
decision written for engineers and AI agents. Not every decision has both
halves: a purely technical one has no file here, a purely product one has none
there. A number is spent on a decision, not on a file, so a gap is not a
mistake.

Four other places hold things that are deliberately **not** here:

| | |
| --- | --- |
| [`../PHILOSOPHY.md`](../PHILOSOPHY.md) | The yardstick. What the plugin is for, and what stays out of it |
| [`../../CONTEXT.md`](../../CONTEXT.md) | The glossary. What each word means, and which words to avoid |
| [`../../notes/`](../../notes/) | What was measured, and when |
| [The issues](https://github.com/xujialiu/Zotero-TTS/issues) | Each piece of work as it happened: the plan, what changed on the way, how it was checked |

The glossary is worth ten minutes before anything else. Its words are used
strictly — a **Provider** is one source of voices, a **Segment** is one
sentence with its place in the document, the **Engine** is everything between
the segments and the highlight, and **Read Aloud** means Zotero's own part and
nothing of the plugin's. Files here use those words and no synonyms, because
the same words are used in the code and the issues.
