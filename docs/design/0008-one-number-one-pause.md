# One number, one pause

*The engineering half of this decision is
[ADR 0008](../adr/0008-the-paragraph-pause-is-the-whole-pause.md).*

The settings have two pauses: one between sentences, one where a paragraph
begins. Until now the paragraph number was an extra, added on top of the
sentence pause. From now on it is the whole pause where a paragraph begins,
and the sentence pause does not apply there. A switch that is off means no
pause at all, for either of them.

## What you get

- **What you type is what you hear.** A sentence pause of 300 and a
  paragraph pause of 600 give 300 ms between sentences and 600 ms where a
  paragraph begins. Before, the paragraph would have got 900, and you had to
  do the subtraction yourself to get 600.
- **Changing one pause leaves the other alone.** Raising the sentence pause
  no longer lengthens every paragraph pause behind your back.
- **The phone and the computer agree.** The reading app on the phone reads
  the same two numbers the same way, so the same numbers give the same
  pauses on both.
- **A paragraph pause can be the shorter one.** A sentence pause of 500 and
  a paragraph pause of 200 play exactly as set.
- **Off is off.** A switch that is off gives no pause there, for every
  voice, instead of handing that pause back to Zotero, which paused
  differently from voice to voice.

## What was turned down

- **Off returns Zotero's own pause.** Faithful to Zotero, but Zotero's own
  pause depends on the voice: three of its Premium voices would still pause
  longer than all the others, with nothing on screen to say why.
- **Off gives a fixed 200 ms.** The same for every voice, but a switch
  marked off that still pauses is a switch that does not say what it does.
- **Keep the paragraph pause at least as long as the sentence pause.** The
  paragraph setting would then do nothing below that point, or change by
  itself when the sentence pause moved.

## What it costs

- **Anyone who set a sentence pause hears shorter paragraph pauses.** The
  starting values, 0 and 200, sound exactly as before. Someone who raised
  the sentence pause to 300 used to hear 500 at a paragraph and now hears
  200, until they enter the paragraph pause they want. Stored values are not
  converted, because an older settings backup restored later could not be
  told apart.
- **Three Premium voices lose their own pause with the sentence switch
  off.** They used to pause a little between sentences by Zotero's design;
  now off means none for them too. Setting the sentence pause brings a
  pause back, for every voice alike.
