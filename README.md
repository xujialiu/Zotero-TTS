# Zotero TTS

Extra voices for Zotero 10's built-in **Read Aloud**: OpenAI (or any
OpenAI-compatible server), Azure Speech, and a local
[Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) server.
Zotero's own Standard and Premium voices keep working; the plugin's voices
join the **Local** tier of the Read Aloud popup, named `TTS-<Provider>-<voice>`
(for example `TTS-Azure-Ava Multilingual`, `TTS-Local-af_bella`).

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
  every language.

Requires Zotero 10 (tested with 10.0.1-beta).

## Install the plugin

1. Build the package: `npm install` then `npm run build` → `build/zotero-tts.xpi`
   (or take a released `.xpi`).
2. In Zotero: **Tools → Plugins → ⚙ → Install Plugin From File…**, pick the
   `.xpi`, restart Zotero.
3. **Edit → Settings → TTS** (macOS: **Zotero → Settings**): tick the providers
   you want, enter keys, and press **Test connection** under each one.
4. Open a PDF, start Read Aloud, and in its popup choose the tier **Local**; the
   plugin's voices are the `TTS-…` entries.
5. For word-by-word highlighting: **Settings → General → Read Aloud → Highlight
   current → Word**.

Provider notes:

| Provider | What you need | Highlighting |
|---|---|---|
| OpenAI, or any OpenAI-compatible server | API key, base URL, model name | sentence |
| Azure | Speech resource key + region (e.g. `eastasia`) | word |
| Local (Kokoro) | A Kokoro-FastAPI server, see below | word |

The OpenAI section works with any server that speaks OpenAI's audio API:
set **Base URL** to the server (with or without `/v1`), type the **Model**
name it expects (**Test connection** fetches the server's model list and
offers it as suggestions, and says whether your model is on it), and leave
**Voices** empty to take the voices the server publishes on
`/v1/audio/voices` — or list voice ids yourself, comma-separated, for servers
that publish none. OpenAI's own voices are used when neither is available.
For Kokoro prefer the Local section: that is what gets you word-level
highlighting.

API keys are stored in Zotero's preferences in plain text, like every other
Zotero plugin setting.

## Local engine: Kokoro-FastAPI

Kokoro runs entirely on your machine. The plugin talks to it at
`http://localhost:8880` (the **Address** field under *Local engine*). The
official Docker image bundles the model, CUDA and espeak-ng, so with Docker
installed it is one command.

Prerequisites: Docker (Docker Desktop on Windows/macOS, Docker Engine on
Linux). For an NVIDIA GPU, a current driver — on Linux also the NVIDIA
Container Toolkit; on Windows nothing else. Check the GPU is visible to
containers with `docker run --rm --gpus all ubuntu:22.04 nvidia-smi -L`.

### Windows / Linux with an NVIDIA GPU

GeForce 900-series up to RTX 40-series (CUDA 12.6 build):

```sh
docker run -d --name kokoro --restart unless-stopped --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest
```

RTX 50-series (Blackwell) needs the CUDA 12.8 build:

```sh
docker run -d --name kokoro --restart unless-stopped --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest-cu128
```

### Without an NVIDIA GPU (any platform)

```sh
docker run -d --name kokoro --restart unless-stopped -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

Slower to start each sentence, but fine for reading.

### macOS

Docker on a Mac cannot use the GPU: the GPU image is CUDA-only and Apple's
Metal is not exposed to Linux containers. Two options:

- **Docker, CPU** — the command above; the CPU image is built for both
  Intel and Apple Silicon.
- **Native, Apple GPU (Metal / MPS)** — run Kokoro-FastAPI directly with
  [uv](https://docs.astral.sh/uv/) instead of Docker; the upstream script
  sets `DEVICE_TYPE=mps`, installs the dependencies, downloads the model and
  starts the server on port 8880:

  ```sh
  git clone https://github.com/remsky/Kokoro-FastAPI.git
  cd Kokoro-FastAPI
  ./start-gpu_mac.sh
  ```

  Keep that terminal open while reading; rerun the script to start it again.

What the Docker flags do: `-d` runs it in the background, `--restart
unless-stopped` brings it back whenever Docker starts, `--gpus all` hands the
GPU to the container, `-p 8880:8880` exposes the server on `localhost:8880`.
The first run downloads a few GB; later starts take seconds.

### Check it

In Zotero, *Settings → TTS → Local engine*, tick **Enable Kokoro-FastAPI**
and press **Test connection**; it should say `Connected. 68 voices
available.` Then open Read Aloud, choose the Local tier, and pick a
`TTS-Local-…` voice (`af_bella` and `af_heart` are good English voices;
`zf_xiaobei` / `zm_yunxi` speak Chinese).

### Troubleshooting

- **"Local TTS server is not running at that address."** Docker is not
  running, or the container is stopped — `docker ps` should list `kokoro`.
  Start it with `docker start kokoro`.
- **`port is already allocated`**: something else listens on 8880. Either stop
  it, or run the container with `-p 8881:8880` and set the plugin's Address to
  `http://localhost:8881`.
- **GPU not found** (`could not select device driver "" with capabilities:
  [[gpu]]`): update the NVIDIA driver (Linux: install the NVIDIA Container
  Toolkit) and retry the `nvidia-smi -L` check above; or use the CPU image.
- **Voices play but nothing is highlighted word by word**: set *Settings →
  General → Read Aloud → Highlight current* to **Word**.

## Development

```
npm install
npm test          # vitest, also builds build/zotero-tts.xpi
npm run typecheck
npm run build
```

`src/` is bundled by esbuild into `addon/content/zotero-tts.js`; `addon/` is
packed as the `.xpi`.
