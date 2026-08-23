# Zotero TTS

Extra voices for Zotero 10's built-in **Read Aloud**: OpenAI (or any
OpenAI-compatible server), Azure Speech, and a local
[Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) server.
Zotero's own Standard and Premium voices keep working; the plugin's voices
join the **Local** tier of the Read Aloud popup, named `TTS-<Provider>-<voice>`
(for example `TTS-Azure-Ava Multilingual`, `TTS-Kokoro-af_bella`).

- Word-level highlighting with Azure and Kokoro (both report word timings);
  sentence-level with OpenAI.
- Keyboard shortcuts for the Read Aloud speed: `Shift+Z` back to 1.0×,
  `Shift+X` −0.1, `Shift+C` +0.1 — customisable in the settings pane.
- One voice and speed for every document. Zotero itself remembers them per
  detected document language, so a new language starts over at 1.0× with a
  fallback voice and a voice chosen under "Multiple languages" never
  comes back on its own. The plugin keeps the speed you last set and the
  voice you last picked: a multilingual voice is used for every document,
  a single-language voice for documents in its language (the only ones it
  can read). Switch it off under Reading if you want Zotero's per-language
  behaviour back.
- Backup and restore: the Backup group at the bottom of the settings pane
  writes every setting to a JSON file and reads one back. The file includes
  your API keys, so keep it private.
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
| Azure | Speech resource key + region (e.g. `eastasia`) | word |
| Local (Kokoro) | A Kokoro-FastAPI server — [tutorial](tutorials/kokoro-fastapi.md) | word |

The OpenAI section works with any server that speaks OpenAI's audio API:
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
a reverse proxy with its own header — put the gateway's headers in **Extra
headers** as `Name: value` pairs separated by `;`, for example
`CF-Access-Client-Id: …; CF-Access-Client-Secret: …`. They go out with every
request, before the Authorization header —
[tutorial](tutorials/remote-access-cloudflare.md).

API keys are stored in Zotero's preferences in plain text, like every other
Zotero plugin setting.

## Tutorials

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
