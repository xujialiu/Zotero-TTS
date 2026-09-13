[Checklist index](../README.md) · [Scripts](../scripts/settings-pane/README.md)

## The settings pane: its layout, the About group and the help icons

Items 1.2 and 1.4 of the checklist, under their original numbers.

### 1.2

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

### 1.4

4. **The `?` tooltips.** Three icons across the pane, per rulebook step 7:
   `#ztts-help-tip` opens (`showing` → `open`) with the label from the
   markup, Zotero's default tooltip stays `closed`.
