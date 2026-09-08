<p align="center"><img src="assets/icon.png" width="80" alt="Zotero-TTS icon"></p>
<h1 align="center">Zotero-TTS</h1>

<p align="center"><em>An enhancer for Zotero 10's Read Aloud: more voices in its Local tier, word-and-sentence highlighting in your colors, keyboard shortcuts.</em></p>

<p align="center">
  <a href="https://www.zotero.org"><img src="https://img.shields.io/badge/Zotero-10-green?style=flat-square&logo=zotero&logoColor=CC2936" alt="Zotero 10"></a>
  <a href="https://github.com/xujialiu/Zotero-TTS/releases/latest"><img src="https://img.shields.io/github/v/release/xujialiu/Zotero-TTS?style=flat-square&label=Release" alt="Latest release"></a>
  <a href="https://github.com/xujialiu/Zotero-TTS/releases"><img src="https://img.shields.io/github/downloads/xujialiu/Zotero-TTS/total?style=flat-square&label=Downloads" alt="Downloads"></a>
  <a href="https://github.com/xujialiu/Zotero-TTS/commits/main"><img src="https://img.shields.io/github/last-commit/xujialiu/Zotero-TTS?style=flat-square&label=Last%20commit" alt="Last commit"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square" alt="License"></a>
</p>

<p align="center"><b>English</b> · <a href="README.zh.md">简体中文</a></p>

<p align="center"><img src="assets/word-highlight.gif" width="720" alt="Read Aloud reading a paragraph: the word being read in blue, its sentence in yellow"></p>

<p align="center">If you like Zotero-TTS, give it a ⭐ on <a href="https://github.com/xujialiu/Zotero-TTS">GitHub</a> — it helps others find it.</p>

## What it adds

Zotero 10 already reads aloud, and this plugin does not replace its player —
it adds voices to the player's **Local** tier and tunes what is around them.
[Why it is built this way](PHILOSOPHY.md).

- 🗣️ **More voices in the Local tier** of the Read Aloud player — Azure Speech, Cloudflare Workers AI, a [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) on your machine, OpenAI or any OpenAI-compatible server. [→ Providers](#providers)
- 🔖 **Resume where you stopped** — close a document, open it again later, press `Shift+Space`, and Read Aloud starts at the sentence you left off on. [→ Resume where you stopped](#resume-where-you-stopped)
- 🎧 **A voice browser** in the settings: every voice by tier and language, a play button for a short sample, hearts for favorites, and a switch to offer only the favorites. [→ Voice browser](#voice-browser)
- ✨ **Word *and* sentence highlighting at once**, in your own colors and opacities — for Zotero's voices too. [→ Highlight](#highlight)
- ⌨️ **Keyboard shortcuts** for speed, volume, jumping by sentence or paragraph, reading from the selection, the player's options panel, the word highlight on or off, and stopping Read Aloud in every tab at once. All rebindable. [→ Shortcuts](#keyboard-shortcuts)
- 📌 **One voice and speed everywhere** — every document and every open tab, instead of Zotero's choice per language. [→ Reading](#reading)
- ⏱️ **The pauses are yours** — how long every voice waits between sentences and before a paragraph, shorter as you read faster. [→ Reading](#reading)
- 💾 **Backup and sync** — settings and reading positions as files, or through your own WebDAV folder, so your bookmarks follow you between computers. [→ Backup and sync](#backup-and-sync)
- 🖥️ **Windows and macOS voices, spoken by the plugin** — the ones Read Aloud already lists, but with samples, favorites, the cache and, on Windows, word-by-word highlighting. [→ Providers](#providers)

## Install

1. Download `zotero-tts.xpi` from the [latest release](https://github.com/xujialiu/Zotero-TTS/releases/latest) — in Firefox, right-click → *Save Link As…*
2. **Tools → Plugins → ⚙ → Install Plugin From File…**, then restart Zotero.
3. Enable a provider in **Edit → Settings → Zotero-TTS**, and pick its voice — `Kokoro-af_bella`, `Azure-Ava Multilingual` — under **Local** in the player.

<p align="center"><img src="assets/popup.png" width="640" alt="The Read Aloud player with a plugin voice chosen under the Local tier"></p>

## Providers

| Provider | What you need | Cost | Highlighting |
|---|---|---|---|
| **Azure Speech** | Speech resource key + region · [tutorial](tutorials/azure-speech-free-tier.md) | Free tier: 500,000 characters a month | word; sentence for the voices named *MAI-Voice-2* |
| **Cloudflare Workers AI** | Account ID + API token · [tutorial](tutorials/cloudflare-workers-ai.md) | 10,000 free Neurons a day: a few pages with an Aura voice, hours with MeloTTS | sentence |
| **Kokoro-FastAPI** | A server on your machine or LAN · [tutorial](tutorials/kokoro-fastapi.md) | Free; CPU works, a GPU is faster | word |
| **OpenAI-compatible** | Base URL and model; an API key if the server wants one | OpenAI bills per character; self-hosted servers such as [Chatterbox](tutorials/chatterbox-tts-server.md) are free | sentence |
| **Xiaomi MiMo** | An API key from platform.xiaomimimo.com, picked in the OpenAI section's **Server** dropdown | Free for a limited time | sentence |
| **System voices** | Nothing — Windows and macOS | Free, offline | word on Windows, sentence on macOS |

- **Enable**, at the end of every provider section, runs the connection
  check first: a provider that does not answer never switches on.
- **Test connection** probes without switching anything on.
- While a provider is on its fields are locked — **Disable** to edit them.
- API keys, gateway headers and the WebDAV password are masked. Like every
  plugin setting they are stored in Zotero's preferences in plain text, and
  they go into the settings backup file.

<details>
<summary><b>OpenAI-compatible servers: how to fill the settings in</b></summary>

- **Server** names the server — *OpenAI*, *Chatterbox-TTS-Server*, *Xiaomi
  MiMo*, or *Other OpenAI-compatible server* — and fills in the address,
  model, key, voices and headers you last used with it (its defaults the
  first time, and nothing of another server's), graying out the fields that
  server ignores.
- **Base URL** is the server, with or without `/v1`.
- **Model** is the name it expects; **Test connection** fetches the
  server's model list and says whether yours is on it.
- **Voices** — leave it empty to take the voices the server offers, or list
  voice ids yourself, comma-separated.
- The **API key** may stay empty for servers that have none; only
  api.openai.com insists on one.
- For Kokoro use the **Kokoro-FastAPI** section instead: that is what gets
  you word-level highlighting.
- *Xiaomi MiMo* takes the key from platform.xiaomimimo.com and, while
  **Voices** is empty, offers MiMo's built-in Chinese and English voices;
  its speech carries no word timings, so sentences are highlighted.
- With *OpenAI* or *Xiaomi MiMo* chosen, an address one or two letters off
  the server's own is refused as a typo before anything is sent, and any
  other address is tested with a note that it is not the server's own — a
  mirror or a proxy.

</details>

<details>
<summary><b>Cloudflare Tunnel and other gateways</b></summary>

Put the gateway's headers in **Extra headers** — of the OpenAI section, or
of the **Kokoro-FastAPI** one — as `Name: value` pairs separated by `;`,
for example `CF-Access-Client-Id: …; CF-Access-Client-Secret: …`.
They go out with every request. [Tutorial](tutorials/remote-access-cloudflare.md).

</details>

<details>
<summary><b>System voices</b></summary>

Read Aloud already lists the voices Windows and macOS install, under
**Local**, but bare: no sample, no favorite, no cache, no word highlight.

**Enable** in the *System voices* section gives them all of that:

- They come back as `System-Microsoft David`, `System-Samantha` and so on —
  the same voices, now with the voice browser, samples, favorites and the
  cache behind them.
- Word-by-word highlighting on Windows. On macOS the highlight stays on the
  sentence, and every sentence takes about half a second to start.
- Zotero's own copies leave the player, so nothing is listed twice, and a
  voice you had already picked keeps playing.
- At speed these voices sound a little different from before.
- On Windows you may see one `powershell.exe` while Zotero is open; Linux
  is not supported.

</details>

## Resume where you stopped

Close a document in the middle of listening, quit Zotero, come back days
later, press `Shift+Space` — Read Aloud goes on from the sentence you
stopped at. Zotero on its own does not keep that place; the plugin keeps it
for every document you have listened to.

- Reading resumes at the **start** of that sentence, never half way into it.
- Nothing is drawn in the document and nothing is added to your annotations.
- A document you have never listened to starts from the page you are
  looking at.
- Positions stay on this computer until you switch on *Sync reading
  positions between computers* ([Backup and sync](#backup-and-sync)); then
  they follow you: stop on one, press `Shift+Space` on another, and reading
  continues at that sentence.

## Settings

Everything is under **Edit → Settings → Zotero-TTS**.

### Highlight

<p align="center"><img src="assets/settings-highlight.png" width="520" alt="The Highlight group"></p>

- A color and an opacity for the word and for its sentence, and a switch to
  keep the sentence highlighted under the word — for Zotero's own voices too.
- The default is a blue word on a yellow sentence, both at 70 %; *Restore
  default colors* brings it back.
- The preview is painted in your reader's theme.
- Word-by-word highlighting also needs Zotero's own switch: **Settings →
  General → Read Aloud → Highlight current → Word**.

### Keyboard shortcuts

<p align="center"><img src="assets/settings-shortcuts.png" width="440" alt="The Keyboard shortcuts group"></p>

**`Shift+Space` is the only key you need** — one key, whatever the reader is
doing:

- Text selected: reading starts there.
- Nothing selected, a document you have listened to before: reading picks up
  at [the sentence you stopped on](#resume-where-you-stopped).
- Nothing selected, a document you have never listened to: reading starts
  from the page you are looking at.
- Read Aloud already playing: it pauses; pressed again it goes on from the
  same sentence — or from the selection, if you made one while it was
  paused.

**`Shift+S` stops Read Aloud everywhere** — every tab's player closes at
once, a short message says how many, and each tab keeps its place for the
next time. While no player is open the key keeps its usual meaning.

**`Shift+W` turns the word highlight on and off** without leaving the
document — the same choice as Zotero's *Highlight current* setting. It
takes effect on the sentence being spoken, in every tab, and stays until
you change it again; a short message says which you got. A voice without
word timing keeps highlighting the sentence either way, and the message
says so.

### Voice browser

<p align="center"><img src="assets/settings-voices.png" width="700" alt="The voice browser: tier, language and voice columns"></p>

Every voice Read Aloud can use, in the player's own three steps — tier,
language, voice.

- **▶** plays a short sample, **♥** marks a favorite.
- A click on a row makes that voice the **default**: what Read Aloud starts
  with, in every document.
- **Speed** is the player's own slider (0.5×–3×); **Volume** is how loud
  Read Aloud plays, 100% being Zotero's own level.

<details>
<summary><b>Favorites, samples, the default voice</b></summary>

- **Local** holds the voices your enabled providers publish, **Standard**
  and **Premium** are Zotero's own; multilingual voices sit under "Multiple
  languages", first in the language column.
- **▶** — a sample in the voice's own language: your voices cost one short
  request, Zotero's own cost nothing.
- *Offer only favorite voices* trims the Read Aloud player to the marked
  ones **in every tier** — a tier you marked nothing in comes up empty, and
  Zotero grays it out. With nothing marked at all, or when none of the
  marked voices is listed any more, everything is offered again. While the
  switch is on, only a favorite can be the default, and the switch stays
  off while the default is not one. Favorites travel with the settings
  backup.
- The hearts show in the player's own voice list too: with *Offer only
  favorite voices* off, a marked voice carries a ♥ in the dropdown and the
  rest do not, so a favorite is findable without giving up every other
  voice. A marker, not a button — hearts are set here — and it is gone
  while the switch is on, where every listed voice is one.
- A click on the default row clears the default, back to Zotero's own
  per-language choice. Pick another voice in any tab's player while the
  settings are open and the highlight moves there.
- The **Speed** slider plays the samples at that speed, and releasing it
  makes that the speed Read Aloud starts with — at once in a document that
  is playing. Changing the speed costs nothing and leaves the pitch alone.
- **Volume** (0–100%) applies to every voice, Zotero's Standard and
  Premium included, and to the samples; a change lands on the sentence
  being spoken, in every open tab. `Shift+↑` / `Shift+↓` move the same
  number while Read Aloud is open.
- While Read Aloud is open in some tab, every setting that changes what the
  player lists first names those tabs and offers to stop the reading there:
  - **Stop reading and continue** closes their players and applies the
    change at once. Each tab keeps its place — Read Aloud picks up there
    when you start it again.
  - **Cancel** leaves everything as it was; close the player in those tabs
    yourself, then try again.
  - *The settings:* switching a provider on or off, *Offer only favorite
    voices*, a favorite marked or unmarked while only favorites are
    offered, and restoring a settings backup from a file or from WebDAV.

</details>

### Reading

<details>
<summary><b>One voice everywhere, pauses, prefetch, cache</b></summary>

- *Use one voice everywhere* — one voice for every document and every open
  tab, whatever the document's language. Off, Zotero remembers a voice per
  document language.
- *Use one speed everywhere* — one speed for every document and every open
  tab, set from the player's slider, the shortcuts or the settings slider.
  Off, Zotero keeps a speed per document language.
- *Pause between sentences* — how long every voice waits before the next
  sentence, whatever its tier, at 1× speed; reading faster shortens it in
  step. On at 0 by default, so every voice runs sentence to sentence. Off,
  each voice pauses as Zotero sets it.
- *Extra pause between paragraphs* — added on top where a paragraph
  begins, at 1× speed, shortened in step with the speed. On at 200 ms by
  default. Off, Zotero's own pause, the same at every speed.
- *Prefetch upcoming sentences* — the ones ahead are synthesized while the
  current one plays, so playback never waits for the server. It needs the
  cache below, and keeps it switched on.
- *Cache synthesized audio* — skipping back or reopening a document costs no
  new request. In memory (64 MB); a Zotero restart empties it.

</details>

### Backup and sync

**Reading positions sync** — your bookmarks follow you between computers.

- Switch on *Sync reading positions between computers* and give it a WebDAV
  folder of your own.
- Every computer sharing that folder and the same library stays in step:
  stop listening on one, press `Shift+Space` on another, and reading goes on
  from that sentence.
- Turning it on loses no bookmark, whichever computer it came from.
- Without a server, *Export reading positions…* and *Import reading
  positions…* carry the same bookmarks as a file.

**Settings backup and sync**

- *Backup settings…* and *Restore settings…* keep every setting as one file.
- The same WebDAV folder can hold each computer's settings and keep them up
  to date, to restore on another.
- A provider that cannot work on the computer you restore to stays off and
  says why.

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

- **"Cannot reach Kokoro at http://localhost:8880. Is the server running?"**
  The server is down or listening at another address — the line names the
  one it tried; `docker ps` should list the server; see its tutorial.
- **Voices play but nothing is highlighted word by word.** Set *Settings →
  General → Read Aloud → Highlight current* to **Word**, and use a voice
  that reports word timings: Kokoro, or an Azure voice without
  *MAI-Voice-2* in its name (those highlight by sentence).
- **With an Azure voice named *Dragon Latest*, the word highlight jumps
  to the paragraph's last word about ten seconds in** and stays there
  until the next paragraph. It is the voice, not the plugin: Azure's other
  voices — *Dragon HD Flash*, Multilingual, the plain ones — track every
  word.
- **"An unknown error occurred" part-way through a document** with an
  OpenAI-compatible server: the server failed on one segment; check its log.
- **The plugin's voices are missing after a Zotero update.** An update can
  take them out until the plugin catches up; Zotero's own keep working.
  Open an
  [issue](https://github.com/xujialiu/Zotero-TTS/issues) with the Zotero
  version.

</details>

## Compatibility

- Zotero 10 on the desktop, any 10.x build, source builds included. In use
  on Windows and macOS; Linux should be the same, but is untested.

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

- Developed with the help of
  [introfini/mcp-server-zotero-dev](https://github.com/introfini/mcp-server-zotero-dev),
  the MCP bridge that drives Zotero from the outside.

## License

[AGPL-3.0](LICENSE), the same license as Zotero itself. Not affiliated with Zotero.

## Buy me a coffee

<a href="https://buymeacoffee.com/xujialiu"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="60" alt="Buy me a coffee"></a>
