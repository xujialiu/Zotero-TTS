# A Fish Speech server of your own

**English** · [简体中文](fish-speech-server.zh.md)

[fish-speech](https://github.com/fishaudio/fish-speech) is the open side
of Fish Audio: its S2 Pro model, running on your own machine, speaking in
any voice you give it a short recording of. The plugin's **Fish Audio**
section has a block for it — **Fish Speech server (your own)** — and lists
every voice on it under **Local** in the player, as `FishSpeech-<name>`.
Sentences are highlighted, not words: the server reports no word timings.

## What it needs

- An NVIDIA GPU with **24 GB** of memory, on Linux or on Windows through
  WSL 2. Without one it runs on the CPU, slowly — a sentence can take a
  minute.
- Docker with the NVIDIA runtime, or Python 3.12.
- About 11 GB of disk for the model, plus the 6 GB image.
- The model is under the Fish Audio Research License: free for research
  and personal use; commercial use needs a license from Fish Audio.

## Run it with Docker

```sh
git clone https://github.com/fishaudio/fish-speech.git
cd fish-speech
pip install -U huggingface_hub
hf download fishaudio/s2-pro --local-dir checkpoints/s2-pro
docker compose --profile server up
```

The first start builds the image, which takes a while; then the API
listens on port 8080 (`API_PORT=9000 docker compose …` for another). The
`checkpoints/` and `references/` folders of the repository are shared
with the container, so the model and the voices stay across restarts.
Without a GPU, `BACKEND=cpu docker compose --profile server up`. The
other ways to install, and the server's flags — a key it asks for
(`--api-key`), another address (`--listen`) — are in [Fish Audio's
install guide](https://speech.fish.audio/install/).

## Give it a voice

The server offers the voices in its `references/` folder: one folder per
voice, named as the voice will be, holding a recording of 10–30 seconds
of clean speech and, beside it, a text file with the same name and the
`.lab` extension that holds exactly what is said in the recording. The
server adds one for you from a WAV file, into that folder:

```sh
curl -X POST http://localhost:8080/v1/references/add \
  -F id=myvoice -F audio=@sample.wav -F text="the words spoken in sample.wav"
```

The name — `myvoice` here — is what the player shows; letters, digits,
spaces, `-` and `_` only.

## In Zotero

1. **Edit → Settings → Zotero-TTS → Fish Audio → Fish Speech server (your
   own)**: **Address** is `http://localhost:8080` for a server on this
   machine; on another machine of your LAN, its name or IP address in
   place of `localhost`.
2. A server started with `--api-key`: put `Authorization: Bearer <the
   key>` into **Extra headers**.
3. **Test connection** → *Connected. N voices available.* → **Enable**.
4. In the player, the voices are `FishSpeech-<folder name>` under
   **Local**, filed under *Multiple languages*: the server does not say
   which language a voice speaks, and the model speaks 80 languages.

## Good to know

- *One sentence at a time*: the server takes requests one after another.
  On a fast GPU a sentence arrives in a second or two.
- *"Cannot reach Fish Speech at …"*: the server is down or at another
  address; the line names the one the plugin tried.
- *From outside your network*, through Cloudflare, as with Kokoro:
  [tutorial](remote-access-cloudflare.md).
