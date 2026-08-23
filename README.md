# Zotero TTS

Extra voices for Zotero 10's built-in **Read Aloud**: OpenAI (or any
OpenAI-compatible server), Azure Speech, and a local
[Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) server.
Zotero's own Standard and Premium voices keep working; the plugin's voices
join the **Local** tier of the Read Aloud popup, named `TTS-<Provider>-<voice>`
(for example `TTS-Azure-Ava Multilingual`, `TTS-Kokoro-af_bella`).

- Word-level highlighting with Azure and Kokoro (both report word timings);
  sentence-level with OpenAI.
- Keyboard shortcuts for Read Aloud: `Shift+Z` back to 1.0×, `Shift+X`
  −0.1, `Shift+C` +0.1; while Read Aloud is open, `←` / `→` jump to the
  previous / next sentence and `Shift+←` / `Shift+→` to the previous / next
  paragraph (with it closed, the arrow keys page as usual). All customisable
  in the settings pane.
- One voice and speed for every document. Zotero itself remembers them per
  detected document language, so a new language starts over at 1.0× with a
  fallback voice and a voice chosen under "Multiple languages" never
  comes back on its own. The plugin keeps the speed you last set and the
  voice you last picked: a multilingual voice is used for every document,
  a single-language voice for documents in its language (the only ones it
  can read). Switch it off under Reading if you want Zotero's per-language
  behaviour back.
- Highlight colours: Zotero paints the word or sentence being read in one
  fixed blue; Settings → TTS → Highlight lets you pick the word colour and
  the sentence colour with their opacities, and keep the sentence
  highlighted under the word in word mode. The plugin starts with a green
  word on a yellow sentence, the sentence kept under the word; *Restore
  default colours* brings that back. Zotero's own blue is `#4072e5`, 45%
  for the unit being read and 30% for the sentence under it, if you prefer
  it. Works for PDFs, EPUBs and snapshots, with Zotero's own voices too.
- Backup and restore: the Backup group at the bottom of the settings pane
  writes every setting to a JSON file and reads one back — a file on disk,
  or the same file in a WebDAV folder (Nextcloud, Synology, Jianguoyun, …)
  so the settings follow you between machines: *Upload to WebDAV* on one,
  *Download from WebDAV* on the other. The WebDAV URL is a folder, created
  on the first upload — Nextcloud:
  `https://cloud.example.com/remote.php/dav/files/<user>/zotero-tts/`,
  Jianguoyun: `https://dav.jianguoyun.com/dav/zotero-tts/` with an app
  password. The file includes your API keys, so keep it private.
- Voices that speak any language — Azure's *Multilingual* / *多语言* ones,
  every OpenAI voice — sit under their own entry in the popup's language
  dropdown, "Multiple languages" (多语种), rather than being repeated under
  every language. Prefer them at hand? Tick **Offer multilingual voices
  under every language** (Settings → TTS → Reading): they then appear in
  every language's voice list, and the "Multiple languages" entry
  disappears (nothing left that only lives there).

Requires Zotero 10 (tested with 10.0.1-beta).

## Install the plugin

1. Download `zotero-tts.xpi` from the [latest release](https://github.com/xujialiu/Zotero-TTS/releases/latest).
   (Firefox users: right-click → Save Link As…, or Firefox tries to install
   it as a browser extension.)
2. In Zotero: **Tools → Plugins → ⚙ → Install Plugin From File…**, pick the
   `.xpi`, restart Zotero. Zotero checks for plugin updates on its own, so
   later releases install themselves.
3. **Edit → Settings → TTS** (macOS: **Zotero → Settings**): tick the providers
   you want, enter keys, and press **Test connection** under each one.
4. Open a PDF, start Read Aloud, and in its popup choose the tier **Local**; the
   plugin's voices are the `TTS-…` entries.
5. For word-by-word highlighting: **Settings → General → Read Aloud → Highlight
   current → Word**.

Provider notes:

| Provider | What you need | Highlighting |
|---|---|---|
| OpenAI, or any OpenAI-compatible server | Base URL, model name; an API key where the server wants one | sentence |
| Azure | Speech resource key + region (e.g. `eastasia`); 500k characters a month are free — [tutorial](tutorials/azure-speech-free-tier.md) | word |
| Local (Kokoro) | A Kokoro-FastAPI server — [tutorial](tutorials/kokoro-fastapi.md) | word |

The OpenAI section works with any server that speaks OpenAI's audio API.
Its **Server** dropdown says which one: *OpenAI*, *Chatterbox-TTS-Server*,
or *Other OpenAI-compatible server*. Picking one fills in the address and
model and greys out the fields that server provably ignores (Chatterbox: key,
model, voices); *Other* keeps every field editable. Then
set **Base URL** to the server (with or without `/v1`), type the **Model**
name it expects (**Test connection** fetches the server's model list and
offers it as suggestions, and says whether your model is on it), and leave
**Voices** empty to take the voices the server publishes on
`/v1/audio/voices` — or list voice ids yourself, comma-separated, for servers
that publish none. OpenAI's own voices are used when neither is available.
The API key may stay empty for servers that have none; only api.openai.com
insists on one. For Kokoro prefer the Local section: that is what gets you
word-level highlighting.

[Chatterbox-TTS-Server](https://github.com/devnen/Chatterbox-TTS-Server) is
one such server, with much more natural voices than Kokoro and voice cloning,
at the price of sentence-level highlighting and a real GPU —
[tutorial](tutorials/chatterbox-tts-server.md).

Behind a gateway — a Cloudflare Tunnel protected by an Access service token,
a reverse proxy with its own header — put the gateway's headers in the
**Extra headers** field of the OpenAI section, or of the Local engine
section for Kokoro, as `Name: value` pairs separated by `;`, for example
`CF-Access-Client-Id: …; CF-Access-Client-Secret: …`. They go out with every
request, before the Authorization header —
[tutorial](tutorials/remote-access-cloudflare.md).

API keys are stored in Zotero's preferences in plain text, like every other
Zotero plugin setting.

## Tutorials

- [Azure Speech on the free tier](tutorials/azure-speech-free-tier.md) —
  a Speech resource on the Free F0 tier: 500,000 characters of neural
  voices a month, word timings included, and what the tier leaves out.
- [Kokoro-FastAPI in Docker](tutorials/kokoro-fastapi.md) — the local engine
  with word-level highlighting; NVIDIA GPU, CPU, or macOS.
- [Chatterbox-TTS-Server in Docker](tutorials/chatterbox-tts-server.md) —
  expressive voices and voice cloning through the OpenAI section; NVIDIA GPU
  only (CPU and macOS are too slow to read with).
- [Reaching your TTS server from anywhere with Cloudflare](tutorials/remote-access-cloudflare.md)
  — a Cloudflare Tunnel plus an Access service token, and the plugin's
  *Extra headers* field.

## Troubleshooting

- **"Local TTS server is not running at that address."** The server is down
  or listening elsewhere — `docker ps` should list it; see its tutorial.
- **Voices play but nothing is highlighted word by word**: set *Settings →
  General → Read Aloud → Highlight current* to **Word** — and use a voice
  that reports word timings (Azure, Kokoro).
- **"An unknown error occurred" part-way through a document** with an
  OpenAI-compatible server: the server failed on one segment. Check its log;
  very short segments (section numbers) are replaced by a pause, anything
  longer is reported as is.

## Development

```
npm install
npm test          # vitest, also builds build/zotero-tts.xpi
npm run typecheck
npm run build
```

`src/` is bundled by esbuild into `addon/content/zotero-tts.js`; `addon/` is
packed as the `.xpi`.
