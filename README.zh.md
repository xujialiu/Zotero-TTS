<!-- translated-from: README.md sha256:31a562728afb -->
<h1 align="center">Zotero-TTS</h1>

<p align="center"><em>Zotero 10 朗读功能的增强插件：本地语音模式里更多语音、按你的颜色逐词与逐句高亮、键盘快捷键。</em></p>

<p align="center">
  <a href="https://www.zotero.org"><img src="https://img.shields.io/badge/Zotero-10-green?style=flat-square&logo=zotero&logoColor=CC2936" alt="Zotero 10"></a>
  <a href="https://github.com/xujialiu/Zotero-TTS/releases/latest"><img src="https://img.shields.io/github/v/release/xujialiu/Zotero-TTS?style=flat-square&label=Release" alt="最新发行版"></a>
  <a href="https://github.com/xujialiu/Zotero-TTS/releases"><img src="https://img.shields.io/github/downloads/xujialiu/Zotero-TTS/total?style=flat-square&label=Downloads" alt="下载量"></a>
  <a href="https://github.com/xujialiu/Zotero-TTS/commits/main"><img src="https://img.shields.io/github/last-commit/xujialiu/Zotero-TTS?style=flat-square&label=Last%20commit" alt="最近一次提交"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square" alt="许可证"></a>
</p>

<p align="center"><a href="README.md">English</a> · <b>简体中文</b></p>

<p align="center"><img src="assets/word-highlight.gif" width="720" alt="朗读正在读一段文字：正在读的词是蓝色，它所在的句子是黄色"></p>

## 这是什么

Zotero 10 自己就会朗读（Read Aloud）文档。本插件不取代它，而是增强它。朗读的活儿仍旧由 Zotero 干：播放器、断句、跳转按钮、高亮，以及它自己的标准语音和高级语音。插件只是往它的**本地**语音模式里添语音，再在边角处调整几件事。为什么这样做：[PHILOSOPHY.md](PHILOSOPHY.md)（英文）。

## 它增加了什么

- 🗣️ **本地语音模式里更多语音**——朗读播放器里，Azure Speech、装在你机器上的 [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI)、OpenAI 或任何 OpenAI 兼容服务器，与 Zotero 自己的标准、高级语音并列。[→ 服务商](#服务商)
- 🖥️ **Windows 自带的语音，升一等**——朗读本来就列出它们，但改由插件接管，于是它们也有语音浏览器、试听、收藏、缓存，还有逐词高亮——最后这项是 Zotero 自己那条路给不了的。[→ 系统语音](#系统语音)
- 🔖 **从上次停下的地方接着读**——关掉文档，过些天再打开，按 `Shift+Space`，朗读就从你上次停下的那一句开始。[→ 从上次停下的地方接着读](#从上次停下的地方接着读)
- 🎧 **设置里的语音浏览器**：按语音模式和语言列出每一个语音——你的和 Zotero 自己的——一个播放按钮试听，一颗心收藏，还有一个开关让播放器只提供收藏的语音。[→ 语音浏览器](#语音浏览器)
- ✨ **逐词高亮和逐句高亮同时进行**，颜色和不透明度都由你定——Zotero 自己的语音也一样。[→ 高亮](#高亮)
- ⌨️ **键盘快捷键**：加速、减速、复位；按句或按段跳转；从选中的文字开始读；把视图拉回正在朗读的地方；打开播放器的选项面板。全部可以改键。[→ 键盘快捷键](#键盘快捷键)
- 📌 **所有文档、所有标签页同一个语音和速度**——在任意标签页的播放器或语音浏览器里选一次即可，不再像 Zotero 那样按语言各记一个。[→ 朗读](#朗读)
- ⏱️ **停顿由你定**——每个语音句与句之间等多久、段落开头再多等多久，Zotero 自己的语音也算在内；读得越快，停顿越短。[→ 朗读](#朗读)
- 💾 **备份与同步**——设置和朗读位置可以存成文件，也可以走你自己的 WebDAV 文件夹：书签跟着你在几台电脑之间走，每台电脑的设置文件还会自己在服务器上保持最新。[→ 备份](#备份)

## 安装

到[最新发行版](https://github.com/xujialiu/Zotero-TTS/releases/latest)下载 `zotero-tts.xpi`（Firefox 里右键 → *链接另存为…*），用**工具 → 插件 → ⚙ → Install Plugin From File…** 装上（插件窗口没有中文），然后重启 Zotero；再到**编辑 → 设置 → Zotero-TTS** 里启用一个服务商，在**本地**语音模式下选一个以服务商命名的语音——`Kokoro-af_bella`、`Azure-Ava Multilingual`。

<p align="center"><img src="assets/popup.png" width="640" alt="朗读播放器，本地语音模式下选中了一个插件的语音"></p>

## 服务商

| 服务商 | 需要什么 | 费用 | 高亮 |
|---|---|---|---|
| **Azure Speech** | 语音资源的密钥和区域 · [教程](tutorials/azure-speech-free-tier.zh.md) | 免费额度：每月 50 万字符 | 逐词 |
| **Kokoro-FastAPI** | 一台跑在本机或局域网里的服务器 · [教程](tutorials/kokoro-fastapi.zh.md) | 免费；CPU 也能跑，有 GPU 更快 | 逐词 |
| **OpenAI 兼容服务器** | API 地址和模型；服务器若要密钥再加一个 | OpenAI 按字符计费；自建的服务器，例如 [Chatterbox](tutorials/chatterbox-tts-server.zh.md)，不花钱 | 逐句 |
| **系统语音** | 什么都不用——目前仅限 Windows | 免费、离线 | 逐词 |

每个服务商那一节的末尾都有**启用**：它会先跑一次连接检查，只有检查通过才真的把服务商打开。服务商开着时，这一节的字段是锁住的——要改先按**停用**。**测试连接**只探测，不改变任何开关。

API 密钥、网关请求头和 WebDAV 密码在设置面板里都是掩码显示的。服务商开着时字段锁住，任何地方都不显示它们；要回看某一个，先解锁那一节。它们和其他插件设置一样，以明文存在 Zotero 的首选项里，也会进入设置备份文件。

<details>
<summary><b>OpenAI 兼容服务器：各个字段</b></summary>

**服务器**下拉框写明是哪一种服务器——*OpenAI*、*Chatterbox-TTS-Server* 或*其他 OpenAI 兼容服务器*——并自动填上你上次配这种服务器时用的地址和模型（第一次则用它的默认值），这种服务器用不上的字段会置灰。**API 地址**填服务器地址，带不带 `/v1` 都行。**模型**填它认的名字；**测试连接**会取回服务器的模型列表，告诉你你填的那个在不在里面。**语音**留空就用服务器在 `/v1/audio/voices` 上公布的语音，也可以自己用逗号分隔列出语音 id。有些服务器没有 API 密钥，那就留空；只有 api.openai.com 一定要。Kokoro 请改用 **Kokoro-FastAPI** 那一节：逐词高亮是那条路才有的。

</details>

<details>
<summary><b>服务器在网关后面（Cloudflare Tunnel、反向代理）</b></summary>

把网关要的请求头填进**额外请求头**——OpenAI 那一节的，或者 Kokoro 就用 **Kokoro-FastAPI** 那一节的——写成 `名称: 值`，多个之间用 `;` 分隔，例如 `CF-Access-Client-Id: …; CF-Access-Client-Secret: …`。每个请求都会带上它们。[教程](tutorials/remote-access-cloudflare.zh.md)。

</details>

### 系统语音

Windows 本身就装了几个语音，朗读也早就把它们列在**本地**里。Zotero 是直接从浏览器引擎拿的，那条路既不交出音频也不交出词级时间戳——所以这些语音恰恰是插件唯一碰不到的一类：没有语音浏览器、没有试听、没有 ♡、没有缓存、没有逐词高亮。

*系统语音*那一节里的**启用**把它们接管过来。插件通过一个小的辅助进程自己去跟 Windows 的语音引擎对话，再把结果当作普通的插件语音公布出来，名字形如 `System-Microsoft David`、`System-Microsoft Huihui`——并且带词级时间戳，这比 Zotero 自己那条路能给的多。

不管这个开关开不开，Zotero 自己那几份同名语音都不会出现在播放器里：插件把它们藏了，因为 Zotero 是通过浏览器引擎去用它们的，插件为一个语音做的任何事都跟不过去。如果你原先选的正是那几份里的某一个，启用后它会被改指到插件的对应语音，于是照读不误。在 macOS 和 Linux 上，辅助进程还不存在，所以播放器提供的是 Zotero 自己的标准、高级语音，加上你配好的那些服务商。

<details>
<summary><b>细节</b></summary>

需要两套 Windows 接口，合起来正好就是朗读列出的那份名单：老式的「… Desktop」语音用 `System.Speech`，其余的用 `Windows.Media.SpeechSynthesis`。辅助进程是整个 Zotero 会话共用的一个 `powershell.exe`，读第一句时启动，随插件一起停止；合成一句要 10–100 毫秒，远快于实时。

音频按语音本来的语速合成，和其他服务商一样，再由朗读的滑块把它拉伸——所以同一个语音，听起来会跟 Zotero 自己那条路略有不同：Zotero 是去改引擎的语速。

macOS 和 Linux 还没覆盖；这一节里写明了，在那里启用会报错。

</details>

## 设置

全部在**编辑 → 设置 → Zotero-TTS** 里。

### 高亮

<p align="center"><img src="assets/settings-highlight.png" width="520" alt="高亮那一组"></p>

给词和它所在的句子各配一个颜色和一个不透明度，另有一个开关让逐词高亮时句子也保持高亮——Zotero 自己的语音也一样。逐词高亮还需要 Zotero 自己的那个开关：**设置 → 常规 → 朗读 → 高亮当前 → 单词**。

<details>
<summary><b>细节</b></summary>

预览按你阅读器的主题绘制。默认是黄色句子上的蓝色词，两者都是 70 %；*恢复默认颜色*把它们改回来（Zotero 自己的蓝是 `#4072e5`，45 % 和 30 %）。

</details>

### 键盘快捷键

<p align="center"><img src="assets/settings-shortcuts.png" width="440" alt="键盘快捷键那一组"></p>

`Shift+Space` 是唯一的播放键，任何时候都做对的事：已经开着的朗读，它负责暂停和继续；否则就开始读——从选中的文字、从你上次停下的地方（见下文），或者从当前看到的这一页。`Shift+O` 开合播放器的选项面板——速度滑块、语音模式、语言和语音。方向键、`Shift+Enter` 和 `Shift+O` 只在朗读打开时生效，其余时候保持它们原来的意思。点一下输入框就能改录成别的键。

## 从上次停下的地方接着读

听到一半关掉文档，过些天再打开，按 `Shift+Space`——朗读就从你上次停下的那一句开始。如果这个文档从没被朗读过，那就从你正看着的这一页开始。

<details>
<summary><b>细节</b></summary>

- Zotero 自己也记一个朗读位置，但你往外滚上几页，它就把它丢了。这里这个会一直留着。
- 继续时从你听到一半那句的**开头**读起。
- 每一个你听过的文档都记。位置只留在本机，除非打开了*在电脑之间同步朗读位置*（见[备份](#备份)）；它们从不进入设置备份文件。
- 文档里什么都不画，也不往你的注释里加任何东西。

</details>

### 语音浏览器

<p align="center"><img src="assets/settings-voices.png" width="700" alt="语音浏览器：语音模式、语言、语音三栏"></p>

朗读能用的每一个语音，按播放器自己的三步排列——语音模式、语言、语音。**▶** 试听一句，**♥** 收藏，点某一行就把那个语音设为**默认**：朗读在每个文档里都从它开始。**速度**滑块就是播放器自己的那个（0.5×–3×）。

<details>
<summary><b>收藏、试听、默认语音</b></summary>

- **本地**里是你启用的服务商公布的语音，**标准**和**高级**是 Zotero 自己的；多语种语音归在「多语言」下，排在语言那一栏的最前面。语言栏就是播放器上该语音模式的那个下拉框——同样的条目，同样的叫法。
- **▶**——你的语音会用它自己的语言说一句话，和平常的句子一样由你的服务商合成；Zotero 的语音说的是 Zotero 自己的示例，不花额度。
- *朗读播放器中只提供收藏的语音*会把播放器**在每个语音模式里**都裁到你标记过的那些——某个语音模式你一个都没标，它就是空的，Zotero 会把它置灰。一个都没标，或者标过的语音都不再列出时，就又全部提供。开关开着时，只有收藏的语音才能当默认；而默认语音不是收藏时，这个开关打不开。收藏会跟着设置备份走。
- 状态行按语音模式、语言、语音和速度写出默认语音（`默认语音：本地 | 中文 | Azure-晓晓 | 1.8×`）；点默认那一行就清除它，回到 Zotero 自己按语言各记一个的做法。设置开着时在任意标签页的播放器里另选一个语音，高亮会跟着挪过去。
- **速度**滑块按这个速度播放试听，松开滑块就把它设为朗读的起始速度——正在播放的文档立刻就变。Zotero 是把音频拉伸的，音高不变，所以拖滑块不产生新的请求。
- 只要还有标签页开着朗读，凡是会改变播放器列出内容的设置都会被拒绝，并给出提示，写明是哪些标签页——把它们关掉再试。Zotero 没有办法刷新已经打开的播放器的列表，而两个标签页列出不同的语音，会把*所有文档使用同一语音*送到其中一个没有的语音上。这些设置是：开关某个服务商、*朗读播放器中只提供收藏的语音*、只提供收藏时改动收藏，以及从文件或 WebDAV 恢复设置备份。

</details>

### 朗读

- *所有文档使用同一语音*——每个文档、每个打开的标签页都用同一个语音，不管文档是什么语言。关闭时，Zotero 按文档语言各记一个语音。
- *所有文档使用同一速度*——每个文档、每个打开的标签页都用同一个速度，来自播放器的滑块、快捷键或设置里的滑块。关闭时，Zotero 按文档语言各记一个速度。
- *句与句之间停顿*——每个语音读完一句要等多久再读下一句，不分语音模式，按 1 倍速计；读得越快，停顿按比例缩短。默认开启，值为 0，于是每个语音都一句接一句地读。关闭时，各语音按 Zotero 自己的设定停顿：Zotero 少数几个高级语音约 300 毫秒，其余没有，而且不会随速度缩短。
- *段落之间额外停顿*——在段落开头，于句间停顿之外再多等这么久，按 1 倍速计，同样随速度缩短。默认开启，值为 200 毫秒，也就是 Zotero 自己加的那一段。关闭时用 Zotero 的 200 毫秒，任何速度下都一样。
- *预取后面的 N 句*——当前句播放时提前合成后面的句子，播放就不必等服务器。Zotero 自己已经预取 3 句，你填的数字加在这之上。它开着时下面的缓存保持开启，音频就存在那里。
- *缓存已合成的音频*——往回跳或者重开文档时不再产生新的请求。存在内存里（64 MB）；Zotero 重启就清空。

<details>
<summary><b>细节</b></summary>

在任意标签页的播放器里选定那个唯一的语音，其他正在朗读的标签页会从各自当前那一句起换成它，其余的则在播放器打开时拿到。文档语言不同的播放器会被切到该语音的语言（一份中文 PDF 会用你的英文语音来读，断句也按英文规则）；多语种语音（Azure 的、OpenAI 的）归在播放器的「多语言」条目下，插件把它钉在语言列表的最上面。设置面板里语音的写法和播放器完全一致。

当默认语音在某个文档里没被提供时——它的服务商关了或者没响应，又或者只提供收藏的语音而默认不在其中——朗读会用它确实提供的第一个**本地**语音开始，你收藏过的优先，并在阅读器里给出提示说明用了哪一个。默认语音本身保留着，一旦重新被提供就回来。要是一个本地语音都没有，那就由 Zotero 自己挑，和没装插件时一样。

</details>

### 备份

*备份设置…* 和 *恢复设置…* 把每一项设置存成一个 JSON 文件；*导出朗读位置…* 和 *导入朗读位置…* 对你的书签做同样的事，存成另一个文件。恢复设置是覆盖式的；导入位置只是合并——文件里的位置比本机的新时才采用。

**同步**那一组把同样这些数据接到你自己的 WebDAV 文件夹上。每台电脑往那里写自己的设置文件，用**本机名称**字段命名，所以谁也不会覆盖谁的：

- **自动上传本机设置**（默认关闭）：任一设置改动几秒后，服务器上本机的那个文件就会刷新——换电脑前不必记得做什么。只上传；任何东西都不会自己应用到本机。
- **从服务器恢复设置…** 会列出这个文件夹里有什么——每台电脑的文件和它的日期——问你要哪一个，然后恢复它。
- **立即上传设置**手动上传一次，给那些不开自动开关的人用。

不管是从文件还是从服务器恢复，末了都会把它打开的每个服务商检查一遍，和**启用**跑的是同一个检查。在这台机器上不成立的那些（本机没在跑的本地服务器、早就换掉的密钥）会被留在**关闭**状态，旁边写明原因——而不是看着像开着，实际一声不响。

**在电脑之间同步朗读位置**（默认关闭）把[你停下的地方](#从上次停下的地方接着读)也放进同一个 WebDAV 文件夹，存成一个共用的文件：在一台电脑上听，到另一台按 `Shift+Space`，就从那一句接着读。位置是合并的——每台电脑贡献自己听过的文档，最新的位置胜出——所以打开它绝不会抹掉什么。它的前提是两台电脑持有同一个文库（同步过来的或者拷过来的）；它和设置文件互不相干：恢复设置不会挪动任何朗读位置，朗读位置里也不带任何设置。

<details>
<summary><b>WebDAV 地址示例</b></summary>

地址填的是一个文件夹，第一次上传时创建。Nextcloud：`https://cloud.example.com/remote.php/dav/files/<user>/zotero-tts/`；坚果云：`https://dav.jianguoyun.com/dav/zotero-tts/`，配一个应用密码。

</details>

## 疑难解答

<details>
<summary><b>常见问题</b></summary>

- **「本地 TTS 服务器没有在该地址运行。」** 服务器没起来，或者监听在别处——`docker ps` 应该能列出它；见它的教程。
- **语音在读，但没有逐词高亮**。把*设置 → 常规 → 朗读 → 高亮当前*设成**单词**，并且用一个会报词级时间戳的语音（Azure、Kokoro）。
- **用 OpenAI 兼容服务器时，读到一半冒出「发生一个未知错误。」** 服务器在某一段上失败了；查它的日志。
- **Zotero 更新之后插件的语音不见了**。朗读没有给插件的接口，插件是按阅读器标签页去挂 Zotero 内部接口的，一次更新可能让它的语音消失，直到插件跟上（Zotero 自己的语音照常）。请带上 Zotero 版本号开一个 [issue](https://github.com/xujialiu/Zotero-TTS/issues)。

</details>

## 兼容性

- 桌面版 Zotero 10，锁定在 `10.*`，包括自己从源码构建的版本（`10.0.SOURCE.…`）。Windows 和 macOS 上都在用；Linux 应该一样，但没测过。

## 开发

```
npm install
npm test          # vitest，同时构建 build/zotero-tts.xpi
npm run typecheck
npm run build
```

[notes/NOTES.md](notes/NOTES.md)（英文）记录着插件依赖的 Zotero 内部实现，以及到目前为止的每一次事故。

## 致谢

- 为 [Zotero](https://www.zotero.org) 插件开发者社区而作。
- 开发过程中用到了 [introfini/mcp-server-zotero-dev](https://github.com/introfini/mcp-server-zotero-dev)，从外部驱动 Zotero 的 MCP 桥。

## 许可证

[AGPL-3.0](LICENSE)，与 Zotero 本身相同的许可证。与 Zotero 官方无隶属关系。

## 请我喝杯咖啡

<a href="https://buymeacoffee.com/xujialiu"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="60" alt="请我喝杯咖啡"></a>
