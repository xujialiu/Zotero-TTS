<!-- translated-from: CONTEXT.md sha256:481d1a568300 -->
# Zotero-TTS

[English](CONTEXT.md) · **简体中文**

Zotero-TTS 的用语。Zotero-TTS 是一个 Zotero 10 插件，用用户自己的文本转语音服务朗读文档。插件起步于 Zotero 的朗读（Read Aloud），正一块一块地脱离它，所以这份术语表给朗读的每一块以及它周边的东西命名。这里只有定义：决定了什么、为什么，在 `docs/design/`（给项目所有者）和 `docs/adr/`（给工程师和智能体）里；测到了什么、何时测的，在 `notes/` 里。

## 用语

### 朗读的各个部分

**Document analysis（文档分析）**：
Zotero 对文档版面的解读：哪些是正文，哪些是页眉、页脚或引文，以及一个段落如何跨栏、跨页延续。永远是 Zotero 的。
_避免_：SDT、structure、layout analysis

**Segmentation（分句）**：
把正文切成一句一句朗读的句子，并判断文本的语言。
_避免_：sentence splitting、chunking

**Segment（句段）**：
朗读的一个单位：一个句子，以及它在文档中的位置。
_避免_：chunk

**Engine（引擎）**：
句段与高亮之间的一切：获取句段的音频、预读、解码、变速、句间停顿、播放、暂停、跳读，以及音频出错时怎么办。它永远不可见。单说时指插件自己的引擎；Zotero 的是朗读的引擎。
_避免_：controller、manager、backend、player

**Handoff（交接）**：
朗读从一个语音转到另一个语音而不停下：在两个语音都有时间戳的某个词处，否则在下一句开头。
_避免_：swap、transition

**Highlight（高亮）**：
在页面上标出正在朗读的句子和词。
_避免_：spotlight

**Follow（跟随）**：
滚动文档，让正在朗读的句子留在屏幕上，以及自动跟随与手动跟随之间的选择。
_避免_：tracking

**Player（播放器）**：
可见的控件：播放、暂停、跳读、速度、音量，以及服务商、语言和语音的选择。
_避免_：popup（Zotero 自己的播放器）、panel、bar（它的布局的名字）

**Layout（布局）**：
播放器所在的位置：工具栏下方的 Top bar、Bottom bar，或 Floating panel。"bar"和"panel"指的是布局，从不指播放器本身。
_避免_：position（朗读停下的地方）、variant

**Position（位置）**：
文档中朗读停下的地方，保存下来，以便在同一台电脑、另一台电脑或手机上从那里继续朗读。
_避免_：bookmark、progress

**Voice catalog（语音目录）**：
播放器提供的语音：每个已启用服务商的语音，连同收藏和按语言记住的选择。
_避免_：voice list（它在每个标签页里的快照）

### 语音的来源

**Provider（服务商）**：
插件可以指向的一个语音和音频来源：一项服务、用户自己的服务器，或操作系统。每个服务商在设置里有一节，并且在有语音时，在播放器里有一个条目。
_避免_：vendor、engine、backend、tier

**Entry（条目）**：
播放器第一个下拉框里的一项：一个有语音的服务商，或 Zotero 自己的两档之一。
_避免_：tier（Zotero 对它自己三档的叫法）、voice mode

**Zotero voices（Zotero 语音）**：
Zotero 自己出售的语音，Zotero 标准和 Zotero 高级，用 Zotero 账户上的额度付费。
_避免_：native voices、cloud voices、official voices

### Zotero 的一侧与插件的一侧

**Read Aloud（朗读）**：
Zotero 10 自带的朗读功能：它的播放器、引擎、分句、高亮和位置。这个名字只用于 Zotero 的部分。
_避免_：TTS（这项技术）、reader

**Reading（阅读）**：
插件自己对文档的朗读，从播放器经引擎到高亮，不依赖朗读（Read Aloud）运行。
_避免_：playback、Read Aloud

**Reading session（阅读会话）**：
一个文档被朗读，从播放到停止，在一个阅读器标签页里。所有标签页中同一时间只有一个。
_避免_：playback、stream
