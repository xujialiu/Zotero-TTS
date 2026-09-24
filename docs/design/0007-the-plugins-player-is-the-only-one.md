# The plugin's player is the only one

*The engineering half of this decision is
[ADR 0007](../adr/0007-zoteros-own-player-stays-in-the-page-hidden.md).*

Until now a setting, *Use plugin player*, chose which player a document
showed: the plugin's, which was the default, or Zotero's own. Since every
voice plays on the plugin's engine (design 0005), Zotero's own player had
become a second set of controls over the same reading. From this decision
on the plugin's player is shown for every reading, the setting is gone, and
nothing brings Zotero's own player back while the plugin is installed.

It comes in the same update as the plugin's own engine, not one update
later as first planned: the owner had read with the engine's test version
and found nothing wrong.

## What you will notice

Nothing, if the setting was on, as it is unless you changed it. If you had
turned it off:

- **The plugin's player appears instead of Zotero's** the first time you
  read after the update. There is no message about it; the release notes
  say so.
- **Every way of starting to read opens it**, as it already did with the
  setting on: the toolbar button, Zotero's keyboard shortcut, Shift+Space
  and *Read Aloud from Here*.
- **The sample that ignored the volume is gone.** Zotero's player played a
  short sample when you picked a voice in it while paused, at Zotero's own
  loudness whatever the plugin's volume said. The samples in the settings'
  voice browser follow the volume, as before.
- **No annotate button.** Zotero's player had one for highlighting or
  underlining the sentence being read. The plugin's player has none; the H
  and U keys still do it while reading, with the document in focus.
- **No credits display, for now.** Zotero's player showed what is left of
  your Zotero credits, warned when little was left, and linked to buying
  more. The plugin's player shows none of that yet (#140); until it does,
  the settings say credits are bought on zotero.org.

## When something goes wrong

- **The plugin's player cannot appear.** If a Zotero update, or a fault of
  the plugin's own, keeps the player from loading in a document, Zotero's
  player does not step in. Reading does not start, and a message says the
  player could not load and that turning Zotero-TTS off under Tools →
  Plugins gives you Zotero's own Read Aloud back in the meantime.
- **The plugin updates while you read.** The reading stops at its sentence,
  as design 0005 decided. The player closes and stays closed, and Zotero's
  player no longer shows for the moments the update takes. Click the
  toolbar button and the reading carries on from that sentence.

## Why

- **One player to keep right.** Every change to reading had to work in both
  players, and Zotero's needed a share of the plugin of its own: marks on
  its voice list, its options panel opened by itself, its first dropdown
  rewritten. All of that goes.
- **The setting had little left to do.** With every voice on the plugin's
  engine, Zotero's player could only show the same reading, and the one
  thing it did differently — the sample at Zotero's loudness — was a fault.
  A setting must do something.

## What stays

Zotero's player is not taken out of the document, only never shown: the
keyboard's media keys, the system's now-playing controls, the highlight and
the scrolling along with the reading all rest on it being there. The rest of
Read Aloud stays Zotero's as design 0005 left it: where each sentence begins
and ends, the marking on the page, following, keeping your place, and the
voice catalog.

## What it costs you

- **No way back inside the plugin.** If the plugin's player breaks in some
  Zotero, the only way to read aloud there is to turn the plugin off until
  it is fixed.
- **Two things only Zotero's player had are gone for now**: the credits
  display, which #140 will decide, and the annotate button, whose keys
  remain.

## What was turned down

- **Keep the setting.** Two players to keep right, for a second set of
  controls and a sample that ignored the volume.
- **Let Zotero's player step in when the plugin's cannot appear.** Reading
  would carry on, but Zotero's player would have to be kept working with
  the plugin's voices, unseen and untried until the day it was needed, and
  a broken plugin player would go unnoticed.
- **Reopen the player by itself after an update.** A little more to build;
  your place is kept either way, and one click brings the player back.
- **Take Zotero's player out of the document altogether.** The media keys,
  the now-playing controls and the highlight would first have to be rebuilt
  by the plugin.
