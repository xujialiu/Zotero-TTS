# Zotero-TTS

The language of Zotero-TTS, a Zotero 10 plugin that reads documents aloud
with the user's own text-to-speech services. The plugin began on Zotero's
Read Aloud and is moving off it piece by piece, so this glossary names each
piece of reading aloud and the things around it. Definitions only: what was
decided and why is in `docs/design/` (for the owner) and `docs/adr/` (for
engineers and agents), what was measured and when in `notes/`.

## Language

### The pieces of reading aloud

**Document analysis**:
Zotero's reading of a document's layout: which text is body text and which
is a header, footer or citation, and how a paragraph continues across
columns and pages. Always Zotero's.
_Avoid_: SDT, structure, layout analysis

**Segmentation**:
Cutting the body text into the sentences that are read one at a time, and
telling the language of the text.
_Avoid_: sentence splitting, chunking

**Segment**:
One unit of reading: a sentence, with its place in the document.
_Avoid_: chunk

**Engine**:
Everything between the segments and the highlight: fetching a segment's
audio, reading ahead, decoding, changing speed, the pause between sentences,
playing, pausing, skipping, and what happens when audio fails. It is never
visible. Said alone, it is the plugin's own; Zotero's is Read Aloud's engine.
_Avoid_: controller, manager, backend, player

**Handoff**:
The reading passing from one voice to another without stopping: at a word
both voices time, otherwise at the start of the next sentence.
_Avoid_: swap, transition

**Highlight**:
The marking of the sentence and the word being read, drawn on the page.
_Avoid_: spotlight

**Follow**:
Scrolling the document so the sentence being read stays on screen, and
the choice between automatic and manual following.
_Avoid_: tracking

**Player**:
The visible controls: play, pause, skip, speed, volume, the provider,
language and voice choices.
_Avoid_: popup (Zotero's own player), panel, bar (the names of its layouts)

**Layout**:
Where the player sits: the Top bar under the toolbar, the Bottom bar, or
the Floating panel. "Bar" and "panel" name a layout, never the player
itself.
_Avoid_: position (where reading stopped), variant

**Position**:
Where reading stopped in a document, kept so that reading resumes there on
the same computer, another computer or a phone.
_Avoid_: bookmark, progress

**Voice catalog**:
The voices the player offers: every enabled provider's voices, with
favorites and the remembered choice per language.
_Avoid_: voice list (the per-tab snapshot of it)

### Sources of voices

**Provider**:
One source of voices and audio the plugin can be pointed at: a service, a
server of the user's own, or the operating system. Each has a section in
the settings and, while it has voices, an entry in the player.
_Avoid_: vendor, engine, backend, tier

**Entry**:
One item of the player's first dropdown: a provider that has voices, or
one of Zotero's own two.
_Avoid_: tier (Zotero's word for its own three), voice mode

**Zotero voices**:
The voices Zotero itself sells, Zotero Standard and Zotero Premium, paid
with credits on a Zotero account.
_Avoid_: native voices, cloud voices, official voices

### Zotero's side and the plugin's

**Read Aloud**:
Zotero 10's own built-in reading feature: its player, engine,
segmentation, highlight and position. The name is used for Zotero's part
only.
_Avoid_: TTS (the technology), reader

**Reading**:
The plugin's own reading of a document, from the player through the
engine to the highlight, that runs without Read Aloud.
_Avoid_: playback, Read Aloud

**Reading session**:
One document being read, from play to stop, in one reader tab. One at a
time across all tabs.
_Avoid_: playback, stream
