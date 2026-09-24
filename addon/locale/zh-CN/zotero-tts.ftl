# Zotero-TTS — 简体中文。en-US 文件是源头；这里的每条消息、属性和变量都与它一一对应
# (test/l10n.test.ts)。用词沿用 Zotero 自己的中文：朗读、语音、语音模式、设置。


## Provider sections

ztts-field-api-key =
    .value = API 密钥
ztts-field-model =
    .value = 模型
ztts-field-voices =
    .value = 语音
# 语音框的占位提示：留空时提供什么（issue #113）
ztts-voices-input-builtin =
    .placeholder = 内置语音
ztts-voices-input-server =
    .placeholder = 服务器自带的语音
ztts-field-extra-headers =
    .value = 额外请求头
ztts-help-extra-headers =
    .value = ?
    .help = 只在服务器通过 Cloudflare Access 远程访问时需要：把它的服务令牌写成两个请求头，CF-Access-Client-Id: …; CF-Access-Client-Secret: …（见 README 里的 Cloudflare 教程）。其他情况留空。
# 说 OpenAI 接口的三节（issue #113）
ztts-help-openai =
    .value = ?
    .help = 密钥和模型名来自 platform.openai.com；OpenAI 按字符计费。语音留空则用 OpenAI 自己的语音，也可填写更新的语音。按句高亮，不逐词。OpenAI 的代理或镜像请填在 OpenAI Compatible 一节。
ztts-help-mimo =
    .value = ?
    .help = 密钥来自 platform.xiaomimimo.com；目前免费。语音留空则用 MiMo 内置的中英文语音，也可填写你自己的。按句高亮，不逐词。
ztts-help-compatible =
    .value = ?
    .help = 任何说 OpenAI 接口的服务器：Chatterbox-TTS-Server、托管服务、OpenAI 的代理。地址带不带 /v1 都行；密钥只在服务器需要时填；模型按服务器的叫法填，测试连接会列出它有的模型。语音留空则用服务器自带的语音。按句高亮，不逐词。一次一个服务器。
ztts-test-connection =
    .label = 测试连接
ztts-field-region =
    .value = 区域
ztts-field-account-id =
    .value = 账户 ID
ztts-field-api-token =
    .value = API 令牌
ztts-help-cloudflare =
    .value = ?
    .help = 两个值都在 Cloudflare 控制台的 Workers AI 页面上：Use REST API → Create a Workers AI API Token，旁边就是 Account ID。Workers AI 的每个文本转语音模型都会列出来，每个语音归在自己的语言下。按句高亮，不逐词。每天有 10,000 个免费 Neurons：Aura 语音够读几页，MeloTTS 够读几个小时（见 README 里的教程）。
ztts-help-speechify =
    .value = ?
    .help = 密钥在 Speechify 工作区的 API keys 页面上（platform.speechify.ai）。密钥能列出的每个语音都归在自己的语言下——没有普通话，只有粤语——并逐词高亮。免费：每月 50,000 字符，约十几页，往前跳读时开头可能要等一两秒；之后每月 10 美元 100 万字符。
ztts-help-fish =
    .value = ?
    .help = 密钥在 fish.audio 账号的 Developers 页面上。下面的来源开关决定是否列出官方语音、你的语音和 Model IDs；模型自带的 Default 始终可用。它们都支持逐词高亮。免费模型不花钱，但会保留你的请求文本，不保证速度，也可能随时结束；付费模型按文本字节计费，一个汉字算三个字节。
ztts-fish-free-only =
    .label = 只用免费模型
ztts-help-fish-free-only =
    .value = ?
    .help = 勾上，每句话都走免费的 S2.1 Pro：不需要 API 余额，不保证速度，Fish Audio 可能保留文本用于改进模型。不勾，走付费的 S2.1 Pro，每百万字节文本 15 美元，从账号的 API 余额扣，这个余额和网站上的点数是分开的——没有余额时，"测试连接"会直接说明。
ztts-heading-fish-sources =
    .value = 语音来源
ztts-fish-include-official =
    .label = 官方语音
ztts-help-fish-include-official =
    .value = ?
    .help = Fish Official 发布的语音。关闭后，官方语音不会进入自动列表。
ztts-fish-include-own =
    .label = 我的语音
ztts-help-fish-include-own =
    .value = ?
    .help = 你的 Fish Audio 账户中的语音。关闭后，账户语音不会进入自动列表。
ztts-fish-include-manual =
    .label = 手动语音
ztts-help-fish-include-manual =
    .value = ?
    .help = 你填入的 Model ID 对应的音色。关闭后会隐藏这些音色，但保留已保存的 ID。
ztts-field-fish-voices = 语音（<label data-l10n-name="model-ids">Model IDs</label>）
ztts-fish-model-ids-input =
    .placeholder = Fish Audio 上的 IDs
ztts-help-fish-model-ids =
    .value = ?
    .help = Fish Audio 中的 Model ID 就是音色的 ID。可在 https://fish.audio/app/discovery/ 查找音色，打开其页面并复制 Model ID。多个 ID 用逗号或空格隔开；以前粘贴的音色链接仍然有效。
ztts-help-fish-speech =
    .value = ?
    .help = 本机或局域网里的 fish-speech API 服务（见 README 里的教程）：服务器上的每个参考语音都会列出来，按句高亮，不逐词。需要 24 GB 显存。用 --api-key 启动的服务器，把密钥以 "Authorization: Bearer …" 的形式填进"额外请求头"。
ztts-field-address =
    .value = 地址
ztts-heading-system-voices = 系统语音
# One note per platform; ui/platform-class.ts shows the one that applies
ztts-system-note-win = Windows 自带的语音，带逐词高亮。
ztts-system-note-mac = Mac 自带的语音，按句高亮。
ztts-system-note-other = Linux 上不可用。
ztts-help-system-voices =
    .value = ?
    .help = 插件接管系统自带的语音，于是它们和其他服务商的语音一样，有语音浏览器、试听、收藏和缓存。Windows 上还有逐词高亮；macOS 上按句高亮。不支持 Linux。

## The provider switch, written by ui/provider-rows.ts

## Zotero 自带的语音（issue #111）：每档一个开关，没有字段

ztts-zotero-note = Zotero 自带的语音，需要登录 Zotero 账户。关掉的一档从播放器中消失；标准和高级各有自己的额度，在播放器里购买。
ztts-help-zotero =
    .value = ?
    .help = 标准和高级是登录 Zotero 账户（设置 → 同步）后 Zotero 自己提供的语音，各有自己的额度，在播放器里显示和购买。关掉一档，它就从播放器的第一个下拉框、语音浏览器和语言列表里消失；Zotero 记住的语音不会丢，重新打开就回来。没登录时启用是灰的；登录后，启用会先检查 Zotero 在这一档列出了语音。
ztts-zotero-standard = 标准
ztts-zotero-premium = 高级
ztts-zotero-not-signed-in = 未登录 Zotero 账户：请在 设置 → 同步 中登录。
ztts-zotero-tier-empty = Zotero 没有列出{ $tier }语音。
ztts-zotero-tier-ok = 已登录：{ $tier }语音 { $count } 个，剩余额度 { $credits }。
ztts-zotero-tier-ok-no-credits = 已登录：{ $tier }语音 { $count } 个。

# 密钥、网关请求头、WebDAV 密码后面的眼睛：露出内容，便于查看、选中和复制，再点收起。服务启用后变灰，内容一律遮住。
ztts-secret-show = 显示内容
ztts-secret-hide = 隐藏内容

ztts-switch-enable = 启用
ztts-switch-disable = 停用
ztts-switch-checking = 正在检查…
ztts-switch-testing = 正在测试…


## Voice browser

ztts-heading-voice-browser = 语音浏览器
ztts-favorites-only =
    .label = 朗读播放器中只提供收藏的语音
    .bold = 收藏的语音
ztts-voices-speed =
    .value = 速度
    .tooltiptext = 试听按此速度播放；开启“所有文档使用同一速度”后，松开滑块即把它设为朗读的起始速度
ztts-volume =
    .value = 音量
ztts-volume-percent =
    .value = %
ztts-help-volume =
    .value = ?
    .help = 朗读的响度，对每个语音和这里的试听都有效。100% 是 Zotero 本来的响度，也是最大值。朗读打开时，下面的音量键每次调 10%，正在读的这一句立刻生效。


## Reading

ztts-heading-reading = 朗读
ztts-open-expanded =
    .label = 打开时展开播放器
ztts-help-open-expanded =
    .value = ?
    .help = 每次打开悬浮面板时显示语音服务、语言和声音三行；使用 Zotero 原播放器时展开其选项面板。点击选项或按 Shift+O 可在本次打开期间收起或展开。设置更改在下次打开播放器时生效。
ztts-one-voice =
    .label = 所有文档使用同一语音
ztts-help-one-voice =
    .value = ?
    .help = 所有文档、所有打开的标签页都用同一个语音。关闭时：Zotero 按文档语言各记一个语音。
ztts-one-speed =
    .label = 所有文档使用同一速度
ztts-help-one-speed =
    .value = ?
    .help = 所有文档、所有打开的标签页都用同一个速度。关闭时：Zotero 按文档语言各记一个速度。
ztts-sentence-pause =
    .label = 句与句之间停顿
ztts-paragraph-pause =
    .label = 段落之间额外停顿
ztts-pause-ms =
    .value = 毫秒
ztts-help-sentence-pause =
    .value = ?
    .help = 每个语音读完一句后等多久再读下一句，按 1 倍速计；读得越快，停顿按比例缩短。关闭时：各语音按 Zotero 自己的设定停顿，不同语音不一样，也不随速度缩短。
ztts-help-paragraph-pause =
    .value = ?
    .help = 段落开头在句间停顿之外再多等多久，按 1 倍速计；读得越快，按比例缩短。关闭时：用 Zotero 自己的额外停顿，所有语音、所有速度都一样。
ztts-skipped-lines =
    .label = Zotero 漏读页首一行时，补读这一行
ztts-help-skipped-lines =
    .value = ?
    .help = 一句话跨到下一页时，那一页的第一行可能被 Zotero 漏掉：朗读直接跳过去，接起来听着仍像一句话。开启时这一行照常朗读、照常高亮。若某页的页眉被读了出来，就关掉它。对之后打开的文档生效。
ztts-split-sentences =
    .label = Zotero 把一句话切成两句时，合成一句朗读
ztts-help-split-sentences =
    .value = ?
    .help = Zotero 有时会在一句话中间把段落切断，把两半当作两句朗读，中间还停顿一下。开启时两半作为一句朗读、一句高亮。若两个段落被连成一句读了出来，就关掉它。对之后打开的文档生效。
ztts-prefetch =
    .label = 预取后面的
ztts-prefetch-ahead =
    .value = 句
ztts-help-prefetch =
    .value = ?
    .help = 当前句播放时提前合成后面的句子，播放就不必等服务器。Zotero 自己已经预取 3 句，所以实际备好的句数在你填的数字到数字加 3 之间。音频存在下面的缓存里，此项开启时缓存保持开启。在付费服务商上，被你跳过的句子同样会被合成并计费。
ztts-cache-audio =
    .label = 缓存已合成的音频
ztts-help-cache-audio =
    .value = ?
    .help = 把合成过的句子留在内存里——64 MB，Zotero 重启时清空——重读一段时即刻播放，在付费服务商上也不再收费。预取的音频存在这里，所以预取开启时它不能关闭。


## Highlight

ztts-heading-highlight = 高亮
ztts-highlight-sentence =
    .label = 句子
ztts-highlight-word =
    .label = 单词
ztts-highlight-opacity =
    .value = 不透明度 (%)
ztts-help-highlight-switches =
    .value = ?
    .help = 两个都勾：正在朗读的单词用单词色，它所在的句子用句子色衬在下面。只勾一个：只高亮那一个，最后一个勾不能取消。没有单词时间的语音无论怎么选都按整句高亮。Zotero 自己的“高亮当前”设置跟随这里的选择，在那里改不了。
ztts-preview-line = 第一句已经读完。<span data-l10n-name="before">朗读正停在</span><span data-l10n-name="word">这个</span><span data-l10n-name="after">词上。</span>下一句接着来。
ztts-restore-colors =
    .label = 恢复默认颜色


## Keyboard shortcuts

ztts-heading-shortcuts = 键盘快捷键
ztts-key-speed-reset =
    .value = 速度重置为 1.0×
ztts-key-slower =
    .value = 减速 (−0.05×)
ztts-key-faster =
    .value = 加速 (+0.05×)
ztts-key-quieter =
    .value = 音量减 (−10%)
ztts-key-louder =
    .value = 音量加 (+10%)
ztts-key-previous-sentence =
    .value = 上一句
ztts-key-next-sentence =
    .value = 下一句
ztts-key-previous-paragraph =
    .value = 上一段
ztts-key-next-paragraph =
    .value = 下一段
ztts-key-play =
    .value = 播放 / 暂停 / 继续
ztts-key-return =
    .value = 回到朗读位置
ztts-key-options =
    .value = 播放器选项
ztts-key-stop =
    .value = 停止所有朗读
ztts-key-word-highlight =
    .value = 单词高亮 开 / 关
ztts-clear =
    .label = 清除
ztts-help-key-skip =
    .value = ?
    .help = 仅在朗读打开时生效；否则这个键照常翻页、滚动阅读器。
ztts-help-key-play =
    .value = ?
    .help = 任何状态下都生效：已打开的朗读会暂停或继续，否则开始朗读——从选中的文字、上次停下的地方，或当前可见的页面开始。
ztts-help-key-return =
    .value = ?
    .help = 仅在朗读打开时生效；否则这个键在阅读器里保持原来的作用。
ztts-help-key-options =
    .value = ?
    .help = 展开或收起悬浮面板的语音服务、语言和声音三行，或 Zotero 原播放器的选项面板。仅在对应播放器打开时生效。
ztts-help-key-stop =
    .value = ?
    .help = 一次关闭所有标签页里的朗读播放器。每个标签页的阅读位置都会保留，再次开始朗读时从原处继续。没有播放器打开时，这个键保持原来的作用。
ztts-help-key-word-highlight =
    .value = ?
    .help = 不离开文档就能打开或关闭“高亮”一节里的“单词”开关，对所有标签页生效，并一直保留到下次更改。关掉它不会变成什么都不高亮：句子会自动勾上。没有单词时间的语音无论怎么选都按整句高亮。
ztts-help-key-volume =
    .value = ?
    .help = 把上面的“音量”设置调 10%，对每个语音有效，正在读的这一句立刻生效。仅在朗读打开时生效；否则这个键在阅读器里保持原来的作用。
ztts-restore-shortcuts =
    .label = 恢复默认快捷键


## Backup

ztts-heading-backup = 备份
ztts-backup-to-file =
    .value = 存成文件
ztts-backup-settings =
    .label = 备份设置…
ztts-restore-settings =
    .label = 恢复设置…
ztts-export-positions =
    .label = 导出朗读位置…
ztts-import-positions =
    .label = 导入朗读位置…
ztts-help-positions =
    .value = ?
    .help = 每个文档里朗读上次停下的位置，单独存成一个文件。导入是合并：只有文件里的位置比本机的新时才采用。设置备份从不包含朗读位置。


## WebDAV

ztts-heading-webdav = WebDAV
ztts-field-webdav-url =
    .value = WebDAV 地址
ztts-field-username =
    .value = 用户名
ztts-field-password =
    .value = 密码


## Sync

ztts-heading-sync = 同步
ztts-sync-positions =
    .label = 在电脑之间同步朗读位置
ztts-help-sync-positions =
    .value = ?
    .help = 把每篇文档朗读停下的位置保存到上面的 WebDAV 文件夹，并读取其他电脑和手机上的 OpenReader 留下的位置，在任何设备上都能从同一句继续播放。关闭后，阅读位置只留在这台电脑上。
ztts-sync-settings =
    .label = 在电脑之间同步设置
ztts-help-sync-settings =
    .value = ?
    .help = 让共用上面这个文件夹的每台电脑设置保持一致：这里的改动几秒后就到其他电脑，那边的改动也会到这里，不用手动恢复。有几样东西各台电脑自己保留——地址是本机或局域网的语音服务器、系统语音的开关，以及这个 WebDAV 连接。某个服务商在这台电脑上用不了，就只在这台电脑上保持停用，下面一行会说明原因。关闭时，除非你自己恢复，这台电脑上什么都不会变。
# The line under each switch (ui/sync-status-rows.ts): what the last sync did on this computer
ztts-positions-status-waiting = 朗读位置同步：等待第一次同步。
ztts-positions-status-none = 朗读位置已于 { $time } 同步；这台电脑没有新内容。
ztts-positions-status-taken = 朗读位置已于 { $time } 同步：从你的其他电脑取回 { $count } 个。
ztts-positions-status-last = 朗读位置已于 { $time } 同步；最近一次从其他电脑取回是 { $when }。
ztts-positions-status-failed = 朗读位置同步于 { $time } 失败：{ $detail }
# 其他设备到达的位置在本机这份文档里找不到时的提示（改从本机上次的句子继续）
ztts-shared-position-unresolved = 在这份文档里没有找到其他设备到达的位置，将从这台电脑上次停下的句子继续。
ztts-sync-status-waiting = 设置同步：等待第一次同步。
ztts-sync-status-none = 设置已于 { $time } 同步；这台电脑没有新内容。
ztts-sync-status-applied = 设置已于 { $time } 同步：来自 { $from } 的 { $count } 项已在这里应用。
ztts-sync-status-last = 设置已于 { $time } 同步；这里最近一次改动是 { $when } 来自 { $from } 的 { $count } 项。
ztts-sync-status-failed = 设置同步于 { $time } 失败：{ $detail }
ztts-sync-status-deferred = 另有 { $count } 项等朗读停止后再应用。
ztts-sync-status-held = { $provider } 在这台电脑上保持停用：{ $reason }
ztts-sync-other-computer = 另一台电脑


## Backup — this computer's copy on the server (ui/webdav-rows.ts)

ztts-backup-on-server =
    .value = 本机在服务器上的副本
ztts-field-this-computer =
    .value = 本机名称
ztts-help-this-computer =
    .value = ?
    .help = 本机的备份副本在服务器上使用的名字，每台电脑各保留一份，不会互相覆盖。改名后会在新名字下另起一份。
ztts-auto-upload =
    .label = 在服务器上保留本机设置的备份
ztts-help-auto-upload =
    .value = ?
    .help = 任一设置改动几秒后，服务器上本机自己的那份副本就会刷新，随时可以手动恢复——重置后在这台上恢复，或者到另一台上恢复。这是备份不是同步：除非你自己恢复，任何电脑上都不会有变化。关闭时，只有下面的按钮会写这份副本。
ztts-upload-now =
    .label = 立即备份到服务器
ztts-restore-from-server =
    .label = 从服务器恢复设置…


## About

ztts-heading-about = 关于
ztts-about-version = 版本 { $version }
ztts-about-date = 日期 { $date }
ztts-about-time = 时间 { $time }
ztts-about-author = 作者 { $author }
ztts-about-email = 邮箱 { $email }
ztts-about-star = 如果你喜欢 Zotero-TTS，欢迎到 <label data-l10n-name="github">GitHub</label> 给它点个 ⭐——让更多人发现它。


## What TypeScript writes into the pane (issue #43)
#
# 句与句之间不加空格：ztts-join 把两句直接相连。数量以文本传入的地方
# 原样显示（1914），以数字传入的地方（标签页、服务商）可按 [1] 选词。

ztts-join = { $first }{ $second }

## Connection results

ztts-connected = 已连接。
ztts-connected-model = 已连接。模型 { $model } 可用。
ztts-connected-model-missing = 已连接，但此服务器没有列出模型“{ $model }”。
ztts-voices-available = { $count } 个语音可用。
ztts-synthesis-works = 合成正常。
ztts-word-timestamps = 有单词时间戳。
ztts-no-word-timestamps = 没有单词时间戳：{ $detail }。
ztts-no-word-timestamps-detail = 服务器没有返回
ztts-synthesis-failed = 已连接，但合成失败：{ $detail }
ztts-timestamp-check-failed = 已连接，但单词时间戳检查失败：{ $detail }
ztts-no-reply = { $seconds } 秒内没有回应
ztts-no-audio = { $seconds } 秒内没有收到音频
ztts-no-voice-list = { $seconds } 秒内没有收到语音列表
ztts-local-server-down = 该地址上没有运行本地 TTS 服务器。
ztts-no-key = 此服务商没有设置 API 密钥。
ztts-key-rejected = 服务器拒绝了 API 密钥。({ $detail })
ztts-cannot-connect = 无法连接：{ $detail }
ztts-connection-failed = 连接失败：{ $detail }
ztts-providers-checked = 已检查 { $count } 个服务商：全部正常。
ztts-providers-turned-off = 已停用 { $named }（共 { $count } 个）：恢复的设置在这台电脑上不可用，见各自旁边的提示。
ztts-system-unsupported = 系统语音只在 Windows 和 macOS 上可用；此构建没有 Linux 的语音助手程序。

## The voice browser

# Zotero 自己的词（reader.ftl）：标准 / 高级
ztts-tier-standard = Zotero 标准
ztts-tier-premium = Zotero 高级
# 系统语音在播放器第一个下拉框和语音浏览器第一列里的条目名（issue #110），与本页标题一致
ztts-provider-system = 系统
ztts-listing-voices = 正在列出语音…
ztts-no-voices = 没有语音。请在上方启用一个服务商。
ztts-no-providers-on = 没有打开任何服务商：请在上方启用一个。
ztts-listing-failed = 列出语音失败：{ $problems }
ztts-plugin-voices-problem = 插件的语音：{ $detail }
ztts-fish-list-limited = Fish Audio 的平台列表上限为 1,000 个语音；可从 Fish Audio discovery 获取 Model IDs 来添加其他语音。
ztts-fish-list-stale = Fish Audio 的语音列表可能已过时：{ $detail }
ztts-fish-list-stale-no-detail = Fish Audio 的语音列表可能已过时。
ztts-default-voice = 默认语音：{ $voice }
ztts-default-voice-speed = 默认语音：{ $voice } | { $speed }
ztts-default-speed = 默认速度：{ $speed }
ztts-no-default = 没有默认语音和速度：Zotero 按语言各记各的
ztts-zotero-own-choice = 由 Zotero 按语言自行选择
ztts-not-listed-now = { $id }（当前未列出）
ztts-status-not-a-favorite = { $line }——不是收藏的语音，而当前只提供收藏的语音：朗读无法用它开始
ztts-status-trouble = { $line }——{ $problems }
ztts-default-cleared = 已清除默认语音：{ $label } 不再是收藏的语音，而当前只提供收藏的语音
ztts-sample-failed = 试听失败：{ $detail }
ztts-sample-stopped = 试听失败：音频已收到，但播放中断：{ $detail }
ztts-zotero-sample-unavailable = 这里无法播放 Zotero 自己的语音
ztts-play-sample = 试听
ztts-play-zotero-sample = 试听 Zotero 自己的示例
ztts-favorite = 收藏
ztts-row-default = 默认语音：朗读从它开始。点击可清除
ztts-row-pick = 点击设为默认语音
ztts-row-blocked = 开启“朗读播放器中只提供收藏的语音”时，只有收藏的语音才能设为默认
ztts-media-unknown = 未知错误
ztts-media-code = 媒体错误 { $code }
ztts-media-aborted = 播放被中止
ztts-media-network = 网络错误
ztts-media-decode = 解码或输出失败
ztts-media-format = 不支持的格式

## The reading guard's dialog and the favorites-only refusal

ztts-reading-tabs =
    以下 { $count } 个标签页打开了朗读：
    { $list }

    关闭{ $count ->
        [1] 该标签页
       *[other] 这些标签页
    }中的播放器后再试。
ztts-reading-tabs-stop =
    以下 { $count } 个标签页打开了朗读：
    { $list }

    停止朗读后，这项更改会立即生效；每个标签页的阅读位置都会保留，再次开始朗读时从原处继续。也可以自己关闭{ $count ->
        [1] 该标签页
       *[other] 这些标签页
    }中的播放器后再试。
ztts-stop-and-continue = 停止朗读并继续
ztts-cancel = 取消
ztts-ok = 确定
ztts-item = 条目 { $id }
ztts-unmarked-default =
    { $name } 是默认语音，但不是收藏的语音。

    只提供收藏的语音时，朗读无法用它开始。请先把它标为 ♥，或把一个收藏的语音设为默认，再开启此项。

## The shortcut recorder

ztts-recording = 请按新的按键…（Esc 取消）
ztts-key-not-set = 未设置
ztts-key-invalid = { $text }（无效）
ztts-key-conflict = 已被“{ $action }”使用。
ztts-key-needs-modifier-or-arrow = 请加上修饰键（Ctrl、Alt、Shift 或 Cmd）或使用方向键：单独的按键会输入字符。
ztts-key-needs-modifier = 请加上修饰键（Ctrl、Alt、Shift 或 Cmd）：单独的按键会输入字符。
ztts-action-speed-reset = 重置速度
ztts-action-slower = 减速
ztts-action-faster = 加速
ztts-action-quieter = 音量减
ztts-action-louder = 音量加
ztts-action-previous-sentence = 上一句
ztts-action-next-sentence = 下一句
ztts-action-previous-paragraph = 上一段
ztts-action-next-paragraph = 下一段
ztts-action-play = 播放 / 暂停 / 继续
ztts-action-return = 回到朗读位置
ztts-action-options = 播放器选项
ztts-action-stop = 停止所有朗读
ztts-action-word-highlight = 单词高亮 开 / 关
# The toast the volume keys show, where the speed's shows `1.3×`
ztts-volume-toast = 音量 { $percent }%
ztts-stopped-toast = 已停止 { $count } 个标签页的朗读
ztts-highlight-toast-both = 高亮：单词和句子
ztts-highlight-toast-word = 高亮：单词
ztts-highlight-toast-sentence = 高亮：句子
ztts-highlight-toast-word-no-timing = 高亮：单词（此语音没有单词时间，仍按整句高亮）
ztts-zotero-highlight-hint = 在 Zotero-TTS 设置的“高亮”一节里选择

## Backup and Sync

ztts-picker-backup = 备份 Zotero-TTS 设置
ztts-picker-restore = 恢复 Zotero-TTS 设置
ztts-backup-saved = 已保存到 { $path }。文件包含全部设置，其中有 API 密钥、网关请求头和 WebDAV 密码——请妥善保管。
ztts-backup-failed = 备份失败：{ $detail }
ztts-restore-confirm = 用 { $path } 中的 { $count } 项设置替换当前设置？
ztts-restored = 已从 { $path } 恢复 { $count } 项设置。
ztts-skipped = 跳过 { $count } 项：{ $keys }。
ztts-checking-providers = 正在检查它启用的服务商…
ztts-providers-uncheckable = 无法检查服务商：{ $detail }
ztts-restore-failed = 恢复失败：{ $detail }
ztts-positions-saved = 已把 { $count } 个朗读位置保存到 { $path }。
ztts-export-failed = 导出失败：{ $detail }
ztts-positions-merged = 已从 { $path } 合并 { $count } 个朗读位置；其中 { $taken } 个更新，已采用。
ztts-import-failed = 导入失败：{ $detail }
ztts-webdav-testing = 正在测试…
ztts-webdav-uploading = 正在上传…
ztts-webdav-looking = 正在查找…
ztts-webdav-connected = 已连接到 { $url }。
ztts-upload-failed = 上传失败：{ $detail }
ztts-webdav-uploaded = 已把 { $count } 项设置备份到 { $file }。文件包含全部设置，其中有 API 密钥、网关请求头和 WebDAV 密码——请把文件夹设为私有。
ztts-webdav-none = { $url } 上还没有设置备份。
ztts-webdav-pick-title = 恢复哪台电脑的设置？
ztts-shared-file = 共享文件（1.11 之前）
ztts-date-unknown = 日期未知
ztts-settings-file-label = { $who } — { $when }
ztts-webdav-restore-confirm = 用 { $url } 上的 { $count } 项设置替换当前设置？
ztts-webdav-restore-confirm-machine = 用 { $url } 上 { $machine } 的 { $count } 项设置替换当前设置？
ztts-webdav-restore-confirm-saved = 用 { $url } 上的 { $count } 项设置（保存于 { $time }）替换当前设置？
ztts-webdav-restore-confirm-machine-saved = 用 { $url } 上 { $machine } 的 { $count } 项设置（保存于 { $time }）替换当前设置？
ztts-webdav-machine-file = 本机在服务器上的备份是 { $file }。

## The reader: the line shown when Read Aloud does not start with the remembered voice

ztts-substitute = Zotero-TTS：这里没有提供 { $missing }，改用 { $instead } 朗读。
ztts-substitute-none = Zotero-TTS：这里没有提供 { $missing }，也没有 Zotero-TTS 的其他语音。由 Zotero 选择语音。
ztts-substitute-paid = Zotero-TTS：这里没有提供 { $missing }，也没有 Zotero-TTS 的其他语音。由 Zotero 选择语音，可能会消耗额度。

## Auto-scroll

ztts-keep-following-visible =
    .label = 句子可见时保持自动滚动
ztts-help-keep-following-visible =
    .value = ?
    .help = 默认开启。在 PDF 和 EPUB 中，手动滚动后，当前句子会保持在你放置的位置，即使位于视野边缘。停止移动页面后，后续句子进入视野时恢复自动滚动。暂停期间页面保持原位；继续播放时，无论当前句子是否可见，都会立即返回。回到朗读位置或跳句也会恢复跟随。关闭此选项后，任何手动导航都会停止跟随，直到继续播放、返回或跳句。

ztts-auto-scroll =
    .value = 自动滚动
ztts-auto-scroll-sentence =
    .label = 每句居中
ztts-auto-scroll-outside =
    .label = 超出视图时滚动
ztts-help-auto-scroll-sentence =
    .value = ?
    .help = 每句开始时，将整句移到视图的垂直中央，即使它已经完全可见。逐词高亮不会让能完整显示的句子反复居中。适用于 PDF 和 EPUB；EPUB 翻页模式保留原来的分页。浏览其他位置后，“回到朗读位置”可恢复跟随。
ztts-help-auto-scroll-outside =
    .value = ?
    .help = 整句完全可见时保持原位；只有句子有部分超出视图时，才滚动并将整句居中。适用于 PDF 和 EPUB；EPUB 翻页模式保留原来的分页。超长句子先显示句首，有逐词定位时再跟随当前单词。浏览其他位置后，“回到朗读位置”可恢复跟随。

ztts-key-auto-scroll =
    .value = 自动滚动模式
ztts-help-key-auto-scroll =
    .value = ?
    .help = 在“每句居中”和“超出视图时滚动”之间切换。选择对所有 PDF 和 EPUB 生效，并会保存。在阅读器中，朗读前或朗读时均可使用；手动浏览后不会因此恢复跟随。
ztts-action-auto-scroll = 自动滚动模式
ztts-key-previous-voice =
    .value = 上一个声音
ztts-key-next-voice =
    .value = 下一个声音
ztts-help-key-voice =
    .value = ?
    .help = 按播放器当前声音列表循环切换。在播放器中选择声音、语言和语音模式时，也使用相同的切换方式。旧声音会继续朗读，等新声音准备好后，在单词结束处或句子之间交接。暂停时，新声音会在后台静默准备。点击播放时，若已准备好，就从暂停单词的下一个词继续；否则先用旧声音继续朗读，等新声音准备好后再交接。没有可靠的单词时间信息时，先用旧声音读完当前句。只有最后一次选择生效。准备声音可能消耗服务额度，即使你随后选择了其他声音。
ztts-action-previous-voice = 上一个声音
ztts-action-next-voice = 下一个声音
ztts-voice-preparing = 正在准备声音：{ $voice }
ztts-voice-failed = 无法切换到 { $voice }。已保留原来的声音，请重试。
ztts-voice-unavailable = 声音列表尚未就绪。请打开播放器后重试。
ztts-auto-scroll-toast-sentence = 自动滚动：每句居中
ztts-auto-scroll-toast-outside = 自动滚动：超出视图时滚动

ztts-strip-angle-brackets =
    .label = 朗读时去掉包围文字的括号
ztts-bracket-pairs =
    .aria-label = 要去掉的括号对
ztts-help-strip-angle-brackets =
    .value = ?
    .help = 括号不论在句中什么位置，只要括住了文字就会去掉，里面的文字保留。括号对之间用空格分隔，例如 <> [] () 【】。取消勾选后可以编辑列表，重新勾选时会检查并启用。没有配对的括号会保留，当作比较符号写的 < 和 > 也会保留，例如 x < 5 and y > 3。适用于所有语音，停止并重新打开朗读后生效。
ztts-bracket-use-defaults = 使用默认值
ztts-bracket-error-empty = 请至少输入一组括号对，多组之间用空格分隔。是否改用默认列表 <> []？
ztts-bracket-error-entry = 括号对“{ $entry }”无效。每组必须恰好包含两个不同的标点或符号。是否改用默认列表 <> []？
ztts-bracket-error-duplicate = 括号对“{ $entry }”重复。每组只能输入一次。是否改用默认列表 <> []？


ztts-player-heading = 播放器
ztts-player-enabled = 使用插件播放器
ztts-player-layout = 布局
ztts-player-bottom = 底部栏
ztts-player-floating = 悬浮面板
ztts-player-top = 顶部栏
ztts-player-provider = 语音服务
ztts-player-locale = 语言
ztts-player-voice = 声音
ztts-player-play = 播放
ztts-player-pause = 暂停
ztts-player-speed = 速度
ztts-player-volume = 音量
ztts-player-automatic = 正在跟随当前文档。点击改为手动浏览。
ztts-player-manual = 手动浏览中。点击返回朗读位置并恢复跟随。
ztts-player-search = 搜索
ztts-player-empty = 没有匹配结果
ztts-player-loading = 正在加载声音…
ztts-player-no-voices = 没有可用声音，请在 Zotero-TTS 设置中启用语音服务。
ztts-player-favorite = 收藏
ztts-player-unfavorite = 取消收藏
ztts-player-retry = 重试
ztts-player-buffering = 正在缓冲…
ztts-player-unavailable = 此文档无法朗读。
ztts-player-unavailable-choice = 此声音或语言已不可用，请选择其他选项。
ztts-player-invalid-value = 不支持所选值。
ztts-player-playback-error = 播放失败，请检查语音服务连接后重试。
ztts-player-quota-error = 语音服务已达到使用限制或余额不足。
ztts-player-favorite-guard = 此更改会移除正在使用的语音。请先关闭受影响标签页的播放器，再进行更改。

ztts-player-options = 选项
ztts-player-previous-paragraph = 上一段
ztts-player-previous-sentence = 上一句
ztts-player-next-sentence = 下一句
ztts-player-next-paragraph = 下一段

ztts-playback-preparing = 正在准备…
ztts-playback-failed = 无法准备音频，请重试播放。

ztts-action-player-layout = 播放器布局
ztts-key-player-layout =
    .value = 播放器布局
ztts-help-key-player-layout =
    .value = ?
    .help = 插件播放器打开时，按顶部栏 → 底部栏 → 悬浮面板循环切换。所有播放器共用此布局，重启后仍会保留。
