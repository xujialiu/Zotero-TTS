# Zotero-TTS — 简体中文。en-US 文件是源头；这里的每条消息、属性和变量都与它一一对应
# (test/l10n.test.ts)。用词沿用 Zotero 自己的中文：朗读、语音、语音模式、设置。


## Provider sections

ztts-field-server =
    .value = 服务器
ztts-server-other =
    .label = 其他 OpenAI 兼容服务器
ztts-field-api-key =
    .value = API 密钥
ztts-field-base-url =
    .value = API 地址
ztts-field-model =
    .value = 模型
ztts-field-voices =
    .value = 语音
ztts-openai-voices-input =
    .placeholder = 自动检测
ztts-field-extra-headers =
    .value = 额外请求头
ztts-help-extra-headers =
    .value = ?
    .help = 只在服务器通过 Cloudflare Access 远程访问时需要：把它的服务令牌写成两个请求头，CF-Access-Client-Id: …; CF-Access-Client-Secret: …（见 README 里的 Cloudflare 教程）。其他情况留空。
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
ztts-highlight-word =
    .value = 单词
ztts-highlight-sentence =
    .value = 句子
ztts-highlight-opacity =
    .value = 不透明度 (%)
ztts-sentence-under-word =
    .label = 逐词高亮时，句子也保持高亮
ztts-preview-sentence-line = <span data-l10n-name="tag">逐句模式</span>第一句已经读完。<span data-l10n-name="active">朗读正停在这一句上。</span>下一句接着来。
ztts-preview-word-line = <span data-l10n-name="tag">逐词模式</span>第一句已经读完。<span data-l10n-name="before">朗读正停在</span><span data-l10n-name="word">这个</span><span data-l10n-name="after">词上。</span>下一句接着来。
ztts-restore-colors =
    .label = 恢复默认颜色


## Keyboard shortcuts

ztts-heading-shortcuts = 键盘快捷键
ztts-key-speed-reset =
    .value = 速度重置为 1.0×
ztts-key-slower =
    .value = 减速 (−0.1×)
ztts-key-faster =
    .value = 加速 (+0.1×)
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
    .help = 打开或收起播放器的选项面板——速度滑块、语音模式、语言和语音。仅在朗读打开时生效；否则这个键在阅读器里保持原来的作用。
ztts-help-key-stop =
    .value = ?
    .help = 一次关闭所有标签页里的朗读播放器。每个标签页的阅读位置都会保留，再次开始朗读时从原处继续。没有播放器打开时，这个键保持原来的作用。
ztts-help-key-volume =
    .value = ?
    .help = 把上面的“音量”设置调 10%，对每个语音有效，正在读的这一句立刻生效。仅在朗读打开时生效；否则这个键在阅读器里保持原来的作用。
ztts-restore-shortcuts =
    .label = 恢复默认快捷键


## Backup

ztts-heading-backup = 备份
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


## Sync

ztts-heading-sync = 同步
ztts-field-webdav-url =
    .value = WebDAV 地址
ztts-field-username =
    .value = 用户名
ztts-field-password =
    .value = 密码
ztts-field-this-computer =
    .value = 本机名称
ztts-help-this-computer =
    .value = ?
    .help = 本机的设置文件在服务器上使用的名字，每台电脑各保留一份，不会互相覆盖。改名后会在新名字下另起一个文件。
ztts-sync-positions =
    .label = 在电脑之间同步朗读位置
ztts-help-sync-positions =
    .value = ?
    .help = 把每个文档里朗读上次停下的位置存进上面的 WebDAV 文件夹，并取回你其他电脑留下的——在哪台电脑上播放都从同一句继续。关闭时，朗读位置只留在本机。
ztts-auto-upload =
    .label = 自动上传本机设置
ztts-help-auto-upload =
    .value = ?
    .help = 任一设置改动几秒后，服务器上本机的文件就会刷新——换电脑前不必记得手动上传。只上传：其他电脑的设置绝不会自动应用，除非你自己恢复。
ztts-upload-now =
    .label = 立即上传设置
ztts-restore-from-server =
    .label = 从服务器恢复设置…


## Build

ztts-heading-build = 构建信息
ztts-build-version = 版本 { $version }
ztts-build-date = 日期 { $date }
ztts-build-author = 作者 { $author }
ztts-build-star = 如果你喜欢 Zotero-TTS，欢迎到 <label data-l10n-name="github">GitHub</label> 给它点个 ⭐——让更多人发现它。


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
ztts-not-tested = 未测试：{ $reason }
ztts-address-typo = { $host } 像是 { $known } 的笔误。
ztts-address-different = { $host } 不是 { $known }：镜像还是代理？
ztts-providers-checked = 已检查 { $count } 个服务商：全部正常。
ztts-providers-turned-off = 已停用 { $named }（共 { $count } 个）：恢复的设置在这台电脑上不可用，见各自旁边的提示。
ztts-system-unsupported = 系统语音只在 Windows 和 macOS 上可用；此构建没有 Linux 的语音助手程序。

## The ? beside the Server dropdown

ztts-preset-note-openai = 密钥和模型来自 platform.openai.com；语音可留空（用 OpenAI 自己的）或填写更新的语音。api.openai.com 不需要额外请求头。
ztts-preset-note-chatterbox = Chatterbox 没有密钥，忽略模型，并发布自己的语音：只有地址重要，经网关访问时再加额外请求头。
ztts-preset-note-mimo = 密钥来自 platform.xiaomimimo.com；目前免费。语音可留空（用 MiMo 内置的中英文语音）或填写你自己的。按句高亮而非逐词：MiMo 不报告单词时间。api.xiaomimimo.com 不需要额外请求头。
ztts-preset-note-other = 填写服务器需要的项；测试连接会告诉你它用到哪些。

## The voice browser

# Zotero 自己的词（reader.ftl）：本地 / 标准 / 高级
ztts-tier-standard = 标准
ztts-tier-premium = 高级
ztts-tier-local = 本地
ztts-listing-voices = 正在列出语音…
ztts-no-voices = 没有语音。请在上方启用一个服务商。
ztts-listing-failed = 列出语音失败：{ $problems }
ztts-plugin-voices-problem = 插件的语音：{ $detail }
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
# The toast the volume keys show, where the speed's shows `1.3×`
ztts-volume-toast = 音量 { $percent }%
ztts-stopped-toast = 已停止 { $count } 个标签页的朗读

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
ztts-webdav-uploaded = 已把 { $count } 项设置上传到 { $file }。文件包含全部设置，其中有 API 密钥、网关请求头和 WebDAV 密码——请把文件夹设为私有。
ztts-webdav-none = { $url } 上还没有设置备份。
ztts-webdav-pick-title = 恢复哪台电脑的设置？
ztts-shared-file = 共享文件（1.11 之前）
ztts-date-unknown = 日期未知
ztts-settings-file-label = { $who } — { $when }
ztts-webdav-restore-confirm = 用 { $url } 上的 { $count } 项设置替换当前设置？
ztts-webdav-restore-confirm-machine = 用 { $url } 上 { $machine } 的 { $count } 项设置替换当前设置？
ztts-webdav-restore-confirm-saved = 用 { $url } 上的 { $count } 项设置（保存于 { $time }）替换当前设置？
ztts-webdav-restore-confirm-machine-saved = 用 { $url } 上 { $machine } 的 { $count } 项设置（保存于 { $time }）替换当前设置？
ztts-webdav-machine-file = 本机的设置将上传为 { $file }。

## The reader: the line shown when Read Aloud does not start with the remembered voice

ztts-substitute = Zotero-TTS：这里没有提供 { $missing }，改用 { $instead } 朗读。
ztts-substitute-none = Zotero-TTS：这里没有提供 { $missing }，也没有任何本地语音。由 Zotero 选择语音。
ztts-substitute-paid = Zotero-TTS：这里没有提供 { $missing }，也没有任何本地语音。由 Zotero 选择语音，可能会消耗额度。
