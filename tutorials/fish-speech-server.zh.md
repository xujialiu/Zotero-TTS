<!-- translated-from: fish-speech-server.md sha256:7def094cc427 -->
# 自建 Fish Speech 服务器

[English](fish-speech-server.md) · **简体中文**

[fish-speech](https://github.com/fishaudio/fish-speech) 是 Fish Audio 开源的那一部分：它的 S2 Pro 模型跑在你自己的机器上，你给它一段简短的录音，它就能用那个声音说话。插件的 **Fish Audio** 那一节里有一块是给它的，标题是**本地**，会把它上面的每个语音都列出来，在播放器里写成 `Fish-local-<name>`，跟其他插件语音一样，归在 Zotero 的**本地**语音模式下面。高亮是按句的，不是按词：这个服务器不报词级时间戳。

## 它需要什么

- 一块有 **24 GB** 显存的 NVIDIA 显卡，跑在 Linux 上，或者 Windows 的 WSL 2 里。没有显卡就用 CPU，很慢——一句话可能要一分钟。
- Docker 加 NVIDIA runtime，或者 Python 3.12。
- 模型大约要 11 GB 磁盘空间，另外镜像还要 6 GB。
- 这个模型用的是 Fish Audio Research License 许可：研究和个人使用免费；商用要向 Fish Audio 申请许可。

## 用 Docker 跑起来

```sh
git clone https://github.com/fishaudio/fish-speech.git
cd fish-speech
pip install -U huggingface_hub
hf download fishaudio/s2-pro --local-dir checkpoints/s2-pro
COMPILE=1 docker compose --profile server up
```

> **国内网络**——模型是从 Hugging Face 下的，直连往往很慢甚至超时。给 `hf download` 那条命令加一个环境变量就能走镜像站：`HF_ENDPOINT=https://hf-mirror.com hf download fishaudio/s2-pro --local-dir checkpoints/s2-pro`（`huggingface_hub` 认这个变量）。`docker compose --profile server up` 拉的镜像在 Docker Hub 上，给 Docker 守护进程配镜像加速器（registry-mirrors）或者代理会顺畅一些。

- **`COMPILE=1` 很关键。**不加它，哪怕用的是数据中心级显卡，服务器也只能以实时速度的五分之一说话——一句话要 20–30 秒，播放器的试听按钮 15 秒后就会放弃，朗读也会卡住。加上它，一句话大约 5 秒。代价在第一次启动上：加载模型要几分钟，还要再编译大约 3 分钟，这期间服务器完全不会应答。
- 第一次启动还会构建镜像，要花一会儿；然后 API 会监听在 8080 端口上（换一个端口用 `API_PORT=9000 docker compose …`）。
- 仓库里的 `checkpoints/` 和 `references/` 文件夹会共享给容器，所以模型和语音在重启之后还在。
- 没有显卡就用 `BACKEND=cpu docker compose --profile server up`——朗读会在句与句之间卡住；见下文。
- 别的安装方式，以及服务器的参数——它要的密钥（`--api-key`）、另一个地址（`--listen`）——都在 [Fish Audio 的安装指南](https://speech.fish.audio/install/)里。

## 给它一个语音

服务器把 `references/` 文件夹里的语音提供出来：一个语音一个文件夹，文件夹名就是语音将来的名字，里面放一段 10–30 秒的干净录音，旁边再放一个同名、`.lab` 后缀的文本文件，写着录音里说的原话。服务器也能替你从一个 WAV 文件建一个，直接放进那个文件夹：

```sh
curl -X POST http://localhost:8080/v1/references/add \
  -F id=myvoice -F audio=@sample.wav -F text="the words spoken in sample.wav"
```

这个名字——这里是 `myvoice`——就是播放器里显示的名字；只能用字母、数字、空格、`-` 和 `_`。

## 在 Zotero 里

1. **编辑 → 设置 → Zotero-TTS → Fish Audio → 本地**：服务器在本机时，**地址**填 `http://localhost:8080`；在局域网里别的机器上，就把 `localhost` 换成它的名字或 IP 地址。
2. 服务器是用 `--api-key` 启动的：把 `Authorization: Bearer <密钥>` 填进**额外请求头**。
3. **测试连接** → *已连接。N 个语音可用。* → **启用**。
4. 在播放器里，这些语音是**本地**下面的 `Fish-local-<folder name>`，归在*多语种*下面：服务器不说某个语音讲哪种语言，而这个模型会说 80 种语言。

## 值得知道

- *一次只处理一句*：服务器是一个接一个处理请求的，而朗读会提前请求好几句。一句话如果要花上十秒以上，服务器就会跟不上这个节奏：播放器会停下来，显示*「无法连接到朗读服务」*和一个*「重试」*链接，服务器正忙时打开的文档，那一次可能一个语音都列不出来。编译一下（见上文），或者换一块更快的显卡。
- *试听按钮*在语音浏览器里最多等服务器 15 秒；晚到的音频不会被丢掉，下次点同一个语音的试听就会立刻播放。
- *「Cannot reach Fish Speech at …」*：服务器没起来，或者监听在别的地址；这一行写的就是插件试过的地址。
- *服务器没有的名字*会用一个默认语音读出来，而不是被拒绝；插件只提供服务器列出的那些名字，所以这一点只有你自己直接调用服务器时才用得上。
- *从你的网络外面*访问，走 Cloudflare，跟 Kokoro 一样：[教程](remote-access-cloudflare.zh.md)。
