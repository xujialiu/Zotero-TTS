[Checklist index](../README.md) · [Scripts](../scripts/highlight/README.md)

## The highlight and its colors

Items 3.5 and 5.5 of the checklist, under their original numbers.

### 3.5

5. **Highlight.** While speaking, `diagnostics.highlight()` → `patched:
   true`, `sentenceSlot: "ours"`, `activeWordTimestamp: "real"` (Azure,
   Kokoro, System on Windows) or the stand-in kind (OpenAI, System on
   macOS, granularity down to `sentence`), `style` = the pane's six
   prefs — the two colors, their opacities, and the `sentence` and `word`
   switches of issue #114; the log `highlight style
   attached to a PDF view`; a screenshot with the word in the word color
   inside the sentence in the sentence color. Since 1.11.7 every tab is
   attached at its open, before its popup: a PDF tab reads `patched:
   true, awaitingPage: false` a hundred milliseconds after it opens,
   and `patched: false, awaitingPage: true` is one whose pages are not
   rendered yet — it goes `patched: true` with its first page (section
   3c); `patched: false` alone is a tab the plugin never attached to
   (before 1.11.7 it was the normal state of a tab whose popup never
   opened). On a tab whose popup never opened the diagnostic reports
   `granularity: null`, `state: null`, logs
   `highlight: effective granularity null (method function; state
   missing)` — once, or once per call when another open reader's line
   alternates with it (the logger repeats only what changed) — and adds
   nothing to `Zotero.getErrors()`, called twice (issue #39; before the
   fix, one error per call). A fresh tab is one opened after the install
   with no other tab's speed changed since: a speed change is spread to
   every open reader and pushes a state to it — such a tab holds a state
   without ever opening its popup and reports it, `popupOpen: false`.

### 5.5

5. **Colors live.** The pane's color input (`preference=`-bound; set
   `value`, dispatch `input`) → the pref, `diagnostics.highlight().style`,
   the drawn word (at the next draw — a word onset while playing, or
   `view._render()` on a paused session; the *Sentence* switch — issue
   #114's, formerly *sentence under word* — takes effect at the next state
   push, so a paused session keeps its sentence until it resumes — by
   mechanism, 2026-09-05), the pane's preview; *Restore default colors*
   puts the six defaults back, the two switches included (no user value
   left).
