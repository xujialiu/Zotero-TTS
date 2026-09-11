# Fish Audio: cloned voices, a free model, word highlighting

**English** · [简体中文](fish-audio.zh.md)

[Fish Audio](https://fish.audio) is a voice-cloning service: every voice on
it was made from a short recording — by its users, or by you — and its
current model, S2.1 Pro, speaks 83 languages. The plugin's **Fish Audio**
section reaches it with one API key, and Read Aloud highlights word by
word with these voices, as it does with Azure's and Kokoro's. This page:
the key, what is free and what costs, and how a voice gets into the
player.

## The key

1. Sign up at [fish.audio](https://fish.audio) and open the dashboard's
   **API** section.
2. **API Keys** → create one, name it, copy it.
3. In Zotero, **Edit → Settings → Zotero-TTS → Fish Audio**, the
   **Cloud** block: paste it into **API key**, click **Test connection**,
   then **Enable**.

## Free or paid

The block's **Use only the free model** switch is on when you start.

- *On* — every sentence is spoken by the free S2.1 Pro. It needs no
  balance on the account. Its terms, in Fish Audio's words: no cap on the
  amount of text, no guarantee of speed, and the text you send may be
  kept to improve their models. It was announced as a limited-time offer
  and has been extended more than once; it may end.
- *Off* — the paid S2.1 Pro: the same model, $15 per million bytes of
  text, about 180,000 English words; a Chinese character is three bytes.
  It is billed to the **API credit** of your account (dashboard →
  **Billing**), which is separate from the website's own credits. With
  no API credit, **Test connection** says *Insufficient API credit* and
  nothing plays until you top up or switch the free model back on.

## Voices

Voices appear under **Local** in the player, as `Fish-cloud-<name>`.
The three source switches start on and work independently.

- **Official voices.** Voices published by **Fish Official** are listed
  automatically. Community voices are added only when you enter their
  Model IDs yourself.
- **Your voices.** Voices created by your Fish Audio account are listed
  without pasting their IDs.
- **Manual voices.** Offers the voices entered in **Model IDs**. Turning
  this switch off hides them without erasing the saved IDs.
- **Model IDs.** Find a voice on the
  [Fish Audio discovery page](https://fish.audio/app/discovery/), copy its
  Model ID, and paste it here. Separate several with commas or spaces.
  The **?** beside the field points to that page. Existing pasted voice
  links still work. To edit the field, **Disable** the cloud block first,
  then **Enable** it again.
- **Changing a source.** The switches remain available while Fish Audio
  is enabled. If a player is open, changing a source asks to stop reading
  first. A duplicate voice appears only once and stays listed as long as
  an enabled source supplies it.
- **Language.** Voices are grouped by their language, or under
  *Multiple languages* when they list several.
- **Default.** The model's own voice remains available even with all three
  sources off.
- **Refresh.** Loaded lists are reused until Zotero restarts. Refresh the
  Fish Audio list to see newly created or published voices. If a refresh
  fails, the browser keeps the last successful list with a warning;
  changing the API key does not reuse another account's list.

**Test connection** counts the listed voices and checks that the model
can speak. A manually entered voice whose page has gone is listed as
*(not found)* until you remove its ID.

## Good to know

- *A sentence takes about two seconds* to arrive, the first one of a
  session a little longer; the player fetches ahead, so reading is
  continuous.
- *A very long passage* — a paragraph without a period, a table read as
  one sentence — takes proportionally longer: a minute and a half of
  speech arrives in about forty seconds.
- *What is sent* is the sentence being read, and the id of the voice.
- *Speed* is the player's own slider, as with every voice; nothing is
  regenerated.
