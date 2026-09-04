<h1 align="center">Zotero-TTS</h1>

<p align="center"><em>An enhancer for Zotero 10's Read Aloud: more voices in its Local tier, word-and-sentence highlighting in your colors, keyboard shortcuts.</em></p>

<p align="center">
  <a href="https://www.zotero.org"><img src="https://img.shields.io/badge/Zotero-10-green?style=flat-square&logo=zotero&logoColor=CC2936" alt="Zotero 10"></a>
  <a href="https://github.com/xujialiu/Zotero-TTS/releases/latest"><img src="https://img.shields.io/github/v/release/xujialiu/Zotero-TTS?style=flat-square&label=Release" alt="Latest release"></a>
  <a href="https://github.com/xujialiu/Zotero-TTS/releases"><img src="https://img.shields.io/github/downloads/xujialiu/Zotero-TTS/total?style=flat-square&label=Downloads" alt="Downloads"></a>
  <a href="https://github.com/xujialiu/Zotero-TTS/commits/main"><img src="https://img.shields.io/github/last-commit/xujialiu/Zotero-TTS?style=flat-square&label=Last%20commit" alt="Last commit"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square" alt="License"></a>
</p>

<p align="center"><img src="assets/word-highlight.gif" width="720" alt="Read Aloud reading a paragraph: the word being read in blue, its sentence in yellow"></p>

## What is this?

Zotero 10 reads documents aloud on its own. This plugin does not replace
that — it enhances it. Zotero keeps doing the reading: the player, the
sentence segmentation, the skip buttons, the highlighting, its Standard and
Premium voices. The plugin adds voices to its Local tier and adjusts a few
things around the edges. Why it is built this way: [PHILOSOPHY.md](PHILOSOPHY.md).

## What it adds

- 🗣️ **More voices in the Local tier** of the Read Aloud player — Azure Speech, a [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) on your machine, OpenAI or any OpenAI-compatible server — next to Zotero's Standard and Premium voices. [→ Providers](#providers)
- 🖥️ **Your Windows voices, promoted** — the ones Read Aloud already lists, but taken over by the plugin so they get the voice browser, samples, favorites, the cache *and* word-level highlighting, which Zotero's own path cannot do for them. [→ System voices](#system-voices)
- 🔖 **Resume where you stopped** — close a document, open it again later, press `Shift+Space`, and Read Aloud starts at the sentence you left off on. [→ Resume where you stopped](#resume-where-you-stopped)
- 🎧 **A voice browser** in the settings: every voice by tier and language — yours and Zotero's own — a play button for a short sample, hearts for favorites, and a switch to offer only the favorites. [→ Voice browser](#voice-browser)
- ✨ **Word *and* sentence highlighting at once**, in your own colors and opacities — for Zotero's voices too. [→ Highlight](#highlight)
- ⌨️ **Keyboard shortcuts**: speed up, down, reset; jump by sentence or paragraph; read from the selection; bring the view back to what's being read; open the player's options panel. All rebindable. [→ Shortcuts](#keyboard-shortcuts)
- 📌 **One voice and speed everywhere** — every document and every open tab, picked in any tab's player or in the voice browser — instead of Zotero's choice per language. [→ Reading](#reading)
- ⏱️ **The pauses are yours** — how long every voice waits between sentences and before a paragraph, for Zotero's voices too, and shorter as you read faster. [→ Reading](#reading)
- 💾 **Backup and sync** — settings and reading positions as files, or through your own WebDAV folder: bookmarks follow you between computers, and each computer's settings file keeps itself fresh on the server. [→ Backup](#backup)

## Install

Download `zotero-tts.xpi` from the [latest release](https://github.com/xujialiu/Zotero-TTS/releases/latest)
(Firefox: right-click → *Save Link As…*), install it with **Tools → Plugins → ⚙ →
Install Plugin From File…** and restart Zotero; then enable a provider in
**Edit → Settings → Zotero-TTS** and pick a voice named after its provider —
`Kokoro-af_bella`, `Azure-Ava Multilingual` — under the **Local** tier.

<p align="center"><img src="assets/popup.png" width="640" alt="The Read Aloud player with a plugin voice chosen under the Local tier"></p>

## Providers

| Provider | What you need | Cost | Highlighting |
|---|---|---|---|
| **Azure Speech** | Speech resource key + region · [tutorial](tutorials/azure-speech-free-tier.md) | Free tier: 500,000 characters a month | word |
| **Kokoro-FastAPI** | A server on your machine or LAN · [tutorial](tutorials/kokoro-fastapi.md) | Free; CPU works, a GPU is faster | word |
| **OpenAI-compatible** | Base URL and model; an API key if the server wants one | OpenAI bills per character; self-hosted servers such as [Chatterbox](tutorials/chatterbox-tts-server.md) are free | sentence |
| **System voices** | Nothing — Windows only, for now | Free, offline | word |

Each provider section ends with **Enable**: it runs the connection check,
and only a check that passes switches the provider on. While a provider is
on, its fields are locked — **Disable** to edit them. **Test connection**
probes without switching anything on.

API keys, gateway headers and the WebDAV password are masked in the
settings pane. While a provider is on, its fields are locked and nothing
reveals them; unlock the section to read one back. They are stored in
Zotero's preferences in plain text, like every plugin setting, and go into
the settings backup file.

<details>
<summary><b>OpenAI-compatible servers: the fields</b></summary>

The **Server** dropdown names the server — *OpenAI*, *Chatterbox-TTS-Server*,
or *Other OpenAI-compatible server* — and fills in the address and model you
last used with that server (its defaults the first time), graying out the
fields that server ignores. **Base URL** is the server, with or without
`/v1`. **Model** is the name it expects; **Test connection**
fetches the server's model list and says whether yours is on it. Leave
**Voices** empty to take the voices the server publishes on
`/v1/audio/voices`, or list voice ids yourself, comma-separated. The API key
may stay empty for servers that have none; only api.openai.com insists on
one. For Kokoro use the *Local engine* section instead: that is what gets
you word-level highlighting.

</details>

<details>
<summary><b>Behind a gateway (Cloudflare Tunnel, reverse proxy)</b></summary>

Put the gateway's headers in **Extra headers** — of the OpenAI section, or
of the Local engine section for Kokoro — as `Name: value` pairs separated
by `;`, for example `CF-Access-Client-Id: …; CF-Access-Client-Secret: …`.
They go out with every request. [Tutorial](tutorials/remote-access-cloudflare.md).

</details>

### System voices

Windows already installs a handful of voices, and Read Aloud already lists
them under **Local**. It gets them straight from the browser engine, which
hands over no audio and no word timings — so those voices are the one kind
the plugin could never touch: no voice browser, no samples, no ♡, no cache,
no word highlight.

**Enable** in the *System voices* section takes them over. The plugin talks
to the same Windows speech engines itself, through a small helper process,
and publishes the result as ordinary plugin voices called
`System-Microsoft David`, `System-Microsoft Huihui` and so on — with word
timings, which is more than Zotero's own path can give them.

Zotero's own copies of these voices are never listed in the player, whether
or not this is enabled: the plugin hides them, because Zotero reaches them
through the browser engine and nothing the plugin does for a voice can
follow it there. A voice you had already picked from those copies is
re-pointed at the plugin's equivalent when you enable this, so it keeps
playing. On macOS and Linux, where the helper does not exist yet, the player
therefore offers Zotero's own Standard and Premium voices plus whichever
providers you have configured.

<details>
<summary><b>Details</b></summary>

Two Windows APIs are needed and together they are exactly the list Read
Aloud shows: `System.Speech` for the older "… Desktop" voices and
`Windows.Media.SpeechSynthesis` for the rest. The helper is one
`powershell.exe` for the whole Zotero session, started at the first
sentence and stopped with the plugin; a sentence takes 10–100 ms, far
faster than real time.

Audio is made at the voice's natural pace, like every other provider's, and
Read Aloud's slider stretches it — so the same voice sounds a little
different from Zotero's own path, which changes the engine's rate instead.

macOS and Linux are not covered yet; the section says so, and enabling it
there fails with a message.

</details>

## Settings

Everything is under **Edit → Settings → Zotero-TTS**.

### Highlight

<p align="center"><img src="assets/settings-highlight.png" width="520" alt="The Highlight group"></p>

A color and an opacity for the word and for its sentence, and a switch to
keep the sentence highlighted under the word — for Zotero's own voices too.
Word-by-word highlighting also needs Zotero's own switch: **Settings →
General → Read Aloud → Highlight current → Word**.

<details>
<summary><b>Details</b></summary>

The preview is painted in your reader's theme. The default is a blue word
on a yellow sentence, both at 70 %; *Restore default colors* brings it back
(Zotero's own blue is `#4072e5` at 45 % and 30 %).

</details>

### Keyboard shortcuts

<p align="center"><img src="assets/settings-shortcuts.png" width="440" alt="The Keyboard shortcuts group"></p>

`Shift+Space` is the one play key and always does the right thing: it
pauses and resumes an open session, and otherwise starts reading — from the
selected text, from where you last stopped (below), or from the visible
page. `Shift+O` opens and closes the player's options panel — the speed
slider, the tier, the language and the voice. The arrow keys, `Shift+Enter`
and `Shift+O` act only while Read Aloud is open and keep their usual
meaning otherwise. Click a field to record another key.

## Resume where you stopped

Close a document in the middle of listening, open it again later, press
`Shift+Space` — Read Aloud starts at the sentence you left off on. If the
document has never been read aloud, it simply starts from the page you are
looking at.

<details>
<summary><b>Details</b></summary>

- Zotero remembers a reading position of its own, but drops it as soon as
  you scroll a few pages away from it. This one is kept.
- Reading resumes at the **start** of the sentence you were in the middle of.
- Every document you have listened to. Positions stay on this computer
  unless *Sync reading positions between computers* is on (see
  [Backup](#backup)); they are never part of the settings backup file.
- Nothing is drawn in the document and nothing is added to your annotations.

</details>

### Voice browser

<p align="center"><img src="assets/settings-voices.png" width="700" alt="The voice browser: tier, language and voice columns"></p>

Every voice Read Aloud can use, in the player's own three steps — tier,
language, voice. **▶** plays a short sample, **♥** marks a favorite, and a
click on a row makes that voice the **default**: what Read Aloud starts
with, in every document. The **Speed** slider is the player's own (0.5×–3×).

<details>
<summary><b>Favorites, samples, the default voice</b></summary>

- **Local** holds the voices your enabled providers publish, **Standard**
  and **Premium** are Zotero's own; multilingual voices sit under "Multiple
  languages", first in the language column. The language column is the
  player's own dropdown for the tier — the same entries, named the same way.
- **▶** — your voices speak a sentence in the voice's own language,
  synthesized by your provider like any sentence; Zotero's voices speak
  Zotero's own sample, which spends no credits.
- *Offer only favorite voices* trims the Read Aloud player to the marked
  ones **in every tier** — a tier you marked nothing in comes up empty, and
  Zotero grays it out. With nothing marked at all, or when none of the
  marked voices is listed any more, everything is offered again. While the
  switch is on, only a favorite can be the default, and the switch stays
  off while the default is not one. Favorites travel with the settings
  backup.
- The status line names the default by tier, language and voice with the
  speed (`Default voice: Local | Chinese | Azure-晓晓 | 1.8×`); a click on
  the default row clears it, back to Zotero's own per-language choice. Pick
  another voice in any tab's player while the settings are open and the
  highlight moves there.
- The **Speed** slider plays the samples at that speed, and releasing it
  makes that the speed Read Aloud starts with — at once in a document that
  is playing. Zotero stretches its audio, pitch kept, so the slider costs
  no new request.
- While Read Aloud is open in some tab, every setting that changes what the
  player lists is refused with a message naming the tabs — close them, then
  try again. Zotero has no way to refresh an open player's list, and two
  tabs listing different voices would send *Use one voice everywhere* to a
  voice one of them does not have. The settings: switching a provider on or
  off, *Offer only favorite voices*, a favorite marked or unmarked while
  only favorites are offered, and restoring a settings backup from a file or
  from WebDAV.

</details>

### Reading

- *Use one voice everywhere* — one voice for every document and every open
  tab, whatever the document's language. Off, Zotero remembers a voice per
  document language.
- *Use one speed everywhere* — one speed for every document and every open
  tab, set from the player's slider, the shortcuts or the settings slider.
  Off, Zotero keeps a speed per document language.
- *Pause between sentences* — how long every voice waits before the next
  sentence, whatever its tier, at 1× speed; reading faster shortens it in
  step. On at 0 by default, so every voice runs sentence to sentence. Off,
  each voice pauses as Zotero sets it: about 300 ms on a few of Zotero's
  Premium voices, none elsewhere, and never shorter at speed.
- *Extra pause between paragraphs* — added on top where a paragraph
  begins, at 1× speed, shortened in step with the speed. On at 200 ms by
  default, which is what Zotero itself adds. Off, Zotero's 200 ms, the
  same at every speed.
- *Prefetch upcoming sentences* — the ones ahead are synthesized while the
  current one plays, so playback never waits for the server. Zotero fetches
  3 ahead by itself and your number adds to those. It keeps the cache below
  switched on, which is where the audio waits.
- *Cache synthesized audio* — skipping back or reopening a document costs no
  new request. In memory (64 MB); a Zotero restart empties it.

<details>
<summary><b>Details</b></summary>

Pick the one voice in any tab's player and every other tab that is
reading goes on with it from its current sentence; the rest get it when
their player opens. The player of a document in another language is switched
to the voice's language (a Chinese PDF reads with your English voice, its
sentences split by English rules); multilingual voices (Azure's, OpenAI's)
sit under the player's "Multiple languages" entry, which the plugin pins to
the top of the language list. The settings pane names every voice the same
way the player does.

When the default voice is not offered in a document — its provider switched
off or not answering, or only favorites offered and the default not among
them — Read Aloud starts with the first Local voice it does offer, your
favorites first, and a note in the reader says which. The default itself is
kept and comes back as soon as it is offered again. With no Local voice
offered at all, Zotero picks the voice, as it does without the plugin.

</details>

### Backup

*Backup settings…* and *Restore settings…* keep every setting as one JSON
file; *Export reading positions…* and *Import reading positions…* do the
same for your bookmarks, as a second file. Restoring settings replaces the
configuration; importing positions only merges — a position from the file
is taken where it is newer than this computer's.

The **Sync** group connects the same data to a WebDAV folder of your own.
Each computer writes its own settings file there, named by the **This
computer** field, so no computer ever overwrites another's:

- **Keep this computer's settings uploaded automatically** (off by
  default): a few seconds after any setting changes, this computer's file
  on the server is refreshed — nothing to remember before switching
  machines. Upload only; nothing is ever applied by itself.
- **Restore settings from server…** lists what the folder holds — every
  computer's file, with its date — asks which to take, and restores it.
- **Upload settings now** does one upload by hand, for whoever leaves the
  automatic switch off.

Restoring — from a file or from the server — ends by checking every
provider it switches on, the same check **Enable** runs. One that does not
work on this machine (a local server that is not running here, a key that
has since been rotated) is left **off**, with the reason beside it,
instead of looking enabled and playing nothing.

**Sync reading positions between computers** (off by default) keeps
[where you stopped](#resume-where-you-stopped) in the same WebDAV folder,
as one shared file: listen on one computer, press `Shift+Space` on
another, and reading continues at that sentence. Positions merge — every
computer contributes the documents it listened to, the newest position
wins — so turning it on never erases anything. It works when both
computers hold the same library (synced or copied over), and it stays
separate from the settings files: restoring settings moves no reading
positions, and reading positions carry no settings.

<details>
<summary><b>WebDAV URL examples</b></summary>

The URL is a folder, created on the first upload. Nextcloud:
`https://cloud.example.com/remote.php/dav/files/<user>/zotero-tts/`;
Jianguoyun: `https://dav.jianguoyun.com/dav/zotero-tts/` with an app
password.

</details>

## Troubleshooting

<details>
<summary><b>Common problems</b></summary>

- **"Local TTS server is not running at that address."** The server is down
  or listening elsewhere — `docker ps` should list it; see its tutorial.
- **Voices play but nothing is highlighted word by word.** Set *Settings →
  General → Read Aloud → Highlight current* to **Word**, and use a voice
  that reports word timings (Azure, Kokoro).
- **"An unknown error occurred" part-way through a document** with an
  OpenAI-compatible server: the server failed on one segment; check its log.
- **The plugin's voices are missing after a Zotero update.** Read Aloud has
  no plugin API, so the plugin hooks Zotero's internal interface per reader
  tab and an update can drop its voices until the plugin catches up
  (Zotero's own keep working). Open an
  [issue](https://github.com/xujialiu/Zotero-TTS/issues) with the Zotero
  version.

</details>

## Compatibility

- Zotero 10 on the desktop, pinned to `10.*`, including builds made from
  source (`10.0.SOURCE.…`). In use on Windows and macOS; Linux should be
  the same, but is untested.

## Development

```
npm install
npm test          # vitest, also builds build/zotero-tts.xpi
npm run typecheck
npm run build
```

[notes/NOTES.md](notes/NOTES.md) records the Zotero internals the plugin relies on and
every incident so far.

## Acknowledgments

- Built for the [Zotero](https://www.zotero.org) plugin developer community.
- Developed with the help of
  [introfini/mcp-server-zotero-dev](https://github.com/introfini/mcp-server-zotero-dev),
  the MCP bridge that drives Zotero from the outside.

## License

[AGPL-3.0](LICENSE), the same license as Zotero itself. Not affiliated with Zotero.

## Buy me a coffee

<a href="https://buymeacoffee.com/xujialiu"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="60" alt="Buy me a coffee"></a>
