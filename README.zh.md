<!-- translated-from: README.md sha256:e1e0db9cf967 -->
<p align="center"><img src="assets/icon.png" width="80" alt="Zotero-TTS 图标"></p>
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

<p align="center">如果你喜欢 Zotero-TTS，欢迎到 <a href="https://github.com/xujialiu/Zotero-TTS">GitHub</a> 给它点个 ⭐——让更多人发现它。</p>

## 它增加了什么

Zotero 10 自己就会朗读（Read Aloud），本插件不取代它的播放器——只是往播放器的**本地**语音模式里添语音，并把周边调得更顺手。[为什么这样做](PHILOSOPHY.md)（英文）。

- 🗣️ **本地语音模式里更多语音**——朗读播放器里，Azure Speech、装在你机器上的 [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI)、OpenAI 或任何 OpenAI 兼容服务器。[→ 服务商](#服务商)
- 🔖 **从上次停下的地方接着读**——关掉文档，过些天再打开，按 `Shift+Space`，朗读就从你上次停下的那一句开始。[→ 从上次停下的地方接着读](#从上次停下的地方接着读)
- 🎧 **设置里的语音浏览器**：按语音模式和语言列出每一个语音，一个播放按钮试听，一颗心收藏，还有一个开关让播放器只提供收藏的语音。[→ 语音浏览器](#语音浏览器)
- ✨ **逐词高亮和逐句高亮同时进行**，颜色和不透明度都由你定——Zotero 自己的语音也一样。[→ 高亮](#高亮)
- ⌨️ **键盘快捷键**：调速、调音量、按句或按段跳转、从选中的文字开始读、打开播放器的选项面板。全部可以改键。[→ 键盘快捷键](#键盘快捷键)
- 📌 **所有文档、所有标签页同一个语音和速度**——不再像 Zotero 那样按语言各记一个。[→ 朗读](#朗读)
- ⏱️ **停顿由你定**——每个语音句与句之间等多久、段落开头再多等多久；读得越快，停顿越短。[→ 朗读](#朗读)
- 💾 **备份与同步**——设置和朗读位置可以存成文件，也可以走你自己的 WebDAV 文件夹，书签跟着你在几台电脑之间走。[→ 备份与同步](#备份与同步)
- 🖥️ **Windows 和 macOS 的语音，改由插件来读**——就是朗读本来就列出的那些，但有了试听、收藏、缓存，Windows 上还有逐词高亮。[→ 服务商](#服务商)

## 安装

1. 到[最新发行版](https://github.com/xujialiu/Zotero-TTS/releases/latest)下载 `zotero-tts.xpi`——Firefox 里右键 → *链接另存为…*
2. **工具 → 插件 → ⚙ → Install Plugin From File…**（插件窗口没有中文），然后重启 Zotero。
3. 到**编辑 → 设置 → Zotero-TTS** 里启用一个服务商，再在播放器的**本地**语音模式下选它的语音——`Kokoro-af_bella`、`Azure-Ava Multilingual`。

<p align="center"><img src="assets/popup.png" width="640" alt="朗读播放器，本地语音模式下选中了一个插件的语音"></p>

## 服务商

| 服务商 | 需要什么 | 费用 | 高亮 |
|---|---|---|---|
| **Azure Speech** | 语音资源的密钥和区域 · [教程](tutorials/azure-speech-free-tier.zh.md) | 免费额度：每月 50 万字符 | 逐词 |
| **Kokoro-FastAPI** | 一台跑在本机或局域网里的服务器 · [教程](tutorials/kokoro-fastapi.zh.md) | 免费；CPU 也能跑，有 GPU 更快 | 逐词 |
| **OpenAI 兼容服务器** | API 地址和模型；服务器若要密钥再加一个 | OpenAI 按字符计费；自建的服务器，例如 [Chatterbox](tutorials/chatterbox-tts-server.zh.md)，不花钱 | 逐句 |
| **Xiaomi MiMo** | 一个 platform.xiaomimimo.com 的 API 密钥，在 OpenAI 那一节的**服务器**下拉框里选 | 限时免费 | 逐句 |
| **系统语音** | 什么都不用——Windows 和 macOS | 免费、离线 | Windows 逐词，macOS 逐句 |

- 每个服务商那一节末尾的**启用**会先跑一次连接检查：连不上的服务商不会被打开。
- **测试连接**只探测，不改变任何开关。
- 服务商开着时，这一节的字段是锁住的——要改先按**停用**。
- API 密钥、网关请求头和 WebDAV 密码都是掩码显示的。它们和其他插件设置一样，以明文存在 Zotero 的首选项里，也会进入设置备份文件。

<details>
<summary><b>OpenAI 兼容服务器：各项怎么填</b></summary>

- **服务器**写明是哪一种服务器——*OpenAI*、*Chatterbox-TTS-Server*、*Xiaomi MiMo* 或*其他 OpenAI 兼容服务器*——并自动填上你上次配这种服务器时用的地址、模型、密钥、语音和请求头（第一次则用它的默认值，不会带上别的服务器的），这种服务器用不上的字段会置灰。
- **API 地址**填服务器地址，带不带 `/v1` 都行。
- **模型**填它认的名字；**测试连接**会取回服务器的模型列表，告诉你你填的那个在不在里面。
- **语音**留空就用服务器提供的那些，也可以自己用逗号分隔列出语音 id。
- **API 密钥**：有些服务器没有，那就留空；只有 api.openai.com 一定要。
- Kokoro 请改用 **Kokoro-FastAPI** 那一节：逐词高亮是那条路才有的。
- *Xiaomi MiMo* 用 platform.xiaomimimo.com 的密钥，**语音**留空时提供 MiMo 内置的中英文语音；它的语音不带逐词时间，所以按句高亮。
- 选 *OpenAI* 或 *Xiaomi MiMo* 时，地址和官方域名只差一两个字母的会在发出任何请求之前当作拼写错误拒绝，其他地址照常测试，但会注明它不是官方地址——镜像或代理。

</details>

<details>
<summary><b>Cloudflare Tunnel 等网关</b></summary>

把网关要的请求头填进**额外请求头**——OpenAI 那一节的，或者 Kokoro 就用 **Kokoro-FastAPI** 那一节的——写成 `名称: 值`，多个之间用 `;` 分隔，例如 `CF-Access-Client-Id: …; CF-Access-Client-Secret: …`。每个请求都会带上它们。[教程](tutorials/remote-access-cloudflare.zh.md)。

</details>

<details>
<summary><b>系统语音</b></summary>

朗读早就把 Windows 和 macOS 自带的语音列在**本地**里了，但那是光秃秃的：不能试听、不能收藏、没有缓存、没有逐词高亮。

*系统语音*那一节里的**启用**把这些都给它们：

- 它们会以 `System-Microsoft David`、`System-Samantha` 这样的名字回来——还是那些语音，但背后有了语音浏览器、试听、收藏和缓存。
- Windows 上有逐词高亮；macOS 上高亮停在句子上，而且每句要多花约半秒才开口。
- Zotero 自己那几份同名语音会从播放器里退场，所以不会列出两遍；你原先选的那个照读不误。
- 语速快的时候，这些语音听起来会和以前略有不同。
- Windows 上你可能会看到 Zotero 开着时多出一个 `powershell.exe`；Linux 不支持。

</details>

## 从上次停下的地方接着读

听到一半关掉文档、退出 Zotero，过几天回来按 `Shift+Space`——朗读就从你停下的那一句接着读。Zotero 自己不保留这个位置，插件替你保留，每一个你听过的文档都记。

- 从那一句的**开头**接着读，不会从半句中间起。
- 文档里什么都不画，也不往你的标注里加任何东西。
- 从没听过的文档，就从你正看着的那一页开始读。
- 位置只留在本机，除非你打开*在电脑之间同步朗读位置*（见[备份与同步](#备份与同步)）；打开之后它们就跟着你走：在一台电脑上停下，到另一台按 `Shift+Space`，从那一句接着读。

## 设置

全部在**编辑 → 设置 → Zotero-TTS** 里。

### 高亮

<p align="center"><img src="assets/settings-highlight.png" width="520" alt="高亮那一组"></p>

- 给词和它所在的句子各配一个颜色和一个不透明度，另有一个开关让逐词高亮时句子也保持高亮——Zotero 自己的语音也一样。
- 默认是黄色句子上的蓝色词，两者都是 70 %；*恢复默认颜色*把它们改回来。
- 预览按你阅读器的主题绘制。
- 逐词高亮还需要 Zotero 自己的那个开关：**设置 → 常规 → 朗读 → 高亮当前 → 单词**。

### 键盘快捷键

<p align="center"><img src="assets/settings-shortcuts.png" width="440" alt="键盘快捷键那一组"></p>

**`Shift+Space` 是你唯一需要记的键**——不管当时是什么情形，都是这一个键：

- 选中了文字：从选中的地方开始读。
- 没选中文字，而这个文档你以前听过：从[上次停下的那一句](#从上次停下的地方接着读)接着读。
- 没选中文字，这个文档也没听过：从你正看着的这一页开始读。
- 朗读已经在读了：按一下暂停；再按一下从同一句继续——暂停期间你要是选了一段文字，就从那里重新开始。

### 语音浏览器

<p align="center"><img src="assets/settings-voices.png" width="700" alt="语音浏览器：语音模式、语言、语音三栏"></p>

朗读能用的每一个语音，按播放器自己的三步排列——语音模式、语言、语音。

- **▶** 试听一句，**♥** 收藏。
- 点某一行就把那个语音设为**默认**：朗读在每个文档里都从它开始。
- **速度**就是播放器自己的那个滑块（0.5×–3×）；**音量**是朗读的响度，100% 是 Zotero 本来的响度。

<details>
<summary><b>收藏、试听、默认语音</b></summary>

- **本地**里是你启用的服务商公布的语音，**标准**和**高级**是 Zotero 自己的；多语种语音归在「多语言」下，排在语言那一栏的最前面。
- **▶**——用语音自己的语言试听一句：你的语音要花一次短请求，Zotero 自己的不花钱。
- *朗读播放器中只提供收藏的语音*会把播放器**在每个语音模式里**都裁到你标记过的那些——某个语音模式你一个都没标，它就是空的，Zotero 会把它置灰。一个都没标，或者标过的语音都不再列出时，就又全部提供。开关开着时，只有收藏的语音才能当默认；而默认语音不是收藏时，这个开关打不开。收藏会跟着设置备份走。
- 收藏也会显示在播放器自己的语音列表里：*朗读播放器中只提供收藏的语音*关着时，标记过的语音在下拉列表里带一颗 ♥，其余的没有，于是不必舍弃别的语音也能找到收藏的那个。它是标记，不是按钮——收藏在这里标——开关开着时它就没有了，那时列出的每一个语音都是收藏。
- 点默认那一行就清除默认语音，回到 Zotero 自己按语言各记一个的做法。设置开着时在任意标签页的播放器里另选一个语音，高亮会跟着挪过去。
- **速度**滑块按这个速度播放试听，松开滑块就把它设为朗读的起始速度——正在播放的文档立刻就变。改速度不花钱，音高也不变。
- **音量**（0–100%）对每个语音都有效，Zotero 自己的标准和高级也在内，试听也一样；改动落在正在读的这一句上，每个打开的标签页都是。朗读打开时，`Shift+↑` / `Shift+↓` 调的是同一个数。
- 只要还有标签页开着朗读，凡是会改变播放器列出内容的设置都会被拒绝，并给出提示，写明是哪些标签页——把它们关掉再试。这些设置是：开关某个服务商、*朗读播放器中只提供收藏的语音*、只提供收藏时改动收藏，以及从文件或 WebDAV 恢复设置备份。

</details>

### 朗读

<details>
<summary><b>统一语音与速度、停顿、预取、缓存</b></summary>

- *所有文档使用同一语音*——每个文档、每个打开的标签页都用同一个语音，不管文档是什么语言。关闭时，Zotero 按文档语言各记一个语音。
- *所有文档使用同一速度*——每个文档、每个打开的标签页都用同一个速度，来自播放器的滑块、快捷键或设置里的滑块。关闭时，Zotero 按文档语言各记一个速度。
- *句与句之间停顿*——每个语音读完一句要等多久再读下一句，不分语音模式，按 1 倍速计；读得越快，停顿按比例缩短。默认开启，值为 0，于是每个语音都一句接一句地读。关闭时，各语音按 Zotero 自己的设定停顿。
- *段落之间额外停顿*——在段落开头，于句间停顿之外再多等这么久，按 1 倍速计，同样随速度缩短。默认开启，值为 200 毫秒。关闭时用 Zotero 自己的那一段停顿，任何速度下都一样。
- *预取后面的 N 句*——当前句播放时提前合成后面的句子，播放就不必等服务器。它要用到下面的缓存，所以会让缓存保持开启。
- *缓存已合成的音频*——往回跳或者重开文档时不再产生新的请求。存在内存里（64 MB）；Zotero 重启就清空。

</details>

### 备份与同步

**朗读位置同步**——书签跟着你在几台电脑之间走。

- 打开*在电脑之间同步朗读位置*，给它一个你自己的 WebDAV 文件夹。
- 共用这个文件夹、又持有同一个文库的电脑就都对得上：在一台上听到哪里停下，到另一台按 `Shift+Space`，就从那一句接着读。
- 打开它不会弄丢任何一台电脑上的书签。
- 没有服务器也行：*导出朗读位置…* 和 *导入朗读位置…* 把同一批书签存成文件带走。

**设置备份与同步**

- 用*备份设置…*、*恢复设置…* 把每一项设置存成一个文件。
- 同一个 WebDAV 文件夹也能替你保管每台电脑的设置、并自动保持最新，好在另一台上恢复。
- 恢复到的那台电脑上用不了的服务商会保持关闭，并说明原因。

<details>
<summary><b>WebDAV 地址示例</b></summary>

地址填的是一个文件夹，第一次上传时创建。Nextcloud：`https://cloud.example.com/remote.php/dav/files/<user>/zotero-tts/`；坚果云：`https://dav.jianguoyun.com/dav/zotero-tts/`，配一个应用密码。

</details>

## 疑难解答

<details>
<summary><b>常见问题</b></summary>

- **「Cannot reach Kokoro at http://localhost:8880. Is the server running?」** 服务器没起来，或者监听在别的地址——这一行写的就是它试过的地址；`docker ps` 应该能列出服务器；见它的教程。
- **语音在读，但没有逐词高亮**。把*设置 → 常规 → 朗读 → 高亮当前*设成**单词**，并且用一个会报词级时间戳的语音（Azure、Kokoro）。
- **用 OpenAI 兼容服务器时，读到一半冒出「发生一个未知错误。」** 服务器在某一段上失败了；查它的日志。
- **Zotero 更新之后插件的语音不见了**。一次更新可能让它们消失，直到插件跟上；Zotero 自己的语音照常。请带上 Zotero 版本号开一个 [issue](https://github.com/xujialiu/Zotero-TTS/issues)。

</details>

## 兼容性

- 桌面版 Zotero 10，任何 10.x 版本都行，自己从源码构建的也算。Windows 和 macOS 上都在用；Linux 应该一样，但没测过。

## 开发

```
npm install
npm test          # vitest，同时构建 build/zotero-tts.xpi
npm run typecheck
npm run build
```

[notes/NOTES.md](notes/NOTES.md)（英文）记录着插件依赖的 Zotero 内部实现，以及到目前为止的每一次事故。

## 致谢

- 开发过程中用到了 [introfini/mcp-server-zotero-dev](https://github.com/introfini/mcp-server-zotero-dev)，从外部驱动 Zotero 的 MCP 桥。

## 许可证

[AGPL-3.0](LICENSE)，与 Zotero 本身相同的许可证。与 Zotero 官方无隶属关系。

## 请我喝杯咖啡

<a href="https://buymeacoffee.com/xujialiu"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="60" alt="请我喝杯咖啡"></a>
