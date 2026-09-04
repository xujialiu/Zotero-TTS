<!-- translated-from: kokoro-fastapi.md sha256:b248e832fd8e -->
# 用 Docker 跑 Kokoro-FastAPI

[English](kokoro-fastapi.md) · **简体中文**

[Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) 就是插件里的*本地引擎*：一个又小又快的模型，68 个语音，覆盖英语、中文、日语、法语、西班牙语、意大利语、葡萄牙语和印地语，而且是唯一会报词级时间戳的本地引擎——所以朗读能逐词高亮。它整个跑在你自己的机器上；插件在 `http://localhost:8880` 上跟它说话（*本地引擎*那一节的**地址**字段）。

官方 Docker 镜像把模型、CUDA 和 espeak-ng 都打包进去了，所以装好 Docker 之后一条命令就够。

## 前置条件

Docker：Windows 和 macOS 上装 Docker Desktop，Linux 上装 Docker Engine。要用 NVIDIA 显卡，得有较新的驱动——Linux 上还要装 NVIDIA Container Toolkit，Windows 上不用别的。先确认容器能看见显卡：

```sh
docker run --rm --gpus all ubuntu:22.04 nvidia-smi -L
```

> **国内网络**——镜像放在 ghcr.io 上，直连往往很慢甚至超时。两条路：给 Docker 守护进程配代理，或者在镜像名前面加一个镜像站，例如南京大学的 `ghcr.nju.edu.cn/remsky/kokoro-fastapi-gpu:latest`（镜像站会变，用之前先确认它还在）。注意 Docker Hub 的「镜像加速器」（`registry-mirrors`）只对 Docker Hub 有效，对 ghcr.io 不起作用。模型已经打包在镜像里，所以拉下来之后不再需要访问 Hugging Face。

## Windows / Linux，有 NVIDIA 显卡

GeForce 900 系列到 RTX 40 系列（CUDA 12.6 构建）：

```sh
docker run -d --name kokoro --restart unless-stopped --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest
```

RTX 50 系列（Blackwell）需要 CUDA 12.8 的构建：

```sh
docker run -d --name kokoro --restart unless-stopped --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest-cu128
```

## 没有 NVIDIA 显卡（任何平台）

```sh
docker run -d --name kokoro --restart unless-stopped -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

每句话开口会慢一些，但读文章够用——Kokoro 小到 CPU 也扛得住。

## macOS

Mac 上的 Docker 用不了 GPU：GPU 镜像只支持 CUDA，而苹果的 Metal 不对 Linux 容器开放。两个选择：

- **Docker，走 CPU**——就是上面那条命令；CPU 镜像同时构建了 Intel 和 Apple Silicon 两个版本。
- **原生，用苹果的 GPU（Metal / MPS）**——不用 Docker，直接拿 [uv](https://docs.astral.sh/uv/) 跑 Kokoro-FastAPI；上游的脚本会设好 `DEVICE_TYPE=mps`，装依赖、下模型，并在 8880 端口上把服务器起起来：

  ```sh
  git clone https://github.com/remsky/Kokoro-FastAPI.git
  cd Kokoro-FastAPI
  ./start-gpu_mac.sh
  ```

  读的时候这个终端要一直开着；下次再跑一遍脚本就又起来了。

那几个 Docker 参数各是什么意思：`-d` 后台运行，`--restart unless-stopped` 让它随 Docker 一起回来，`--gpus all` 把显卡交给容器，`-p 8880:8880` 把服务器暴露在 `localhost:8880` 上。第一次要下几 GB；之后启动只要几秒。

## 检查一下

在 Zotero 里，*设置 → Zotero-TTS → 本地引擎*，勾上**启用 Kokoro-FastAPI**，按**测试连接**；它应该回答 `Connected. 68 voices available.`。然后打开朗读，语音模式选本地，挑一个 `Kokoro-…` 的语音（`af_bella` 和 `af_heart` 是不错的英语语音；`zf_xiaobei` / `zm_yunxi` 说中文）。要逐词高亮，把*设置 → 常规 → 朗读 → 高亮当前*设成**单词**。

## 日常使用

```sh
docker stop kokoro          # 把显卡让出来
docker start kokoro         # 再起来
docker logs --tail 50 kokoro
```

升级到新镜像：

```sh
docker pull ghcr.io/remsky/kokoro-fastapi-gpu:latest
docker rm -f kokoro
docker run -d --name kokoro --restart unless-stopped --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest
```

## 疑难解答

- **「本地 TTS 服务器没有在该地址运行。」** Docker 没在跑，或者容器停了——`docker ps` 应该能列出 `kokoro`。用 `docker start kokoro` 起来。
- **`port is already allocated`**：8880 被别的东西占了。要么把它停掉，要么用 `-p 8881:8880` 启动容器，并把插件的地址改成 `http://localhost:8881`。
- **找不到 GPU**（`could not select device driver "" with capabilities: [[gpu]]`）：升级 NVIDIA 驱动（Linux 上装 NVIDIA Container Toolkit），再跑一遍上面的 `nvidia-smi -L` 检查；或者改用 CPU 镜像。
- **语音在读，但没有逐词高亮**：把*设置 → 常规 → 朗读 → 高亮当前*设成**单词**。
- **从另一台机器上用它**：见[用 Cloudflare 在任何地方访问你的 TTS 服务器](remote-access-cloudflare.zh.md)。本地引擎那一节有自己的**额外请求头**字段可以放 Access 服务令牌，所以逐词高亮不会因为绕了一圈就没了。
