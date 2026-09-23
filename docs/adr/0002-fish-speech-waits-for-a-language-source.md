---
status: accepted
date: 2026-09-13
issue: 99
---

# Fish Speech's pronunciation fix waits until its voices have a language

*The product argument — what this is for and what it gives up — is
[design 0002](../design/0002-fish-speech-waits-for-a-language-source.md).*

ADR 0001's language hint is applied to Fish Audio (provider id `fish`) only.
Fish Speech, the same model on a server of the user's own, gets no hint and
no substitute until the owner decides where its voices' language comes from.
Issue #99 stays open for that decision; #98 changed nothing in Fish Speech's
requests.

## Why the cloud rule cannot simply be extended

A Fish Speech server lists its references by id and nothing else — on the
owner's H200 deployment, `bella` and `xiaobei` — with no locale. The plugin
files them under "Multiple languages" (`mul`), and `fishLanguageHint` returns
nothing for `mul` by design, so the rule would be inert here even if the
provider check were widened. The player's selected language does not name a
reference's language either: a reference is a recording, and the text it is
asked to read can be in any language.

## What was measured

On 2026-09-13 (notes/NOTES_2026-09-13.md, 12:58 and 13:15) the owner's saved
Fish Speech URL and extra headers were used directly, with the provider left
disabled. The English reference `bella` synthesized both stats bare and with
`[Speak in American English]`, through the provider's normal body
(`format: mp3`, `normalize: true`, `use_memory_cache: on`). All four requests
returned `200 audio/mpeg` in 1.85–1.97 s and decoded.

The owner's listening (issue #99): `100 exp` was right both ways; `2/50 HP`
was wrong bare and right with the cue. `en-US` was the experiment's choice,
not a value the server reported for `bella`, and the server's model was not
queried. Four samples establish neither the cause nor reliability for other
references or languages.

## Consequences

Short numeric text read by a Fish Speech voice can still be mispronounced.
How the intended language is established for a voice with no metadata is
undecided; inferring it from the text was turned down with ADR 0001 and stays
turned down until #99 settles it.
