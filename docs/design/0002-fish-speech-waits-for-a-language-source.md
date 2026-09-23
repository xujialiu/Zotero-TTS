# Short phrases on your own Fish Speech server are not fixed yet

*The engineering half of this decision is
[ADR 0002](../adr/0002-fish-speech-waits-for-a-language-source.md).*

Design 0001 fixed short phrases for Fish Audio's voices by telling Fish which
language to speak. The same model running on a server of the owner's own —
Fish Speech — does not get that help yet, on purpose.

## What the owner may meet meanwhile

A Fish Speech voice can still misread a line of two or three words, such as
a character's stats in a novel. In the owner's test, "100 exp" was read
correctly and "2/50 HP" was not. Told to speak English, the voice read both
correctly.

## Why it was not fixed at the same time

The fix has to name the language the voice speaks, and a Fish Speech voice
does not say. It is made from a recording, and the server offers it under a
name and nothing else — "bella", "xiaobei". The plugin lists such voices under
"Multiple languages", and the language picked in the player does not settle
it either: a voice made from an English recording can be asked to read text
in any language.

Guessing the language from the text was turned down with the Fish Audio fix,
and nothing else was decided.

## What was given up

**Fixing both at once.** The owner shipped the Fish Audio fix, whose voices'
languages are known, rather than hold it back until the harder question was
answered. Where a Fish Speech voice's language should come from is left open,
and is the owner's to decide when this comes back.
