[Checklist index](../README.md) · [Scripts](../scripts/plugin-icon/README.md)

## The plugin's icon (issue #60)

Item 1.13 of the checklist, under its original number.

### 1.13

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
