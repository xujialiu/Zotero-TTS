---
status: accepted
date: 2026-09-26
issue: 146
---

# Each document keeps its voice

*The product argument is [design 0009](../design/0009-each-document-keeps-its-voice.md).*

Voice identity consists of the catalog ID, which includes the provider for
plugin voices, and its language lane. A document is a Zotero attachment,
identified across computers by `user/<attachment key>` or
`group-<group ID>/<attachment key>`. Computer-local library IDs and the
content-derived EPUB Document Id used for positions are unsuitable: the
former differ between computers, while the latter joins separate copies
that must keep independent voice choices.

The global default lives in `readAloud.defaultVoice`, part of the ordinary
settings backup and sync set. A one-time migration copies the existing
global voice from `readAloud.memory`; it never guesses from native
per-language entries. The migration marker prevents a cleared default
from being resurrected. Speed retains its existing memory and behavior.

Document records live under `documentVoices.<identity>`, one small
preference per attachment, rather than one growing preference. Each holds
`voice`, `manual`, and `ts`. This avoids the single-value size limit that
forced positions out of preferences (#14), while keeping voice reads and
writes synchronous at the reader's activation boundary. The settings
backup enumerates this branch and validates every imported record.

The existing shared settings file carries each document record as its
own item. Manual records outrank inherited records regardless of age;
records of equal intent compare modification time, then canonical voice
identity to resolve ties consistently. Local manual changes use a time
strictly later than the record they replace. A separate local preference
pulse schedules the existing sync and backup debounce without promoting
an inherited or downloaded record to a manual choice. Old clients carry
these unknown settings through their merge rather than deleting them.

## Reader boundary

The adapter initializes records when a reader opens, including before its
internal reader exists. `memory-sync` restores the document voice through
the existing language-lane and tier staging. Committed player picks write
the document record; voice-handoff previews do not. Active sessions retain
a separate voice snapshot, including while paused; incoming sync becomes
effective on the next activation after deactivation.

Verified in the installed Zotero 10.0.3 reader bundle:
`activate` (82550) requests segments, `play` (82558) can activate directly,
and `_createController` (82653) requests audio through the selected voice.
`_onReadAloudEngineStateChanged` (83870) also automatically activates a
selected voice while the popup is open. Guarding only the visible Play
button would therefore still allow implicit fallback audio. Both
activation and controller creation are guarded, and an unavailable
selection clears the native fallback's selected ID to prevent the native
auto-activation loop. The saved document record remains intact.

The settings voice browser now writes only the global default. Its row
selection no longer writes Zotero's per-language entries or changes open
readers. The former shared-voice checkbox is removed from the pane; its
old preference remains readable for older backups but does not control
the Zotero adapter's document-voice behavior.

## Verification

Pure tests cover independent initialization, manual precedence, recency
and ties, malformed records, backup/restore, one-time migration, session
deferral, and missing-voice activation/controller guards. The live case
is `test/zotero-dev/cases/document-voices.md`; the sandbox diagnostic is
`Zotero.ZoteroTTS.diagnostics.documentVoices()`.
