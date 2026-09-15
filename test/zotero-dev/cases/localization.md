[Checklist index](../README.md) · [Scripts](../scripts/localization/README.md)

## The plugin's strings in Zotero's language (issues #30, #43, #64)

Items 1.10–1.12 of the checklist, under their original numbers.

### 1.10

10. **The strings resolve in the sandbox** (issue #30). `startup()` has
    the `strings` step `ok`; `diagnostics.l10n()` → `source: true`,
    `appLocales` beginning with `zoteroLocale`, `sample` the Voice browser
    heading in the app's language (derive from
    `addon/locale/<locale>/zotero-tts.ftl`: `Voice browser` under en-US,
    `语音浏览器` under zh-CN), `fallback: "ztts-no-such-message"` — the id
    itself, never blank, never a throw. **The strings TypeScript writes**
    (issue #43, 1.11.0): `formatted.voices` is the `ztts-voices-available`
    message with the count `2267` verbatim — `2267 voices available.` /
    `2267 个语音可用。`, never `2,267` (a count that can pass a thousand is
    handed over as text; Fluent groups a number); `oneTab` and `twoTabs`
    the reading guard's message at 1 and at 2 with the blank line before
    its last sentence — `Read Aloud is open in a tab:\n  • A\n\nClose that
    tab, then try again.` / `以下 1 个标签页打开了朗读：\n  • A\n\n关闭该标签页后再试。`,
    and `2 tabs` … `those tabs` / `2 个标签页` … `这些标签页`; `joined`
    two sentences through `ztts-join` — `Connected. Synthesis works.` with
    the space, `已连接。合成正常。` without; `tier` `Standard` / `标准`
    (Zotero's own word, reader.ftl; `Local` / `本地` until #110 retired
    the plugin's use of that tier); `isolationMarks: false` — no bidi
    isolation mark (U+2066–U+2069) around a placeable (all measured
    2026-09-06 on 1.11.0-beta5; a build without `formatted` is older than
    #43). **The plugin's own copy of the file** (issue #64, 1.11.2):
    `startup()` has the `own strings source` step second, right after
    `strings`, and the log reads `[zotero-tts] own strings source
    registered: en-US, zh-CN for 46 Zotero locales` — `registered`, not
    `replaced` (46 = `Services.locale.availableLocales.length`;
    `replaced` would mean the previous instance had not removed its
    source). At rest `diagnostics.l10n().registry` → `{locale: "en-US",
    shared: "present", own: "present", bundles: 2}`: Zotero's shared
    `zotero-plugins` source and the plugin's own `zotero-tts` source both
    hold `zotero-tts.ftl`, and the app locale yields two bundles for it.
    From chrome scope the same:
    `L10nRegistry.getInstance().getSource('zotero-tts').hasFile('en-US',
    'zotero-tts.ftl')` → `present`, `new Localization(['zotero-tts.ftl'],
    true).formatValueSync('ztts-heading-sync')` → `Sync` (measured
    2026-09-06 on macOS, 1.11.2-beta2). `registry.locale` is the first
    negotiated app locale (`Services.locale.appLocalesAsBCP47[0]`), what
    the registry resolves the file by, so it follows a live switch (item
    1.12).

### 1.11

11. **The pane is translated by Zotero, not by the plugin.** With the
    settings window open on the pane, `diagnostics.l10n().pane` →
    `elements` the count of `data-l10n-id` in `preferences.xhtml` (derive),
    `blank: []`, `questionless: []`. By DOM: every `.ztts-help` has `value`
    `?` and `help` its message's text; the *Offer only favorite voices…*
    checkbox has its bold run (`.checkbox-label b`) reading the message's
    `.bold`; the highlight preview's four painted spans keep their ids
    (`#ztts-highlight-preview-sentence`, `-word-before`, `-word`,
    `-word-after`) with the message's text in them; the four provider
    switches read `Enable` or `Disable` (the `ztts-switch-*` messages
    through `t()`), none blank; and the lines TypeScript writes read as
    they did before #43: the first column one entry per enabled provider
    beside `Premium (N)` and `Standard (N)`, sorted by name — `Azure (N)`,
    `Fish-cloud (N)`, `Kokoro (N)`, `Premium (N)`, `Standard (N)`,
    `System (N)` on a profile with those four on (issue #110; until then
    `Standard` / `Premium` / `Local`, 28 / 1452 / 787 = the 2267 of a
    2026-09-06 listing), `#ztts-voices-status` beginning `Default voice: ` (or
    `Default speed: ` / `No default voice or speed:` per the two
    "everywhere" switches), `#ztts-about-build` `Version <build> · Date
    <date> · Time <hh:mm>` over `#ztts-about-author` `Author Xujia Liu ·
    Email xujialiuphd@gmail.com`, Test connection's `Connected. N voices
    available. …` (1.5), a shortcut field clicked `Press the new keys…
    (Esc cancels)` and Escape (4.8), the `#ztts-notice` dialog (3.9) with
    its `OK`. Run item 1.7's address-hint flow before the fixture session of
    3.9 opens or after it closes: the guard refuses a provider switch
    while a tab reads. Screenshots of every group in the app's language.

### 1.12

12. **Chinese without a restart.** Snapshot `intl.locale.requested`, then
    `Services.locale.requestedLocales = ['zh-CN']`: `diagnostics.l10n().sample`
    becomes `语音浏览器`, and the open pane retranslates itself — the
    Voice browser heading reads `语音浏览器`, `blank` and `questionless`
    stay empty, the `?` icons keep their `?`; a screenshot.
    `diagnostics.l10n().registry` follows the switch (issue #64, 1.11.2):
    `{locale: "zh-CN", shared: "present", own: "present", bundles: 2}` at
    rest — the plugin's own source maps all 46 Zotero locales onto the
    shipped en-US and zh-CN files, so from chrome scope
    `L10nRegistry.getInstance().getSource('zotero-tts').hasFile('zh-CN',
    'zotero-tts.ftl')` is `present`. `Zotero.locale`
    does not move (computed at startup) and is not expected to. What
    TypeScript painted stays as it was until the pane is reopened — the
    provider switches' `Enable`/`Disable` and the bold run of *Offer only
    favorite voices* (`.checkbox-label b` is gone, the label plain) — and
    a close and reopen shows them in the new language (`停用`, the run
    `收藏的语音`): a user is asked to restart on a language change, so
    this is by design, not a FAIL (measured 2026-09-04: the pane
    retranslated in 172 ms; 117 ms on 2026-09-05; 56 ms on 2026-09-06). Each switch logs one Zotero-own `uncaught
    exception: undefined`, reproduced with no settings window open. After
    the reopen the lines TypeScript writes are Chinese too (issue #43,
    1.11.0): the first column `标准 (N)` / `高级 (N)` / `系统 (N)` before the
    Latin-named providers (Han by pinyin, issue #110), the
    status line `默认语音：…` / `默认速度：…`, the Build line `版本
    <build> · 日期 <date> · 作者 Xujia Liu`, Test connection on the local
    engine `已连接。N 个语音可用。有单词时间戳。` — no space between the
    sentences (`ztts-join`), the recorder `请按新的按键…（Esc 取消）`, the
    `#ztts-notice` dialog `以下 1 个标签页打开了朗读：` … `关闭该标签页后再试。`
    with `确定`, the address typo hint under MiMo `api.xiaomimim.com 像是
    api.xiaomimimo.com 的笔误。` and Test connection `未测试：…`; product
    names, voice ids, `1.7×`, ` | ` and `Name (N)` stay as they are, and
    `l10n().pane` is still `{elements: <n>, blank: [], questionless: []}`
    (110 on 2026-09-06: 100 at 1.11.0, plus the volume setting's nine
    and the star line's one). The Build star line retranslates with the
    pane, no reopen needed (1.11.1):
    `如果你喜欢 Zotero-TTS，欢迎到 GitHub 给它点个 ⭐——让更多人发现它。` (76 ms on
    2026-09-06 macOS, 43 ms back), the star followed by `——` (U+2014
    U+2014), the sentence 435.3 px on one line. Fluent replaces the named child with a
    clone, and the clone is upgraded again —
    `classList.contains('zotero-text-link')` true, `role` `link`, `href`
    and the text `GitHub` unchanged, still one line — and the stubbed
    click reports the same `https://github.com/xujialiu/Zotero-TTS`; the
    product name, `GitHub` and the URL stay English. The group's heading
    follows Zotero (`关于`) and the star line retranslates with the pane,
    while `#ztts-about-build` and `#ztts-about-author` stay English until
    the pane is reopened, like the other lines TypeScript paints; reopened,
    they read `版本 <build> · 日期 <date> · 时间 <hh:mm:ss UTC±n>` over `作者 Xujia
    Liu · 邮箱 xujialiuphd@gmail.com` — the email, `Zotero-TTS`, `GitHub`
    and the URL English, the two rows 277.12 and 251.55 px wide, 3.00 px
    apart (Windows, 2026-09-10).
    Then the pref back verbatim (an empty snapshot means `requestedLocales = []`)
    and `appLocalesAsBCP47` equal to the baseline's — the set, not the
    order: its `en-*` tail reorders between reads with nothing changed.
    **Switch the locale with no settings window open.** Switching it with
    the pane open and closing that window some 500 ms later killed Zotero
    on 2026-09-10 (Windows, `xul.dll` access violation `0xc0000005`), and
    the session restore afterwards lost one of the two open reader tabs.
    Close the pane, poll it to null, wait, switch, then open the pane
    fresh in the new language; close it again before switching back — in
    that order both switches were clean. If Zotero does die, its
    `prefs.js` already holds the test locale: restore that one line while
    it is down, or it restarts in Chinese.
