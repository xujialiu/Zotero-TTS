# Speed and sound stay exactly as they are

*The engineering half of this decision is
[ADR 0006](../adr/0006-the-engine-copies-read-alouds-time-stretch-and-sound-chain.md).*

Two things decide how a voice sounds in the plugin today, and both are
Zotero's work. One is the way speech is sped up or slowed down without the
voice going higher or lower. The other is a light treatment of the sound on
its way out: trimming low rumble, lifting the range where speech is
clearest, and evening out how loud different voices are. The plugin's
engine takes both over exactly as Zotero wrote them. Zotero and the plugin
are published under the same license, and that license allows it.

## What you get

A voice sounds the same as it does today, at normal speed and at every
other speed — not close to the same, the same. Nobody has to compare by ear
whether the new engine sounds right, because nothing about the sound has
changed.

## What was turned down

The program Zotero is built on can speed speech up and slow it down by
itself, with far less work for the plugin. It does so in its own way,
though, and at every speed other than normal the voices would sound
different: perhaps better, perhaps worse. With no switch back to the old
sound, that difference could only be judged from memory, at the same time
as listening for anything else the new engine got wrong. How the voices
sound is worth changing only on purpose, as a decision of its own, later.

## What it costs

- **Volume still stops at 100%.** The step that evens out loudness is what
  swallowed half of every boost above 100%, which is why the volume stops
  there today. It stays, so the limit stays. If a voice is ever too quiet
  to follow, that will be a decision of its own.
- **Zotero's later improvements do not arrive by themselves.** If Zotero
  changes the way it alters speed, the plugin keeps the version it took
  until someone brings the new one over on purpose.
