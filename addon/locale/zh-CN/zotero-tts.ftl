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
ztts-field-address =
    .value = 地址
ztts-heading-system-voices = 系统语音
ztts-system-note = 仅限 Windows。
ztts-help-system-voices =
    .value = ?
    .help = 目前仅支持 Windows，macOS 和 Linux 暂不支持。插件接管 Windows 自带的语音，于是它们和其他服务商的语音一样，有语音浏览器、试听、收藏、缓存和逐词高亮。

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
