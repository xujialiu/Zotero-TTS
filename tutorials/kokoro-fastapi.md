# Kokoro-FastAPI in Docker

[Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) is the plugin's
*Local engine*: a small, fast model with 68 voices in English, Chinese,
Japanese, French, Spanish, Italian, Portuguese and Hindi, and the only local
engine that reports word timings — so Read Aloud highlights word by word.
It runs entirely on your machine; the plugin talks to it at
`http://localhost:8880` (the **Address** field under *Local engine*).

The official Docker image bundles the model, CUDA and espeak-ng, so with
Docker installed it is one command.

## Prerequisites

Docker: Docker Desktop on Windows or macOS, Docker Engine on Linux. For an
NVIDIA GPU, a current driver — on Linux also the NVIDIA Container Toolkit; on
Windows nothing else. Check that containers can see the GPU:

```sh
docker run --rm --gpus all ubuntu:22.04 nvidia-smi -L
```

## Windows / Linux with an NVIDIA GPU

GeForce 900-series up to RTX 40-series (CUDA 12.6 build):

```sh
docker run -d --name kokoro --restart unless-stopped --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest
```

RTX 50-series (Blackwell) needs the CUDA 12.8 build:

```sh
docker run -d --name kokoro --restart unless-stopped --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest-cu128
```

## Without an NVIDIA GPU (any platform)

```sh
docker run -d --name kokoro --restart unless-stopped -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

Slower to start each sentence, but fine for reading — Kokoro is small enough
for a CPU.

## macOS

Docker on a Mac cannot use the GPU: the GPU image is CUDA-only and Apple's
Metal is not exposed to Linux containers. Two options:

- **Docker, CPU** — the command above; the CPU image is built for both Intel
  and Apple Silicon.
- **Native, Apple GPU (Metal / MPS)** — run Kokoro-FastAPI directly with
  [uv](https://docs.astral.sh/uv/) instead of Docker; the upstream script sets
  `DEVICE_TYPE=mps`, installs the dependencies, downloads the model and starts
  the server on port 8880:

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

## Check it

In Zotero, *Settings → Zotero-TTS → Local engine*, tick **Enable
Kokoro-FastAPI** and press **Test connection**; it should say `Connected. 68
voices available.` Then open Read Aloud, choose the Local tier, and pick a
`Kokoro-…` voice (`af_bella` and `af_heart` are good English voices;
`zf_xiaobei` / `zm_yunxi` speak Chinese). For word-by-word highlighting set
*Settings → General → Read Aloud → Highlight current* to **Word**.

## Day to day

```sh
docker stop kokoro          # free the GPU
docker start kokoro         # bring it back
docker logs --tail 50 kokoro
```

To update to a newer image:

```sh
docker pull ghcr.io/remsky/kokoro-fastapi-gpu:latest
docker rm -f kokoro
docker run -d --name kokoro --restart unless-stopped --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest
```

## Troubleshooting

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
- **Using it from another machine**: see [Reaching your TTS server from
  anywhere with Cloudflare](remote-access-cloudflare.md). The Local engine
  section has its own **Extra headers** field for the Access service token,
  so word-level highlighting survives the trip.
