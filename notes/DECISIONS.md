# Zotero-TTS — product decisions

[Engineering notes](NOTES.md)

Keep each entry to the decision, its reason, key thresholds and exceptions,
and a related issue. Detailed evidence and implementation history belong in
the dated notes and issues.

## Correctness fixes need no user switch (2026-09-13 13:02, issue #98)

Handle provider pronunciation fixes internally; reserve settings for meaningful
user preferences. For Fish cloud, automatically add a locale-based
language hint when the speech text has **fewer than 4 words** (1–3; numbers
count, punctuation does not). Exactly 4 words do not trigger it. Skip the hint
when the requested voice locale is unknown or multilingual. No new setting.

## Defer Local until its language source is decided (2026-09-13 13:14, issue #99)

Fish Speech Local voices have no locale metadata. Defer its pronunciation
fix and language-source decision to #99; #98 changes Fish cloud only.

## Built to the owner's preference, moving off Read Aloud (2026-09-15 14:31, issue #109)

The owner's own preference is the only yardstick; no reader group is named.
The plugin moves off Zotero's Read Aloud step by step, and Zotero keeps the
document analysis, which is too heavy to redo. No end state (a player of
our own) is written down. Requests are built when the owner likes them and
they do not get in the way; bugs are fixed by severity, whoever hits them.
The rules are in [docs/PHILOSOPHY.md](../docs/PHILOSOPHY.md).
