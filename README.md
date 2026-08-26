<h1 align="center">Zotero TTS</h1>

<p align="center"><em>An enhancer for Zotero 10's Read Aloud: more voices in its Local tier, word-and-sentence highlighting in your colors, keyboard shortcuts.</em></p>

<p align="center">
  <a href="https://www.zotero.org"><img src="https://img.shields.io/badge/Zotero-10-green?style=flat-square&logo=zotero&logoColor=CC2936" alt="Zotero 10"></a>
  <a href="https://github.com/xujialiu/Zotero-TTS/releases/latest"><img src="https://img.shields.io/github/v/release/xujialiu/Zotero-TTS?style=flat-square" alt="Latest release"></a>
  <a href="https://github.com/xujialiu/Zotero-TTS/releases"><img src="https://img.shields.io/github/downloads/xujialiu/Zotero-TTS/total?style=flat-square" alt="Downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" alt="License"></a>
  <a href="https://github.com/sponsors/xujialiu"><img src="https://img.shields.io/badge/sponsor-%E2%9D%A4-db61a2?style=flat-square&logo=githubsponsors&logoColor=db61a2" alt="Sponsor"></a>
  <a href="https://buymeacoffee.com/xujialiu"><img src="https://img.shields.io/badge/buy_me_a_coffee-%E2%98%95-FFDD00?style=flat-square&logo=buymeacoffee&logoColor=black" alt="Buy me a coffee"></a>
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
- 🎧 **A voice browser** in the settings: every voice by tier and language — yours and Zotero's own — a play button for a short sample, hearts for favorites, and a switch to offer only the favorites. [→ Voice browser](#voice-browser)
- ✨ **Word *and* sentence highlighting at once**, in your own colors and opacities — for Zotero's voices too. [→ Highlight](#highlight)
- ⌨️ **Keyboard shortcuts**: speed up, down, reset; jump by sentence or paragraph; read from the selection; bring the view back to what's being read. All rebindable. [→ Shortcuts](#keyboard-shortcuts)
- 📌 **One voice and speed for every document**, instead of Zotero's choice per language. [→ Reading](#reading)
- 💾 **Settings backup** to a file or a WebDAV folder. [→ Backup](#backup)

## Install

1. Download `zotero-tts.xpi` from the [latest release](https://github.com/xujialiu/Zotero-TTS/releases/latest) (Firefox: right-click → *Save Link As…*).
2. In Zotero: **Tools → Plugins → ⚙ → Install Plugin From File…**, then restart. Later updates install themselves.
3. **Edit → Settings → TTS** (macOS: **Zotero → Settings**): enable a provider, enter its key or address, press **Test connection**.
4. Open a document, press the headphones button, and pick a `TTS-…` voice under the **Local** tier.

<p align="center"><img src="assets/popup.png" width="600" alt="The Read Aloud popup with a TTS-Azure voice chosen under the Local tier"></p>

Word-by-word highlighting also needs Zotero's own switch: **Settings →
General → Read Aloud → Highlight current → Word**.

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

### Keyboard shortcuts

`Shift+Z` back to 1.0×, `Shift+X` −0.1, `Shift+C` +0.1; `←` / `→` previous
/ next sentence, `Shift+←` / `Shift+→` previous / next paragraph;
`Shift+Space` starts reading from the selected text — the context menu's
*Read Aloud from Here* (Zotero itself also has `Ctrl/Cmd+Shift+R`);
`Shift+Enter` makes the view follow the reading again after you scrolled
away. The arrow keys and `Shift+Enter` act only while Read Aloud is open,
`Shift+Space` only while text is selected; otherwise the keys page and
scroll as usual. Click a field to record another key.

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
Favorites travel with the settings backup.

### Reading

- *Use the same voice and speed for every document* — Zotero remembers them
  per document language; the plugin keeps your last choice instead.
  Multilingual voices (Azure's, OpenAI's) sit under the popup's "Multiple
  languages" entry, which the plugin pins to the top of the language list.
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

## TODO

- Remember where Read Aloud stopped when a document is closed, and a shortcut
  that resumes there the next time it is opened.
- A speed in the voice browser, so a sample plays at the speed it will be
  read at.
- The voice browser as the place to pick the default voice and default
  speed: the selected row is what Read Aloud starts with. With *Offer only
  favorite voices in the Read Aloud popup* on, only a favorite can be
  selected.

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
