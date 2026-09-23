# Built for the way its author reads, and leaving Read Aloud one piece at a time

*The engineering half of this decision is
[ADR 0003](../adr/0003-built-to-the-owners-preference-moving-off-read-aloud.md).*

Zotero-TTS used to describe itself as an add-on to Zotero's own reading-aloud
feature, one that should shrink as Zotero caught up. That is no longer what it
is. It is its author's own tool for listening to papers and novels every day,
and it is steadily replacing the parts of Zotero's feature that do not suit
that author. The rules it is measured against are in
[the plugin's philosophy](../PHILOSOPHY.md); this file records why the direction
changed, and where it stops.

## Where it stops

One part stays Zotero's for good: working out a document's layout — which text
is the body and which is a header, a footer or a citation, and how a paragraph
carries on across columns and pages. Zotero does this with heavy machinery
that it maintains for far more than reading aloud. Rebuilding it would be a
project of its own, and a worse copy of something that already works.

Everything after that — cutting the text into sentences, producing and playing
the sound, marking the words on the page, scrolling along, remembering the
place, the controls — can move to the plugin, and moves when the owner wants
it to work differently. Nothing says in advance that all of it will.

## Whose requests get built

The owner's preference decides what is built. Someone else's request is
welcome, and is built when the owner likes it and it does not get in the
owner's way; when it will not be built, that is said and the request is
closed. A bug is fixed by how bad it is, whoever hit it.

## What was turned down

- **Naming who it is for.** Presenting the plugin as a tool for readers with
  dyslexia or poor sight was considered and dropped. The owner's own
  preference is the only standard.
- **Writing down the destination.** "One day the plugin plays everything
  itself" is not written down as the goal. Each step is decided when it is
  taken.
- **Listing what is wrong with Zotero's feature.** The choices the owner
  dislikes are not named; the plugin changes them instead.
- **Staying small.** The old promise — add, never take away, and step aside
  when Zotero catches up — is gone. The plugin now takes pieces over.

## What it costs

Removing the plugin still leaves Zotero working, but no longer exactly as it
was before: the plugin already writes into Zotero's own memory of which voice
was chosen. And every piece taken over is one more thing the plugin, not
Zotero, has to keep working.
