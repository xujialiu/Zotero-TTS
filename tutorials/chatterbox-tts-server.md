# Chatterbox-TTS-Server in Docker (NVIDIA GPU)

[Chatterbox-TTS-Server](https://github.com/devnen/Chatterbox-TTS-Server)
wraps Resemble AI's Chatterbox models in a web UI and an OpenAI-compatible
API. Compared with Kokoro the voices are far more natural and expressive —
the Turbo model even understands tags like `[laugh]` and `[sigh]` — and you
can clone a voice from a short recording. What you give up: word timings (so
Read Aloud highlights sentence by sentence), speed (a long sentence takes a
few seconds), and it wants a real GPU.

The plugin uses it through the **OpenAI** section of its settings.

## GPU only

This tutorial covers NVIDIA GPUs in Docker, nothing else, on purpose. CPU
mode and the native macOS (Apple Silicon) build both work in the sense that
audio comes out, but in our tests a sentence took longer to synthesize than
to speak, so reading stalls after every sentence; they are not usable for
Read Aloud. Plan on a card with 6–8 GB of free VRAM. For reference, on an
RTX 3080 Ti a short sentence takes about 1.7 s and a long one about 8 s; the
plugin prefetches a few sentences ahead, which hides that.

## Prerequisites

- Docker: Docker Desktop on Windows (WSL 2 backend) or Docker Engine on Linux
  with the NVIDIA Container Toolkit.
- NVIDIA driver 525 or newer for RTX 20/30/40-series (CUDA 12.1 build), 570
  or newer for RTX 50-series (CUDA 12.8 build).
- Check that containers can see the GPU:

  ```sh
  docker run --rm --gpus all ubuntu:22.04 nvidia-smi -L
  ```

- Git, and about 15 GB of disk: there is no prebuilt image, the Docker image
  is built on your machine (≈ 10 GB), and the model is another 2–3 GB.

## 1. Get the code

```sh
git clone https://github.com/devnen/Chatterbox-TTS-Server.git
cd Chatterbox-TTS-Server
```

Everything below runs in this directory. It is also where the server keeps
its data: `config.yaml`, `voices/`, `reference_audio/`, `outputs/`, `logs/`.

## 2. Blank the placeholder Hugging Face token

The upstream `docker-compose.yml` ships `HF_TOKEN=YOUR_TOKEN_HERE`. Hugging
Face treats that as a real, invalid token and refuses the model download. The
models are public, so an empty token is all that is needed. Rather than edit
the upstream file (which `git pull` would then fight), add an override next
to it — `docker-compose.override.yml`:

```yaml
services:
  chatterbox-tts-server:
    environment:
      HF_TOKEN: ""
```

Docker Compose merges it automatically.

## 3. Build and start

RTX 20/30/40-series:

```sh
docker compose up -d --build
```

RTX 50-series (Blackwell) — name both files, because an override is only
picked up automatically next to the default `docker-compose.yml`:

```sh
docker compose -f docker-compose-cu128.yml -f docker-compose.override.yml up -d --build
```

The build takes around fifteen minutes (CUDA base image, PyTorch, the
chatterbox package). Then the container starts, and its first start
downloads the model. Follow along with

```sh
docker compose logs -f
```

until you see `Final device selection: cuda` — if it says `cpu`, the GPU is
not reaching the container; see Troubleshooting — and, a minute or two later,
`TTS Model loaded successfully on cuda` and `Application startup complete`.
The container restarts with Docker from now on (`restart: unless-stopped`),
and the model is cached in a Docker volume, so later starts take a minute.

## 4. Check it

The web UI is at http://localhost:8004 and the API docs at
http://localhost:8004/docs. From a terminal:

```sh
curl -s http://localhost:8004/api/model-info
curl -s http://localhost:8004/v1/audio/voices
curl -s -o test.mp3 -H "Content-Type: application/json" \
  -d '{"model":"tts-1","voice":"Emily.wav","input":"Chatterbox is running on the GPU.","response_format":"mp3"}' \
  http://localhost:8004/v1/audio/speech
```

The first answers `"device":"cuda"`, the second lists 28 voices, the third
writes a playable `test.mp3`.

## 5. Point the plugin at it

Zotero → Settings → TTS → **OpenAI** section:

| Field | Value |
|---|---|
| Enable OpenAI voices | on |
| Server | **Chatterbox-TTS-Server** — this fills in the address and grays out key, model and voices, which Chatterbox ignores |
| Base URL | `http://localhost:8004` (filled in by the preset; change it for another machine) |
| Extra headers | empty (only needed behind a gateway, see the Cloudflare tutorial) |

**Test connection** answers `Connected. 28 voices available. Synthesis
works.` In Read Aloud's *Local* tier the voices appear as
`OpenAI-Emily.wav`, `OpenAI-Henry.wav`, and so on. Highlighting is
per sentence whatever the *Highlight current* setting says, since the server
reports no word timings.

## Languages

The default engine, Chatterbox **Turbo**, speaks English only. For other
languages switch to the multilingual model (23 languages, Chinese among them):
in `config.yaml` set

```yaml
model:
  repo_id: chatterbox-multilingual
generation_defaults:
  language: zh
```

and restart (`docker compose restart`); the model downloads on the next start.
The plugin sends no language with its requests, so `generation_defaults.
language` is what every document is read in — one language per server. The
web UI can also switch engines without a restart.

## Your own voice

Put a clean 10–30 second WAV or MP3 of the speaker into `voices/`. It is
listed on the next **Test connection** and appears in Read Aloud under its
file name. (Files in `reference_audio/` work too but are not listed; they
would have to be typed into the **Voices** field.)

## Day to day

```sh
docker compose stop       # free the GPU
docker compose start
docker compose logs --tail 50
```

Update to a newer server:

```sh
git pull
docker compose up -d --build
```

## Troubleshooting

- **Build or first start fails downloading from huggingface.co** with a 401:
  the placeholder token is still set — step 2.
- **Log says `Final device selection: cpu`**: the container does not see the
  GPU. Re-run the `nvidia-smi -L` check; on Linux install the NVIDIA
  Container Toolkit; on Windows make sure Docker Desktop uses the WSL 2
  backend and the NVIDIA driver is current.
- **`CUDA out of memory`** in the log: another process holds the GPU — a
  Kokoro container, a game, a browser. Stop what you are not using; two TTS
  servers fit on 12 GB, but not much else.
- **"An unknown error occurred" part-way through a document**: the server
  failed on one sentence; `docker compose logs` shows why. Chatterbox cannot
  speak inputs of one or two tokens — a bare section number like `1.` — and
  answers HTTP 500 for them; the plugin plays a short pause for such
  segments instead of stopping (plugin 1.1.0 or newer), so with a current
  plugin this points at something else, such as a sentence that hit the
  plugin's 60-second synthesis limit.
- **The Test connection says the server rejected the API key**: it answered
  401 or 403. Locally that means the Base URL points at something else on
  that port; behind Cloudflare Access it means the headers are missing.
- **Using it from another machine**: [Reaching your TTS server from anywhere
  with Cloudflare](remote-access-cloudflare.md).
