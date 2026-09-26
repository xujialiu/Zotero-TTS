---
status: accepted
date: 2026-09-26
issue: 148
---

# Estimated remaining reading time

*The product argument is [design 0010](../design/0010-estimated-remaining-reading-time.md).*

The agreed product direction is a text-based initial estimate refined by
audio obtained during ordinary reading, without additional synthesis for
measurement. The owner confirmed the complete design before implementation.

The Engine receives segments through `setSegments`
(`src/core/engine/session.ts`). The existing heuristic in
`src/core/engine/read-ahead.ts` serves prefetch ordering, not a calibrated
user-facing duration model. Provider responses do not expose a universal
duration; decoded audio supplies it through `DecodedClip.duration`
(`src/read-aloud/engine/audio-output.ts`). Synthesizing the entire document
to obtain exact durations would add provider usage and potentially spend
credits on unread text.

Use known audio durations where available and estimate the remaining text.
Account for current audio position, playback speed and the configured gaps;
manual pauses and buffering do not consume reading time. New audio may
revise the estimate in either direction. A voice change must not reuse the
previous voice's measured pace as though it belonged to the new voice.

Ordinary reading estimates to the document end and, where reliable, the
current reading section end. A selection-limited run estimates only the
selection and uses a distinct label. Run bounds and document bounds must
therefore remain distinct. Completion must also be distinguished from the
Engine's reset to the run's starting position, which would otherwise make
a finished estimate jump back to its initial value.

The Player currently has no duration fields in `PlayerSnapshot`
(`src/read-aloud/player-controller.ts`). The estimate needs an explicit
snapshot contract rather than a dependency on diagnostic output. Display
minutes in every layout, controlled by one default-on setting.

## Chapter mapping findings

Static inspection of Zotero 10.0.3's installed `omni.ja` found a shared
mapping through SDT block references. In `worker.js`, EPUB navigation or
NCX entries map to block refs (166052–166119, 166185–166226); PDF outline
processing attempts the same mapping and can also infer entries from
headings or a printed contents page (156705–156818). In `reader.js`,
`structure.catalog.outline` becomes a nested outline, with referenced
entries pointing to `#sdt-<ref>` (79896–80145). Segment start positions use
the same block references, as recorded in `notes/NOTES_2026-09-21.md`.

This makes intervals between consecutive top-level entries feasible
without new document analysis. EPUB spine items alone are not chapters;
PDF page-only destinations cannot locate a chapter starting midway down a
page. Missing, unresolved or out-of-order boundaries must leave the
section estimate unavailable. A mapped reference identifies a text
boundary, not the semantic distinction between a part and a chapter.
The owner chose the top-level entry regardless of that distinction, with
its actual title as the display label and no depth selector. The adapter is
implemented and covered by local tests; live verification is deferred at
the owner's request.

## Implementation

`RemainingTime` builds text and paragraph prefix sums once per segment
list and keeps Fenwick sums of measured durations and their replaced text
weights. A query is logarithmic in document length; it never rescans the
whole document on the Player's 250 ms refresh. The initial prior is three
space-delimited words per second and five CJK characters per second.
Decoded non-silent clips calibrate their combined weight for this voice;
known clips use their measured durations. These are listening estimates,
never word timestamps. Measurements survive eviction from the 32-clip
cache but are discarded with the voice's store. Reading-time computation
is lazy, and switching the display off bypasses it in the Player.

The Session exposes `remainingTime`, including completion independent of
its reset position, selection scope, current audio offset and the actual
outstanding gap. Future gaps use `computeGap`; a manual pause drops the
outstanding gap because that is the Engine's existing behavior. The
Zotero adapter reads `_internalReader._sdt.structure.catalog.outline` and
uses validated refs and ordered segment positions; entries without a
matching start or boundaries crossed by a segment suppress section time.
The section cache follows outline and segment identity. An outline access
failure is logged once per reader and leaves document estimation usable.

The setting `readAloud.remainingTime` uses the ordinary backup/sync path.
The Player snapshot carries localized lines. Bars retain their height;
the floating layout adds a 36 px time row, included in menu placement and
drag bounds. Engine diagnostics expose the same numerical snapshot.
