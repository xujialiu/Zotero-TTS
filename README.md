# Zotero TTS

Extra voices for Zotero 10's built-in **Read Aloud**: OpenAI, Azure Speech, and
a local [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) server.
Zotero's own Standard and Premium voices keep working; the plugin's voices
join the **Local** tier of the Read Aloud popup, named `TTS-<Provider>-<voice>`
(for example `TTS-Azure-Ava Multilingual`, `TTS-Local-af_bella`).

- Word-level highlighting with Azure and Kokoro (both report word timings);
  sentence-level with OpenAI.
- Keyboard shortcuts for the Read Aloud speed: `Shift+Z` back to 1.0×,
  `Shift+X` −0.1, `Shift+C` +0.1 — customisable in the settings pane.
- Voices whose name says *Multilingual* / *多语言* (and every OpenAI voice) are
  offered under every language.

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

## Local engine: Kokoro-FastAPI in Docker

Kokoro runs entirely on your machine. The easiest way to run it is the official
Docker image, which bundles the model, CUDA and espeak-ng. The plugin talks to it
at `http://localhost:8880` (the **Address** field under *Local engine*).

### 1. Install Docker Desktop (Windows)

1. **Enable WSL 2.** Open *PowerShell as Administrator* and run:

   ```powershell
   wsl --install
   ```

   Reboot when asked. (If WSL was already installed, `wsl --update` is enough.)
2. **Download Docker Desktop** from <https://www.docker.com/products/docker-desktop/>
   and run the installer. Keep *Use WSL 2 instead of Hyper-V* selected.
3. Start **Docker Desktop** once and wait until the whale icon in the tray stops
   animating. Signing in is optional.
4. In *Settings → General*, tick **Start Docker Desktop when you sign in to
   your computer** so the Kokoro container comes back after every reboot.
5. Check it works — in any terminal:

   ```powershell
   docker run --rm hello-world
   ```

**GPU (NVIDIA):** nothing extra to install. A current NVIDIA driver on Windows
is all Docker Desktop needs to pass the GPU into containers (the CUDA toolkit
is *not* required on the host). Verify:

```powershell
docker run --rm --gpus all ubuntu:22.04 nvidia-smi -L
```

It should print your GPU, e.g. `GPU 0: NVIDIA GeForce RTX 3080 Ti (...)`.

*macOS:* install Docker Desktop from the same page; there is no CUDA, so use the
CPU image below. *Linux:* install Docker Engine and, for a GPU, the NVIDIA
Container Toolkit; the commands are the same.

### 2. Run Kokoro

NVIDIA GeForce 900-series up to RTX 40-series (CUDA 12.6 build):

```powershell
docker run -d --name kokoro --restart unless-stopped --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest
```

RTX 50-series (Blackwell) needs the CUDA 12.8 build:

```powershell
docker run -d --name kokoro --restart unless-stopped --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest-cu128
```

No NVIDIA GPU (CPU only; fine for reading, just slower to start each sentence):

```powershell
docker run -d --name kokoro --restart unless-stopped -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

What the flags do: `-d` runs it in the background, `--restart unless-stopped`
brings it back whenever Docker Desktop starts, `--gpus all` hands the GPU to the
container, `-p 8880:8880` exposes the server on `localhost:8880`. The first run
downloads a few GB; later starts take seconds.

### 3. Check it

```powershell
curl http://localhost:8880/v1/audio/voices
```

You should get a JSON list of voices. Then in Zotero, *Settings → TTS → Local
engine*, tick **Enable local voices** and press **Test connection**; it should
say `Connected. 68 voices available.` Open Read Aloud, choose the Local tier,
and pick a `TTS-Local-…` voice (`af_bella` and `af_heart` are good English
voices; `zf_xiaobei` / `zm_yunxi` speak Chinese).

### Everyday commands

```powershell
docker stop kokoro        # stop the server
docker start kokoro       # start it again
docker logs -f kokoro     # watch its log (Ctrl+C to leave)
docker rm -f kokoro       # remove the container (the image stays)
```

Update to a newer Kokoro release:

```powershell
docker pull ghcr.io/remsky/kokoro-fastapi-gpu:latest
docker rm -f kokoro
docker run -d --name kokoro --restart unless-stopped --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest
```

### Troubleshooting

- **"Local TTS server is not running at that address."** Docker Desktop is not
  running, or the container is stopped — `docker ps` should list `kokoro`.
  Start it with `docker start kokoro`.
- **`docker: command not found`** right after installing: open a new terminal
  (the installer changes `PATH`), or reboot.
- **`port is already allocated`**: something else listens on 8880. Either stop
  it, or run the container with `-p 8881:8880` and set the plugin's Address to
  `http://localhost:8881`.
- **GPU not found** (`could not select device driver "" with capabilities:
  [[gpu]]`): update the NVIDIA driver, make sure Docker Desktop uses the WSL 2
  engine (*Settings → General*), and retry the `nvidia-smi -L` check above.
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
