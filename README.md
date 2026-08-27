<h1 align="center">Zotero TTS</h1>

<p align="center"><em>An enhancer for Zotero 10's Read Aloud: more voices in its Local tier, word-and-sentence highlighting in your colors, keyboard shortcuts.</em></p>

<p align="center">
  <a href="https://www.zotero.org"><img src="https://img.shields.io/badge/Zotero-10-green?style=flat-square&logo=zotero&logoColor=CC2936" alt="Zotero 10"></a>
  <a href="https://github.com/xujialiu/Zotero-TTS/releases/latest"><img src="https://img.shields.io/github/v/release/xujialiu/Zotero-TTS?style=flat-square" alt="Latest release"></a>
  <a href="https://github.com/xujialiu/Zotero-TTS/releases"><img src="https://img.shields.io/github/downloads/xujialiu/Zotero-TTS/total?style=flat-square" alt="Downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" alt="License"></a>
</p>

<p align="center"><img src="assets/word-highlight.gif" width="720" alt="Read Aloud with an Azure voice: the word being read in green, its sentence in yellow"></p>

## What is this?

Zotero 10 reads documents aloud on its own. This plugin does not replace
that — it enhances it. Zotero keeps doing the reading: the player, the
sentence segmentation, the skip buttons, the highlighting, its Standard and
Premium voices. The plugin adds voices to its Local tier and adjusts a few
things around the edges. Why it is built this way: [PHILOSOPHY.md](PHILOSOPHY.md).

## What it adds

- 🗣️ **More voices in the Local tier** of the Read Aloud popup — Azure Speech, a [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) on your machine, OpenAI or any OpenAI-compatible server — next to Zotero's Standard and Premium voices. [→ Providers](#providers)
- 🔖 **Resume where you stopped** — close a document, open it again later, press `Shift+Space`, and Read Aloud starts at the sentence you left off on. [→ Resume where you stopped](#resume-where-you-stopped)
- 🎧 **A voice browser** in the settings: every voice by tier and language — yours and Zotero's own — a play button for a short sample, hearts for favorites, and a switch to offer only the favorites. [→ Voice browser](#voice-browser)
- ✨ **Word *and* sentence highlighting at once**, in your own colors and opacities — for Zotero's voices too. [→ Highlight](#highlight)
- ⌨️ **Keyboard shortcuts**: speed up, down, reset; jump by sentence or paragraph; read from the selection; bring the view back to what's being read. All rebindable. [→ Shortcuts](#keyboard-shortcuts)
- 📌 **One voice and speed everywhere** — every document and every open tab, picked in any popup or in the voice browser — instead of Zotero's choice per language. [→ Reading](#reading)
- 💾 **Settings backup** to a file or a WebDAV folder. [→ Backup](#backup)

## Install

Download `zotero-tts.xpi` from the [latest release](https://github.com/xujialiu/Zotero-TTS/releases/latest)
(Firefox: right-click → *Save Link As…*), install it with **Tools → Plugins → ⚙ →
Install Plugin From File…** and restart Zotero; then enable a provider in
**Edit → Settings → TTS** and pick a `TTS-…` voice under the **Local** tier.

<p align="center"><img src="assets/popup.png" width="600" alt="The Read Aloud popup with a TTS-Azure voice chosen under the Local tier"></p>

## Providers

| Provider | What you need | Cost | Highlighting |
|---|---|---|---|
| **Azure Speech** | Speech resource key + region · [tutorial](tutorials/azure-speech-free-tier.md) | Free tier: 500,000 characters a month | word |
| **Kokoro-FastAPI** | A server on your machine or LAN · [tutorial](tutorials/kokoro-fastapi.md) | Free; CPU works, a GPU is faster | word |
| **OpenAI-compatible** | Base URL and model; an API key if the server wants one | OpenAI bills per character; self-hosted servers such as [Chatterbox](tutorials/chatterbox-tts-server.md) are free | sentence |

API keys are stored in Zotero's preferences in plain text, like every
plugin setting, and go into the settings backup file.

<details>
<summary><b>OpenAI-compatible servers: the fields</b></summary>

The **Server** dropdown names the server — *OpenAI*, *Chatterbox-TTS-Server*,
or *Other OpenAI-compatible server* — and fills in the address and model,
graying out the fields that server ignores. **Base URL** is the server, with
or without `/v1`. **Model** is the name it expects; **Test connection**
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

## Settings

Everything is under **Edit → Settings → TTS**.

<p align="center">
  <img src="assets/settings-highlight.png" width="400" alt="The Highlight group">
  <img src="assets/settings-shortcuts.png" width="400" alt="The Keyboard shortcuts group">
</p>

### Highlight

A word color and a sentence color, an opacity for each, and a switch to
keep the sentence highlighted under the word. The preview is painted in
your reader's theme. The default is a green word on a yellow sentence;
*Restore default colors* brings it back (Zotero's own blue is `#4072e5` at
45 % and 30 %). The colors apply to Zotero's voices as well.
Word-by-word highlighting also needs Zotero's own switch: **Settings →
General → Read Aloud → Highlight current → Word**.

### Keyboard shortcuts

`Shift+Z` back to 1.0×, `Shift+X` −0.1, `Shift+C` +0.1; `←` / `→` previous
/ next sentence, `Shift+←` / `Shift+→` previous / next paragraph;
`Shift+Enter` makes the view follow the reading again after you scrolled
away. `Shift+Space` is the one play key and always does the right thing:
it pauses and resumes an open session, and otherwise starts reading — from
the selected text (the context menu's *Read Aloud from Here*), from where
you last stopped (below), or from the visible page. The arrow keys and
`Shift+Enter` act only while Read Aloud is open and page or scroll as
usual otherwise. Click a field to record another key.

### Resume where you stopped

Close a document in the middle of listening, open it again later, press
`Shift+Space` — Read Aloud starts at the sentence you left off on. If the
document has never been read aloud, it simply starts from the page you are
looking at.

<details>
<summary>Details</summary>

- Zotero remembers a reading position of its own, but drops it as soon as
  you scroll a few pages away from it. This one is kept.
- Reading resumes at the **start** of the sentence you were in the middle of.
- The last 50 documents are remembered.
- Positions are kept **on this computer only** — not synced between
  machines, and not part of the [settings backup](#backup).
- Nothing is drawn in the document and nothing is added to your annotations.
- `Shift+Space` is rebindable like every other shortcut.

</details>

### Voice browser

Every voice Read Aloud can use, in three columns — tier, language, voice —
the same three steps the reader's popup takes (*Voice Mode* → language →
voice). **Local** holds the voices your enabled providers publish,
**Standard** and **Premium** are Zotero's own; multilingual voices sit
under "Multiple languages", first in the language column.

**▶** plays a short sample: your voices speak a sentence in the voice's own
language (English plus Chinese for multilingual voices), synthesized by
your provider like any sentence; Zotero's voices speak Zotero's own sample,
which needs no account and spends no credits — reading with them still
does. **♥** marks a favorite. *Offer only favorite voices* then trims the
Read Aloud popup to the marked ones **in every tier** — a tier you marked
nothing in comes up empty, and Zotero grays it out in *Voice Mode*. With
nothing marked at all, or when none of the marked voices is listed any more
(a provider switched off, a server gone), everything is offered again.
While the switch is on, only a favorite can be the default (below): the
other rows are grayed, unmarking the default clears it, and the status
line warns if the default is not a favorite. Favorites travel with the
settings backup.

A tab lists its voices when Read Aloud opens there, and Zotero has no way
to refresh an open popup's list. So while Read Aloud is open in some tab,
adding a voice — marking a favorite with *Offer only favorite voices* on,
or enabling a provider — is refused with a message naming the tabs: close
them (or stop Read Aloud in them), then add the voice.

The **Speed** slider is the popup's own (0.5×–3×): samples play at that
speed, and releasing it makes that the speed Read Aloud starts with — in
every document, and at once in one that is playing (while *Use one speed
everywhere* is on). Zotero stretches its
audio the same way — pitch kept — so what you hear is what you get, and
the slider costs no new request: every voice is synthesized at its natural
pace and stretched on playback.

The voice you last picked — in the popup, or by **clicking a row** here —
is the **default**, what Read Aloud starts with (see *Reading* below): the
browser opens on its row, highlighted, and the status line names it with
the speed (`Default: Azure-晓晓 · Chinese (China) · 1.8×`; with *Use one
speed everywhere* off, `speed per language`). A click on a row makes that
voice the default everywhere — every document, and at once in every tab
that is reading — and a click on the default clears it, back to Zotero's
own per-language choice. Pick another voice in any tab's popup while the
settings are open and the highlight moves there.

### Reading

- *Use one voice everywhere* — one voice for every document and every open
  tab: pick it in the popup of any tab and every other tab that is reading
  goes on with it from its current sentence; the rest get it when their
  popup opens. A multilingual voice (Azure's, OpenAI's — under the popup's
  "Multiple languages" entry, which the plugin pins to the top of the
  language list) reaches every document; a single-language voice the
  documents in its language, and the others get Zotero's own choice for
  theirs. Off, Zotero remembers a voice per document language.
- *Use one speed everywhere* — one speed for every document and every open
  tab: set it from the popup's slider, the shortcuts or the settings
  slider, and every tab follows at once. Off, Zotero keeps a speed per
  document language, and the settings slider only sets the samples' pace.
- *Hide Zotero's own Local voices* — the Local tier then offers only the
  plugin's entries, which drop their `TTS-` prefix. Takes effect the next
  time the Read Aloud popup opens.
- *Cache synthesized audio* — skipping back or reopening a document costs no
  new request.

### Backup

*Backup settings…* and *Restore settings…* use a JSON file; *Upload to
WebDAV* and *Download from WebDAV* use the same file in a WebDAV folder, so
settings follow you between machines.

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
- **The `TTS-…` voices are missing after a Zotero update.** See
  [Compatibility](#compatibility) and open an
  [issue](https://github.com/xujialiu/Zotero-TTS/issues) with the Zotero
  version.

</details>

## Compatibility

- Zotero 10 on the desktop, pinned to `10.*`. In use on Windows and macOS;
  Linux should be the same, but is untested.
- Read Aloud has no plugin API, so the plugin hooks Zotero's internal
  interface per reader tab. A Zotero update can drop the plugin's voices
  until the plugin is updated; Zotero's own voices keep working.
- Word highlighting needs a voice with word timings (Azure, Kokoro). The
  plugin never guesses them.

## Development

```
npm install
npm test          # vitest, also builds build/zotero-tts.xpi
npm run typecheck
npm run build
```

[notes/NOTES.md](notes/NOTES.md) records the Zotero internals the plugin relies on and
every incident so far.

## License

[AGPL-3.0](LICENSE), the same license as Zotero itself. Not affiliated with Zotero.

## Buy me a coffee

<a href="https://buymeacoffee.com/xujialiu"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="60" alt="Buy me a coffee"></a>
