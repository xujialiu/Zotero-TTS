# A voice that reads correct text wrongly is fixed, not given a setting

*The engineering half of this decision is
[ADR 0001](../adr/0001-correctness-fixes-need-no-user-switch.md).*

When a voice is sent text that is right on the page and says it wrong, the
plugin corrects that on its own. There is no switch for it in the settings.
Settings are for choices the owner could make either way; a wrong reading is
not one of them.

## What the owner heard

A novel printed a character's stats on lines of their own — "100 exp",
"2/50 HP". Fish Audio's English voice Dax read them as something like
"cn xp" and "2/50 GP". The text the plugin sent was exactly what the page
said. Fish works out which language to speak from the text itself, and two or
three words are not enough for it to be sure.

The owner listened to the same two lines read six ways. Every version sent as
it was came out wrong. Both versions sent with a short note in front — "Speak
in American English" — came out right.

## What the plugin does now

When a Fish Audio voice is about to read one to three words, the plugin puts
that note in front of them, naming the voice's own language. The note is not
spoken, and nothing is highlighted for it: the highlight still lands on the
words on the page.

Numbers count as words and punctuation does not, so "2/50 HP" is three words
and is helped, while "You gained 100 exp." is four and is left alone. A voice
that speaks several languages, or one whose language is not known, gets no
note, because there is no one language to name.

## What was turned down

**A switch in the settings.** It would have been easy to add "help short
phrases" and leave it to the owner. Then the fix would work only for someone
who finds the switch, understands it and turns it on, and everyone else would
keep hearing "cn xp". A switch that exists only because a voice misbehaves is
a question the owner should never have to answer.

## What it costs

- **Four words or more are never helped.** A four-word line that goes wrong
  is still read wrong. The line was drawn where the owner's two examples fell,
  not proven in general.
- **Only Fish Audio gets the note.** The same model running on a server of the
  owner's own does not say which language its voices speak, so it waits for a
  decision of its own (design 0002).
