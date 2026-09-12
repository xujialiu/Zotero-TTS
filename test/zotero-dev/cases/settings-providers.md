[Checklist index](../README.md)

## 1. Startup, the settings pane, providers, system voices

1. **Install and startup.** As in the baseline; after an in-place
   install no `can't access dead object` in the debug store (issue #5),
   the log `[zotero-tts] stopped` before `[zotero-tts] started`.
2. **The pane renders.** Open per the rulebook; screenshot every group:
   the six provider sections (OpenAI, Azure, Cloudflare Workers AI,
   Speechify, the Local engine named after its engine — `Kokoro-FastAPI`, System
   voices), Voice browser, Reading, Highlight, Keyboard shortcuts,
   WebDAV, Sync, Backup, About. No
   clipped or overlapping text, no empty label; every `?` on its line,
   its glyph the pane's own size (issue #53, 1.10.15): every
   `.ztts-help` computes the `font-size` of its row's text (`13px` on
   Windows; it was `10.4px`) and a 16.25 px square box, lower than
   every row that carries one (the lowest, after a description,
   measured 22.333 px) and on its row's center within 0.01 px; the gap
   to the control before it is that control's end margin, not the
   icon's (5 px after a menulist, an input, a button or a label, 6
   after a checkbox, 4 after a description — measured against the
   *visible* note: the hidden platform notes collapse to a zero rect and
   a naive `previousElementSibling` reads 470.98); and
   `InspectorUtils.getMatchingCSSRules` lists the plugin's
   `label.ztts-help[value]` with `width: 1.25em` and no `font-size`.
   The About section's three lines (`src/ui/about-rows.ts`, 1.11.7),
   the last of the pane's 14 groupboxes and after Backup, its `h2`
   `About` (`ztts-heading-about`): `#ztts-about-build` `Version <build> ·
   Date <date> · Time <hh:mm:ss UTC±n>` — its two separators the only
   non-ASCII in it (U+00B7) — over `#ztts-about-author` `Author Xujia
   Liu · Email xujialiuphd@gmail.com`, in that document order.
   `#ztts-build-line` is gone with 1.11.7 and must not resolve
   (`getElementById` null). The three lines stack 3.00 px apart and none
   is clipped: on Windows in an 806×617 window, build `355.68 × 17.33`
   (the row box 584 px wide, 228 px of slack under `Version
   1.11.7-beta7 · Date 2026-09-10 · Time 13:35:05 UTC+8`), author
   `269.87 × 17.33`, star `584 × 17.33`, the groupbox `584 × 116.87`,
   all four at `x 207`, and `scrollWidth == clientWidth` on all three
   (356, 270, 584). The `y` moves with whatever the groups above it
   hold — 539.67 / 560 / 580.33 in the 13-group pane of beta7, before
   the WebDAV / Sync / Backup cut landed — so it is the widths, the
   3.00 px gaps and the slack that are pinned. The rows measure 0 × 0
   until something forces layout after `navigateToPane` —
   `scrollIntoView` and measure in the same script (2026-09-10).
   Under them the star line (1.11.1):
   `description[data-l10n-id="ztts-about-star"]`, in the same groupbox as
   `#ztts-about-author` and after it, `textContent` with whitespace
   collapsed exactly `If you like Zotero-TTS, give it a ⭐ on GitHub — it
   helps others find it.`. The clause after the link is a text node of
   its own (`" — it helps others find it."`, the dash U+2014), and the
   three parts sit on one line: the sentence measures 413.78 px inside
   the 578 px box (macOS, 800×600, 2026-09-06), 400.07 px inside 584 px
   (Windows, 806×617, 2026-09-10).
   The `GitHub` word is Zotero's own `zotero-text-link` label, and that it
   was upgraded is what the row proves: `getAttribute('is')`
   `zotero-text-link`, `classList.contains('zotero-text-link')` true,
   `constructor.name` `ZoteroTextLink`, `role` `link`, `href`
   `https://github.com/xujialiu/Zotero-TTS`, text `GitHub` (Fluent's
   overlay fills the child named `github` and leaves the markup's `href`),
   `typeof link.open === 'function'`. Computed: `text-decoration-line:
   underline`, `cursor: pointer`, `color` Zotero's `LinkText` — the
   platform accent, `rgb(65, 156, 255)` in the macOS dark theme and
   `rgb(0, 202, 219)` in the Windows one, so the number is not pinnable
   across platforms — and `margin` `0px` on all four
   sides — `InspectorUtils.getMatchingCSSRules` lists Zotero's
   `xul|description, xul|label` (`margin-inline: 6px 5px`,
   `global-shared.css`) beaten by `.zotero-text-link{…margin:0}` from
   Zotero's own `preferences.css`, why the word sits in the sentence after
   one ordinary space; the plugin's sheet adds nothing here. One line, not
   clipped: `clientHeight` 17 equals the link's height and `scrollWidth <=
   clientWidth` (578 = 578 in an 800×600 window). The star is U+2B50 with
   no variation selector; a `Range` over that one character measures
   13 × 17.5 px (13 × 18.5 in zh-CN) — non-zero, so it is drawn, a color
   emoji on macOS — and it does not grow the line: `clientHeight` stays
   17. **The click, with
   `Zotero.launchURL` stubbed inside a try/finally so no browser opens**:
   `link.click()` → `seen` is `https://github.com/xujialiu/Zotero-TTS`,
   `restored` true, `doc.defaultView.Zotero === Zotero` true
   (`elements/textLink.js:7-11` dispatches to `open()`, `:73-77` calls
   `Zotero.launchURL(uri.spec)` and `preventDefault`s, so the `win.open`
   fallback is never reached). Never click it unstubbed.
   `l10n().pane.elements` is 123 (the file's 124 `data-l10n-id`
   occurrences less the one in its header comment: 100 at 1.11.0, plus
   the volume setting's nine, the star line's one, at 1.11.3 the
   Cloudflare section's four, at 1.11.6 the word-highlight
   shortcut's 6, and at 1.11.7 the Speechify
   section's three). The message lines
   wrap instead of running
   past the window (issue #31): with the not-a-favorite warning on it
   (2.5), `#ztts-voices-status` measures `scrollWidth <= clientWidth`,
   its computed `white-space` is `normal`, its `textContent` ends in
   `cannot start with it`, and its `clientHeight` is more than one
   line's.
   **Side-by-side buttons stand apart on macOS** (issue #56, 1.10.13):
   Zotero's sheet gives every button there `margin: 0 -2px -1px`, so
   without the plugin's rule two buttons in a row overlap by 4 px and
   their faces touch. Measure `#ztts-key-clear-speedReset` against
   `#ztts-key-speedReset`, `#ztts-test-openai` against
   `#ztts-enable-openai`, `#ztts-webdav-download` against
   `#ztts-webdav-upload`: the second computes `margin-left: 8px` and
   `second.left - first.right` is 6; the `?` after
   `#ztts-key-clear-previousSentence` computes `margin-left: 5px` and
   starts 3 px after it, the `?` after a checkbox still `4px`; the
   first button of a pair and the lone Restore buttons keep
   `margin-left: -2px`; the pane's root `.ztts-pane` carries `ztts-mac`
   (`ui/platform-class.ts` — a `-moz-platform` media query is inert in
   a plugin's `jar:file:` sheet), and `InspectorUtils.getMatchingCSSRules`
   (not `getCSSStyleRules`, gone in Firefox 140) lists
   `.ztts-pane.ztts-mac hbox > button + button` from the plugin's own
   sheet after Zotero's `button` rule. On Windows and Linux the class is
   absent: `margin-left` stays the toolkit's (5px on Windows) and the
   boxes 10 px apart. Poll `doc.styleSheets` for the plugin's sheet
   before reading its rules (it lands a beat after `navigateToPane`).
   A 2x snapshot of the shortcut rows for the eye.
3. **Locked sections, masked fields.** Every enabled provider: inputs
   `disabled`, button `Disable`; the three API keys, the Cloudflare token,
   both Extra headers and the WebDAV password `type="password"` (issue
   #19); report `type`, `disabled` and `value.length`, never a value.
4. **The `?` tooltips.** Three icons across the pane, per rulebook step 7:
   `#ztts-help-tip` opens (`showing` → `open`) with the label from the
   markup, Zotero's default tooltip stays `closed`.
5. **Test connection, once per provider.** Click-then-poll trace, 100 ms.
   Expected the success line derived from `src/ui/prefs-pane.ts`
   (`Connected. N voices available. …`), within 15 s — measured 211–674
   ms. A failure is acceptable only as a clear message; a status stuck
   at `Testing…` or cleared with no message is a FAIL.
6. **Enable is a commit point** (Local engine, free): Disable → Base URL
   `http://127.0.0.1:9` (the input has no id: select it by its
   `preference` attribute, set `value`, dispatch `input` and `change`)
   → Test connection says `Cannot reach Kokoro at
   http://127.0.0.1:9. Is the server running? (TypeError: NetworkError
   when attempting to fetch resource.)` — the address it tried, never
   the old `not running at that address` (issue #47) → Enable with that
   address leaves the provider **off** with the same sentence beside it,
   the pref false (issue #21) → the real address back → Enable passes,
   the pref true, the section locked. Restore the address verbatim.
7. **Server preset** (OpenAI section, unlocked): the dropdown's preset
   grays exactly the fields its `uses` map says (`src/core/server-presets.ts`);
   switching to OpenAI and back **restores the address and model that
   server had** (issue #34, fixed in 1.10.2: `openai.presetValues`
   remembers each server's values; before that the preset's defaults
   overwrote them) **and, since 1.10.10, its key, Voices and Extra
   headers** (issue #52): with a token in Extra headers under Chatterbox,
   a switch to Other leaves `openai.headers` empty (report its length,
   never a value) and the switch back restores it byte-identical (compare
   a hash); a key typed under MiMo is gone under Other and back under
   MiMo the same way; a server never visited starts with all three
   empty. **A wrong address is named** (issue #54, 1.10.10): under MiMo,
   the Base URL input's `placeholder` is `https://api.xiaomimimo.com`;
   typing `https://api.xiaomimim.com` (an `input` event) puts
   `api.xiaomimim.com looks like a typo of api.xiaomimimo.com.` in the
   status line at once, and Test connection then answers `Not tested:
   api.xiaomimim.com looks like a typo of api.xiaomimimo.com.` within a
   few ms with no request made (no `Cannot reach` in the debug store);
   `https://mimo.corp.example` runs the test and its result ends
   `mimo.corp.example is not api.xiaomimimo.com: a mirror or a proxy?`;
   the own address gets no note. The `?` beside the dropdown carries the
   preset's note. Enable again at the end.
   **Xiaomi MiMo** (1.10.10, issue #50; needs a MiMo key in
   `openai.apiKey` — free at platform.xiaomimimo.com — and is NOT
   TESTABLE without one, said so): Disable → the dropdown to *Xiaomi
   MiMo* → Base URL `https://api.xiaomimimo.com` and Model
   `mimo-v2.5-tts` written, Extra headers grayed and nothing else (as
   for OpenAI), the `?` carrying the
   preset's note (derive from `PRESETS.mimo.note()`), Voices empty. Test
   connection → `Connected. Model mimo-v2.5-tts available. 9 voices
   available. Synthesis works.` — the probe is one two-character chat
   completion, and the model list also names `mimo-v2.5-tts-voiceclone`
   and `-voicedesign`, ranked first among the Model field's suggestions.
   Enable → the pref true, the section locked. In the voice browser and
   in a fixture's player the nine voices read `MiMo-mimo_default`,
   `MiMo-冰糖`, `MiMo-茉莉`, `MiMo-苏打`, `MiMo-白桦`, `MiMo-Mia`,
   `MiMo-Chloe`, `MiMo-Milo`, `MiMo-Dean` under Multiple languages, none
   of them `OpenAI-…`. One sentence of `fixture-b.pdf` read with
   `MiMo-冰糖` (`selectVoice`, paused in the same script) logs
   `[zotero-tts] openai: no word timestamps for N chars (audio through
   /v1/chat/completions), highlighting the sentence` — the note is the
   proof the chat route answered, since the speech route is a 404 on
   this server. A wrong voice id is told by the server's own words:
   Disable, Voices `alloy`, Test connection → `Connected, but synthesis
   failed: chat/completions audio: HTTP 400 — Unknown voice: alloy.
   Available voices: [mimo_default, 冰糖, 茉莉, 苏打, 白桦, Mia, Chloe,
   Milo, Dean]` (`serverReason` in `src/core/providers/openai.ts` quotes
   the longer of the error body's `message` and `param`); Voices back to
   empty. Then the dropdown back to the server it had (its address and
   model return through `presetValues`), Enable; the key is the user's
   to clear.
8. **System voices.** `diagnostics.systemProvider()` → `enabled`,
   `platform` (`"win"` / `"mac"`), `unsupported: null`, `backend` with
   its `platform`, `wordTimestamps` and state, voices with
   `id`/`name`/`lang`/`zoteroId`; then with the first voice id →
   `synthesis.bytes` > 0, `type` audio, `backendAfter`. **On Windows**:
   `backend.running`, ids `sapi5/…` / `onecore/…`, `zoteroId`
   `local-urn:moz-tts:sapi:<desc>?<lang>`, `synthesis.words` > 0 (or
   `words: 0` with the SAPI-rate `note`); Test connection → `Connected.
   N voices available. Word timestamps available.`; the note beside the
   `?` reads `Your Windows voices, with word highlighting.` **On macOS**
   (issue #23, 1.11.0): `backend.wordTimestamps: false` and
   `backend.spawned` counting up (one `osascript` per listing, one `say`
   per sentence); every id `osx/<identifier>` with `zoteroId`
   `local-urn:moz-tts:osx:<identifier>`, the id set identical to
   `speechSynthesis.getVoices()` in the main window (191 = 191 on
   2026-09-06); `synthesis.words: 0` with `note: "macOS voices come
   without word timings"`; `diagnostics.systemProvider('osx/com.apple.voice.nosuch')`
   → `synthesisError` naming the voice and no `synthesis` — `say` alone
   would have spoken Samantha, exit 0; Test connection → `Connected. N
   voices available. Synthesis works. No word timestamps: macOS voices
   have none, so the sentence is highlighted.`; Enable turns
   `system.enabled` on and locks the section, and a planted
   `reader.readAloudVoices` entry naming `local-urn:moz-tts:osx:<id>` is
   rewritten to `system::osx/<id>` in `voice` and `tierVoices.local`
   about 0.5 s *after* the button reads Disable (the adoption is not
   awaited — poll the pref; and reset `readAloud.memory` after planting,
   since a chrome-scope write of that pref is a pick to memory-sync),
   with `adopted 1 remembered voice(s)` in the log; Disable off; the note
   reads `Your Mac's voices, highlighted by sentence.` with the Windows
   and Linux notes `hidden`. **On Linux** instead: `unsupported` is the
   platform sentence (`System voices are available on Windows and macOS
   only; this build has no speech helper for Linux.`), the note reads
   `Not available on Linux.`, and Test connection **and** Enable on the
   System voices section write that same sentence, word for word, to
   `#ztts-test-result-system` — never a sentence about an address, which
   that section does not have (issue #47); Enable leaves the pref false.
9. **Zotero's own voices from the sandbox.** `diagnostics.zoteroVoices()`
   → `voices` > 0 with `tiers` counts matching the browser's columns,
   the `favorites` split, `sample.bytes` > 0.
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
    the space, `已连接。合成正常。` without; `tier` `Local` / `本地`
    (Zotero's own word, reader.ftl); `isolationMarks: false` — no bidi
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
    12).
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
    they did before #43: the tier column `Standard (N)` / `Premium (N)` /
    `Local (N)` in that order (28 / 1452 / 787 = the 2267 of a
    2026-09-06 listing), `#ztts-voices-status` beginning `Default voice: ` (or
    `Default speed: ` / `No default voice or speed:` per the two
    "everywhere" switches), `#ztts-about-build` `Version <build> · Date
    <date> · Time <hh:mm>` over `#ztts-about-author` `Author Xujia Liu ·
    Email xujialiuphd@gmail.com`, Test connection's `Connected. N voices
    available. …` (1.5), a shortcut field clicked `Press the new keys…
    (Esc cancels)` and Escape (4.8), the `#ztts-notice` dialog (2.9) with
    its `OK`. Run item 7's address-hint flow before the fixture session of
    2.9 opens or after it closes: the guard refuses a provider switch
    while a tab reads. Screenshots of every group in the app's language.
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
    1.11.0): the tier column `标准 (N)` / `高级 (N)` / `本地 (N)`, the
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
13. **The plugin's icon** (issue #60, 1.11.0). The manifest declares
    `icons` 48/96 (`content/icons/favicon@0.5x.png`,
    `content/icons/favicon.png`) and the pane registration passes no
    `image`, so Zotero falls back to `Zotero.Plugins.getIconURI(pluginID,
    24)` (`xpcom/preferencePanes.js:151-152` → `xpcom/plugins.js:493-504`
    → `AddonManager.getPreferredIconURL`, which multiplies the ideal size
    by the window's `devicePixelRatio`, then takes the exact match, else
    the smallest icon at least that large, else the largest). From chrome,
    `AddonManager.getAddonByID(id)`: `icons` has the keys `48` and `96`,
    both `jar:file:///…/zotero-tts@xujialiu.top.xpi!/content/icons/…`, and
    `iconURL` is non-null; `getIconURI(id, 24)` ends in `favicon@0.5x.png`
    while `24 × dpr ≤ 48` (36 at dpr 1.5, 24 at dpr 1 — the machine's,
    not the platform's: 1.5 on 2026-09-05 and 1 on 2026-09-06, both
    Windows) and `getIconURI(id,
    96)` in `favicon.png`. A `null` anywhere means the manifest icons were
    not read — the version string alone does not prove an upgrade took
    when the beta number did not move. The settings sidebar row labeled
    `Zotero-TTS` carries `favicon@0.5x.png` in the same box and at the
    same x as Zotero's own panes (`cog.svg`, `account.svg`, …; 19.22 px at
    dpr 1.5 and at dpr 1). Tools → Plugins resolves the same map at its
    own ideal size 32 — at dpr 1.5 exactly 48 device px, the 48 px file
    1:1; at dpr 1 the same 48 px file — and shows
    `Version <build>` only in the expanded card, never in the collapsed
    row. By eye at 6×: red headphones, three amber bars between the cups,
    crisp at both sizes (verified 2026-09-06).
14. **Cloudflare Workers AI** (1.11.3, issue #72; needs an account id
    and a Workers AI API token in `cloudflare.accountId` /
    `cloudflare.apiToken` — NOT TESTABLE without them, said so). The
    groupbox `#ztts-provider-cloudflare` sits between
    `#ztts-provider-azure` and `#ztts-provider-local`, headed
    `Cloudflare Workers AI`, with an Account ID input (`type="text"`, 32
    characters) and an API token input (`type="password"`,
    `revealPassword` false) — report `type`, `disabled` and
    `value.length`, never a value, and **blank or crop the Account ID
    input before any screenshot of the section**: it is in the clear.
    The `?` opens `#ztts-help-tip` within 100 ms with the help text
    beginning `Both values are on the Workers AI page of your Cloudflare
    dashboard`. Test connection → `Connected. 66 voices available.
    Synthesis works.`, measured 1211–1409 ms: the model list (the four
    the plugin knows — `@cf/myshell-ai/melotts`, `@cf/deepgram/aura-1`,
    `aura-2-en`, `aura-2-es` → 4 + 12 + 40 + 10 voices), then two
    characters of `@cf/myshell-ai/melotts/en`, the first voice listed. A
    wrong account id (32 zeros; stash the real one and restore it byte
    for byte, compared by length) → `The server rejected the API key.
    (Cloudflare model list: Cloudflare rejected the API token or the
    account ID (403) — Authentication error)` within 431 ms; a wrong
    token gives the same sentence with `(401)` — the model list answers
    403 to the one and 401 to the other, the run route 401 to both, and
    the provider takes them in one `auth` branch. Enable is refused while
    any tab is reading, like every provider (section 3 item 9, issue
    #11): the click opens `#ztts-notice` in 8 ms and the pref stays
    false, so with sessions open this half runs on an idle profile or by
    a pref write. Enabled: switch `Disable`, both inputs `disabled`.
    **A single `Connected, but synthesis failed: … HTTP 500 — AiError:
    AiError: Internal server error (<request id>)` is Cloudflare, not
    the build**: MeloTTS 500ed one request in four on 2026-09-07 while
    Aura answered 6 of 6, the same request succeeded a moment later, and
    since 1.11.3 the provider retries a 5xx once after 500 ms
    (`RETRY_DELAY_MS`); a line that still fails names the second reply,
    and a segment the retry rescued says so in its debug line: `(audio
    from @cf/myshell-ai/melotts after a retry of HTTP 500)`.
15. **Speechify** (1.11.7, issue #79; needs the owner's key in
    `speechify.apiKey` — NOT TESTABLE without it, said so). The groupbox
    `#ztts-provider-speechify` sits between `#ztts-provider-cloudflare`
    and `#ztts-provider-local`, headed `Speechify`, with one
    `html:input type="password"` bound to
    `extensions.zotero.zotero-tts.speechify.apiKey` and no other field —
    report `type`, `disabled`, `revealPassword` and `value.length`,
    never a value. Its `?` (`ztts-help-speechify`) opens
    `#ztts-help-tip` within 100 ms (33 ms on 2026-09-09) with a
    337-character text beginning `The key is on the API keys page of
    your Speechify workspace`, Zotero's own tooltip staying `closed`.
    Test connection with the key → `Connected. 992 voices available.
    Synthesis works.` in about 3 s (3025 ms on 2026-09-09: five
    paginated pages of 200 voices, then two characters on the first
    voice listed, `hi-IN/aadi`) — the count is the key's whole list and
    may move by a few; under 900 is a failure. With `sk_wrong` → `The
    server rejected the API key. (Speechify voice list: Speechify
    rejected the API key (401) — Unauthorized)` in about 0.3 s; with the
    field empty → `No API key set for this provider.` Enable while a tab
    reads is refused by the guard naming the tab (section 3 item 9,
    issue #11); on an idle profile, or after a pref write and a pane
    reopen, the switch reads `Disable` with the key field `disabled` and
    `revealPassword` false. **The key is a secret**: read it into the
    pref inside Zotero (`IOUtils.readUTF8` of the owner's file), never
    into the transcript, and report its length only. A profile with
    `webdav.autoUploadSettings` on uploads every pref write to the
    owner's WebDAV settings file — the key included, until the restore
    uploads the empty one again (2026-09-09: seven uploads).
16. **While a tab reads, the player's settings wait.** With a Read Aloud
    player open in any tab (paused counts; `popupOpen` alone counts), a
    sync carrying a newer provider-section key (`azure.voice`) and a newer
    shortcut reports `lastOutcome "deferred"`, `adopted 1`, `deferred 1`,
    `pushed 0`, `uploaded false`: the shortcut pref is written, the
    provider key is not, and `lastApplied.applied` names only the shortcut
    with `from ["tester"]`; the settings line ends with `1 more wait until
    the reading stops.` Pushing is never deferred. Once no player is open
    anywhere, the next trigger applies the voice (`adopted 1`,
    `lastApplied.applied ["azure.voice"]`) and the provider's check runs
    and passes (`state.held` stays `{}`, the log line carries no `held
    azure`) — measured 2026-09-10 on 1.11.7-beta5: a crafted `azure.voice`
    (`zh-CN-XiaoyiNeural`) reported `deferred 1` / `adopted 0` at a
    pane-open trigger with the fixture's player open and paused, and
    applied at the `reader-close` trigger that closed it, the sync settled
    `ok` within ~5 s.
