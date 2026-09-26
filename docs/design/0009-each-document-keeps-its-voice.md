# Each document keeps its voice

*The engineering half is [ADR 0009](../adr/0009-each-document-keeps-its-voice.md).*

The global default voice supplies a document's initial voice when it is
first opened. From then on, that document keeps its own voice, even if the
owner has never changed it. Changing the global default later does not
change voices in documents that already have one.

Only the voice is covered by this decision. Speed, volume, pauses,
highlight, follow, and player layout keep their existing scope.

## What counts as one document

Separate documents under the same library item keep separate voices: a
PDF and an EPUB, or two translations, do not share a voice choice.
Reopening the same document, including in another window, uses the same
document voice.

## Choosing voices

The global default is chosen in settings. Choosing a voice in the player
changes only the current document's voice, without changing the global
default or any other document.

There is one global default voice, shared across languages. A document
inherits that choice regardless of its language; the owner can choose a
different document voice when needed.

On upgrade, the existing global voice choice becomes the global default.
If there is no existing choice, including on a fresh installation, the
owner is prompted to set the default before reading. No voice is picked
automatically.

If a saved voice is unavailable, its choice is retained and the owner is
asked to choose an available voice. Reading does not automatically start
with a replacement voice. Disabling a provider or losing a voice from its
catalog therefore does not silently substitute another voice.

## Existing documents and other computers

A document without a saved document voice inherits the global default on
its first open after the change, even if it was read before the update.
The previous shared voice history cannot recover a separate earlier
choice for each document.

Both the global default voice and document voices are included in settings
backup and sync. The same document retains its voice across computers.
This extends the requested backup and sync of the global default voice to
individual document choices as well.

Conflicting document voices are merged separately for each document. The
last manual choice wins, including choices made while computers were
offline. A voice inherited automatically from the global default never
overwrites a manual document choice.

An incoming synced voice choice does not change the voice in an ongoing
reading session. It is used when the next reading session starts. A voice
chosen locally in the player still takes effect immediately.

## What this gives up

One voice shared across all documents makes a new choice immediately
useful everywhere. It also means choosing a voice for a novel changes the
voice used for a paper. Independent document voices keep those choices
apart, at the cost of no longer changing existing documents by changing
the global default.

Continuing to follow the global default until a voice is manually chosen
was also possible. Copying the default on first open instead gives every
opened document the same independence, without depending on whether the
owner has touched its voice control.

Language-specific defaults would reduce manual choices when switching
between languages. One default keeps the initial choice simple; an
unsuitable voice is changed in the individual document.

Keeping document voices only on one computer would be simpler to build,
but would require choosing them again on another computer. Backup and sync
are part of this decision despite the additional work.

Applying an incoming voice choice immediately would keep computers in
closer step, but could unexpectedly change the speaker halfway through
listening. Keeping the current reading session's voice delays that change
until the next session.
