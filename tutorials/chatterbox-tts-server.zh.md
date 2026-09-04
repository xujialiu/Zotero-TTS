<!-- translated-from: chatterbox-tts-server.md sha256:7e66b5928a90 -->
# 用 Docker 跑 Chatterbox-TTS-Server（NVIDIA 显卡）

[English](chatterbox-tts-server.md) · **简体中文**

[Chatterbox-TTS-Server](https://github.com/devnen/Chatterbox-TTS-Server) 把 Resemble AI 的 Chatterbox 模型包进了一个网页界面和一套 OpenAI 兼容 API。和 Kokoro 比，它的语音自然、有感情得多——Turbo 模型甚至认识 `[laugh]`、`[sigh]` 这样的标签——而且你可以拿一小段录音克隆一个语音。代价是：没有词级时间戳（所以朗读只能逐句高亮）、慢（一个长句要好几秒），而且它要一块真显卡。

插件是通过设置里的 **OpenAI** 那一节来用它的。

## 只讲显卡

本教程只讲 Docker 里的 NVIDIA 显卡，别的都不讲，这是故意的。CPU 模式和 macOS（Apple Silicon）上的原生构建都「能出声」，但我们测下来，合成一句话比读完这句话还慢，于是每读一句都要卡一下；拿来朗读是不能用的。请按有 6–8 GB 空闲显存的卡来准备。给个参照：在 RTX 3080 Ti 上，短句约 1.7 秒，长句约 8 秒；插件会提前预取几句，把这段等待藏起来。

## 前置条件

- Docker：Windows 上用 Docker Desktop（WSL 2 后端），Linux 上用 Docker Engine 加 NVIDIA Container Toolkit。
- NVIDIA 驱动：RTX 20/30/40 系列要 525 或更新（CUDA 12.1 构建），RTX 50 系列要 570 或更新（CUDA 12.8 构建）。
- 确认容器能看见显卡：

  ```sh
  docker run --rm --gpus all ubuntu:22.04 nvidia-smi -L
  ```

- Git，以及大约 15 GB 磁盘：官方没有预构建镜像，Docker 镜像要在你机器上构建（约 10 GB），模型另外还有 2–3 GB。

## 1. 取代码

```sh
git clone https://github.com/devnen/Chatterbox-TTS-Server.git
cd Chatterbox-TTS-Server
```

下面的命令都在这个目录里跑。服务器的数据也存在这里：`config.yaml`、`voices/`、`reference_audio/`、`outputs/`、`logs/`。

## 2. 把占位的 Hugging Face 令牌清空

上游的 `docker-compose.yml` 里写着 `HF_TOKEN=YOUR_TOKEN_HERE`。Hugging Face 会把它当成一个真实但无效的令牌，于是拒绝下载模型。这些模型是公开的，令牌留空就行。与其去改上游那个文件（之后 `git pull` 会跟你打架），不如在它旁边加一个覆盖文件 `docker-compose.override.yml`：

```yaml
services:
  chatterbox-tts-server:
    environment:
      HF_TOKEN: ""
```

Docker Compose 会自动把它合并进去。

> **国内网络**——模型是从 huggingface.co 下的，直连基本不通。在同一个覆盖文件里再加一行 `HF_ENDPOINT: "https://hf-mirror.com"` 即可走镜像站（`huggingface_hub` 认这个变量）。另外，构建镜像时要从 Docker Hub 和 PyPI 拉东西，那一步走不动的话，给 Docker 守护进程配代理（Docker Desktop：Settings → Resources → Proxies）比换源省事。

## 3. 构建并启动

RTX 20/30/40 系列：

```sh
docker compose up -d --build
```

RTX 50 系列（Blackwell）——两个文件都要点名，因为覆盖文件只有挨着默认的 `docker-compose.yml` 时才会被自动读取：

```sh
docker compose -f docker-compose-cu128.yml -f docker-compose.override.yml up -d --build
```

构建大约十五分钟（CUDA 基础镜像、PyTorch、chatterbox 包）。然后容器启动，第一次启动会下模型。跟着看：

```sh
docker compose logs -f
```

直到出现 `Final device selection: cuda`——如果写的是 `cpu`，说明显卡没进到容器里，见疑难解答——再过一两分钟出现 `TTS Model loaded successfully on cuda` 和 `Application startup complete`。此后容器会随 Docker 一起启动（`restart: unless-stopped`），模型缓存在一个 Docker 卷里，所以之后启动只要一分钟。

## 4. 检查一下

网页界面在 http://localhost:8004，API 文档在 http://localhost:8004/docs。在终端里：

```sh
curl -s http://localhost:8004/api/model-info
curl -s http://localhost:8004/v1/audio/voices
curl -s -o test.mp3 -H "Content-Type: application/json" \
  -d '{"model":"tts-1","voice":"Emily.wav","input":"Chatterbox is running on the GPU.","response_format":"mp3"}' \
  http://localhost:8004/v1/audio/speech
```

第一条应答里有 `"device":"cuda"`，第二条列出 28 个语音，第三条写出一个能播放的 `test.mp3`。

## 5. 把插件指过去

Zotero → 设置 → Zotero-TTS → **OpenAI** 那一节：

| 字段 | 填什么 |
|---|---|
| 启用 OpenAI 语音 | 开 |
| 服务器 | **Chatterbox-TTS-Server**——选了它会自动填好地址，并把密钥、模型、语音置灰，因为 Chatterbox 不看这几项 |
| API 地址 | `http://localhost:8004`（预设已填好；用别的机器就改这里） |
| 额外请求头 | 留空（只有服务器在网关后面才需要，见 Cloudflare 教程） |

**测试连接**会回答 `Connected. 28 voices available. Synthesis works.`。在朗读的*本地*语音模式里，这些语音显示为 `OpenAI-Emily.wav`、`OpenAI-Henry.wav` 等等。不管*高亮当前*怎么设，高亮都是逐句的，因为这个服务器不报词级时间戳。

## 语言

默认引擎 Chatterbox **Turbo** 只说英语。要别的语言就换成多语种模型（23 种语言，含中文）：在 `config.yaml` 里写

```yaml
model:
  repo_id: chatterbox-multilingual
generation_defaults:
  language: zh
```

然后重启（`docker compose restart`）；模型会在下次启动时下载。插件发请求时不带语言，所以 `generation_defaults.language` 就是所有文档被读成的语言——一台服务器一种语言。网页界面也能换引擎，不用重启。

## 用你自己的声音

把一段干净的、10–30 秒的说话人 WAV 或 MP3 放进 `voices/`。下一次**测试连接**就会把它列出来，在朗读里以文件名出现。（放在 `reference_audio/` 里的也能用，但不会被列出来；那样就得手动填进**语音**字段。）

## 日常使用

```sh
docker compose stop       # 把显卡让出来
docker compose start
docker compose logs --tail 50
```

升级到新版服务器：

```sh
git pull
docker compose up -d --build
```

## 疑难解答

- **构建或首次启动时从 huggingface.co 下载失败**，报 401：占位令牌还在，见第 2 步。
- **日志里写着 `Final device selection: cpu`**：容器看不见显卡。重跑一遍 `nvidia-smi -L` 检查；Linux 上装 NVIDIA Container Toolkit；Windows 上确认 Docker Desktop 用的是 WSL 2 后端，并且 NVIDIA 驱动是新的。
- **日志里 `CUDA out of memory`**：显卡被别的东西占着——一个 Kokoro 容器、一个游戏、一个浏览器。把不用的停掉；12 GB 上塞两个 TTS 服务器可以，再多就不行了。
- **读到一半冒出「发生一个未知错误。」**：服务器在某一句上失败了；`docker compose logs` 会说明原因。Chatterbox 读不了只有一两个 token 的输入——比如光秃秃的一个章节号 `1.`——对这种会返回 HTTP 500；插件遇到这种片段会用一小段静音顶上，不会停下（插件 1.1.0 或更新）。所以在新版插件上，这条提示指向的是别的问题，例如某一句撞上了插件 60 秒的合成上限。
- **测试连接说服务器拒绝了 API 密钥**：它返回了 401 或 403。在本机，这说明 API 地址指到了那个端口上的别的东西；在 Cloudflare Access 后面，这说明请求头没带上。
- **从另一台机器上用它**：[用 Cloudflare 在任何地方访问你的 TTS 服务器](remote-access-cloudflare.zh.md)。
