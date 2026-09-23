---
status: accepted
date: 2026-09-13
issue: 98
---

# Correctness fixes need no user switch, starting with Fish Audio's short-text language hint

*The product argument — what this is for and what it gives up — is
[design 0001](../design/0001-correctness-fixes-need-no-user-switch.md).*

A fix for a provider that reads correct text wrongly is applied by the
plugin, always, with no preference and no control in the pane. Settings are
kept for choices the owner could make either way. The first such fix is a
language hint in front of short text sent to Fish Audio; Fish Speech, the
same model on a server of the user's own, is left out (ADR 0002).

## The rule

`fishLanguageHint` (`src/core/fish-language-hint.ts`) returns
`[Speak in <name>]`, plus a space unless the text already starts with
whitespace, when the speech text has **one to three** word-like segments.
`src/read-aloud/remote-interface.ts:359` asks for it only when the provider
id is `fish`, and `src/core/providers/fish.ts:681` prepends it to the API
text only.

- **Counting**: `Intl.Segmenter(<locale>, { granularity: 'word' })` over the
  speech text after bracket preparation (#94, #96, #101), counting
  `isWordLike` segments. Numbers count, punctuation does not: `100 exp` is
  two words, `2/50 HP` three. Exactly four, or none, gets no hint.
- **Naming**: `Intl.DisplayNames(['en'], { type: 'language', fallback:
  'none' })` of the locale's base name, so `en-US` gives "American English".
- **No hint** when the locale is missing or unparseable, when its language is
  `mul`, `und` or `zxx`, when it carries extensions or a private-use part
  (`tag.toString() !== tag.baseName`), or when it has no English name. A
  throw returns no hint rather than stopping speech.
- **Whose locale**: the requested voice's (installed reader.js 40452–40453,
  notes/NOTES_2026-09-13.md, 13:15), not the manager's selected voice, so a
  prepared voice handoff (#95) carries the target voice's language.
- **Timings**: Fish's word timings are aligned against the unprefixed speech
  text, then the bracket offsets are restored; the hint never enters document
  coordinates.
- **Cache**: the hint is part of the cache and in-flight identity
  (`remote-interface.ts:360–361`), and prefetch captures the requested locale.
- **Who else**: samples, Fish Speech, Kokoro, every other provider and the
  Zotero voices get none. The debug line
  `fish: language hint [Speak in …] for short speech` marks a cued request.

## What was measured

The owner heard Fish Audio's Dax (`en-US`, model `s2.1-pro-free`, speed 1.4)
read `100 exp` as something like "cn xp" and `2/50 HP` as "2/50 GP" in an
EPUB (notes/NOTES_2026-09-13.md, 12:46). Requests captured before the network
carried the right characters (` 100 exp`, ` 2/50 HP `, brackets removed); the
request had no language field, and each stat went alone, without the prose
around it. Fish documents automatic language detection for S2.1 and no
language selector on the timestamp endpoint.

Six files, and the owner's listening (12:55): the two original cached clips
and two fresh bare syntheses were wrong; the two with
`[Speak in American English]` prepended were right. Fish's returned content
and word alignment did not contain the cue. That settles these two samples
only — not that the wrong audio was another language, not four as a general
threshold, not other voices or locales. The comparison was made at 128 kbps;
production stays at 64 kbps, and the live pass on 1.12.6-beta2 used real
64 kbps requests (14:03).

## Turned down

- **A settings switch.** A correct reading is not a preference; a switch
  would leave the fix to whoever finds it and the fault to everyone else.
- **Global acronym replacement**, **undocumented API language fields** and
  **fabricated word timings**.
- **Inferring the language of a voice that reports none** — the Fish Speech
  case, left to ADR 0002.

## Consequences

Four words or more are sent bare, so a four-word line that goes wrong is not
caught; the threshold came from the owner's two samples and was not
validated more widely. Any later fix of the same kind follows this rule and
ships without a setting.
