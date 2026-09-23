# The plugin plays its own voices

*The engineering half of this decision is
[ADR 0005](../adr/0005-the-engine-sits-behind-read-alouds-manager.md).*

Until now every voice in the player, the plugin's and Zotero's alike, has
been played by Zotero's own Read Aloud. The plugin found the voices and
fetched their speech; turning that speech into sound, one sentence after
another, was Read Aloud's work. From this decision on, the plugin does that
itself, for every voice in the player. The part that does it is the engine:
fetching a sentence's audio before it is needed, changing the speed, the
pause between sentences, playing, pausing, skipping, and what happens when
audio does not arrive. Nobody ever sees it.

## What you will notice

Almost nothing, in the first version. The same voices at the same speed,
sounding the same, with the same pause between sentences, the same volume,
the same skipping, and the same way of changing voice in the middle of a
sentence. Three things differ on purpose:

- **The marked word keeps time with the voice.** Today it is timed by a
  stopwatch started with the sentence, so on wireless headphones it lights
  up a moment before you hear the word, and it carries on if the sound
  stalls. It now follows the sound itself.
- **Five small faults are gone.** Going back to a sentence you once paused
  on no longer starts it halfway or skips it; one failed early fetch no
  longer stops the reading a sentence later; audio that cannot be played
  now says so, and Retry works; closing right after a skip no longer
  fetches, or bills, the sentence you skipped to; and a reading started
  without your own click or key press no longer plays silently. You would
  only meet these when something goes wrong.
- **An update of the plugin pauses the reading.** Today a reading carries on
  while the plugin updates underneath it. Now it stops at the sentence it
  was on; press play, and the new version carries on from there.

If anything else sounds or behaves differently, that is a defect, not a
feature.

## Why change something that works

Because of how it works. Read Aloud was not built to do several things the
plugin wanted, so the plugin has been reaching inside Read Aloud's engine
to make it do them:

- a volume of its own, which Read Aloud does not have;
- a pause between sentences you choose, for every voice;
- a change of voice that carries on from the next word instead of starting
  the sentence again;
- a "preparing" notice while the next audio is on its way;
- fetching further ahead than Read Aloud does, so a slow server of your own
  leaves no gaps.

Each of these relies on the inside of Read Aloud's engine staying exactly
as it is. Zotero is free to rearrange that inside in any update, and nothing
would warn anyone: the volume, the pause or the voice change would simply
stop working, silently. That is the kind of feature this plugin has decided
not to carry.

The problems you have already met came from the same place:

- reopening the player started the first sentence over, a second in;
- a scene break made only of asterisks stopped the reading without a word,
  and Retry did nothing;
- turning the volume above 100% changed nothing, and in the end could not
  be allowed;
- changing voice while reading started the sentence again;
- a service that turns requests away for coming too fast is reported as an
  allowance that has run out.

Each was fixed by reaching further inside. With an engine of its own, all
of that becomes ordinary parts of the plugin, and a Zotero update cannot
quietly undo any of it.

## What this step leaves alone

- Deciding where each sentence begins and ends, which stays Zotero's.
- Marking the sentence and the word on the page, which stays Zotero's.
- Scrolling the page along with the reading, and keeping your place: the
  plugin already has its say in both, and neither changes here.
- The voice catalog: the voices the player offers, and the voice
  remembered for each language. It stays Zotero's until the next step.

## The Zotero voices

Zotero's own voices, Standard and Premium, move to the plugin's engine too.
Their speech still comes from Zotero, asked for the same way and at the same
pace as today, so Zotero keeps its copies and bills them exactly as before:
not one sentence more. Leaving them on Zotero's side would have meant
keeping, for them alone, most of the reaching inside that this change
removes, and changing voice between one of them and one of the plugin's
would have started the sentence again.

You have both switched off, so your own listening will not try them. The
tester does: a few sentences with each, on your account, which uses a
little of your Zotero credit — you agreed to that — and both are switched
off again afterwards. If no credit is left, the tester checks what happens
when it runs out instead.

## What comes next

The voice catalog moves to the plugin. Read Aloud's engine plays only voices
from Zotero's own catalog, which is why the plugin's voices have had to be
slipped into it — and why, for a while, they disappeared for anyone not
signed in to a Zotero account (#130). Once the plugin plays its own voices,
the catalog can be the plugin's own: no Zotero account needed for it, and no
refusing a change to the voice settings while a document is being read.
That is the next decision, not this one.

Later, each decided on its own: messages that say which service failed and
why, and fetching ahead by as much as each service can take, rather than by
one setting for all of them.

## What it costs you

- **No way back inside the plugin.** There is no switch to return to Read
  Aloud's engine. If the plugin's engine gets something wrong, the way back
  is to install the previous version.
- **So the beta is listened to before it ships.** The tester first checks,
  on the beta, a list of everything that must stay the same. Then you read
  with it, papers and novels as usual, until you say it is ready.
- **A stretch with nothing new.** The work is about the size of the part of
  Read Aloud it replaces, and the first version is built to change nothing
  you hear. What it buys comes after: fewer things that break quietly when
  Zotero updates, and the steps above.

## What was turned down

- **Keep reaching inside Read Aloud's engine.** Nothing to build now; every
  Zotero update stays a gamble, and each new wish in this area means
  reaching further in.
- **Replace everything of Read Aloud's at once**: where sentences begin and
  end, the marking on the page, and the playing. Much larger, and when
  something sounded wrong there would be no telling which half caused it.
- **Move the voice catalog first.** Not possible: as long as Read Aloud's
  engine plays the sound, it plays only voices from Zotero's own catalog.
- **Copy even the faults.** The first version would have matched today down
  to its failures, and the marked word would still run ahead of the voice.
- **Leave the Zotero voices on Zotero's side.** Most of the reaching inside
  would have stayed, just for them, and changing between one of them and a
  plugin voice would have started the sentence over.
