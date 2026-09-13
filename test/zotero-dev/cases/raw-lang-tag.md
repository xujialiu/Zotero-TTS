[Checklist index](../README.md) · [Scripts](../scripts/raw-lang-tag/README.md)

## A PDF's raw /Lang tag (issue #59, 1.11.0)

Items 3.12–3.14 of the checklist, under their original numbers.

### 3.12

12. **A raw `/Lang` tag, and the restore Zotero never repeats** (issue
    #59, 1.11.0). 204 of this library's PDFs carry `/Lang (EN)` and 37
    `/Lang (English)`; the tag reaches `setLanguage` as it is, Zotero's
    only restore of a fresh tab runs on it and finds no entry, and once
    the list lands `_resolveVoice` moves the manager to the first
    language it has a voice for (reader.js 82396-82420 of beta.7) and
    never restores again. Fixtures: Fluent Python (attachment key
    `6HKFATNK`, `/Lang (EN)`) and Tsai et al. 2025 (`2SHZQY6Z`,
    `/Lang (English)`), opened with `Zotero.Reader.open` and driven with
    `_prepareReadAloud()` on a popup-less tab — which never renders its
    player again (the rulebook), so close it right after; poll
    `manager.lang` in ≤ 6 s windows.
    - Both switches off: whichever side of the race wins, the manager
      ends on `en` with the pref's `en` entry — its `voice`, that voice's
      tier, its `speed`; `diagnostics.readAloudMemory()` gives that
      reader `resyncs: {count: 1, last: "EN -> en"}`; the log has
      `Zotero moved the manager EN -> en inside its resolution; restored
      again for en`; and **no `EN` key** is in
      `extensions.zotero.reader.readAloudVoices` at any sample. Measured
      2026-09-06 (1.11.0-beta3, 10.0.2-beta.7, Windows): the SDT landed
      first (tag visible 446–1006 ms, list at 1171 ms, 2267 voices),
      ending on the profile's own `en` entry, `69366774-en-US` /
      `premium` / 1.7; with the list loaded before `_prepareReadAloud`
      the move happens inside `setLanguage`, a 20 ms poll never sees the
      tag, same end state, same `resyncs`. The `English` fixture gives
      `last: "English -> en"`, applies the fossil `"English": {"speed":
      1.7}` while the tag stands and leaves it untouched. Before the
      fix the tag-first race ended on `a6ac2542-en-US` (Premium Voice
      1, tier `premium`) at speed 1.
    - Voice off, speed on, the memory's speed differing from the `en`
      entry's: nothing is written while the manager sits on the tag, and
      the second pass writes `en.speed` (1.5 measured), logging `applied
      read-aloud memory: en -> en, speed 1.5, voice -` after the move
      line.
    - Both on (the shipped defaults), a listed voice remembered: the
      lane is moved before the list lands, so `resyncs` is `null`, the
      log has `applied read-aloud memory: EN -> en, speed 1.7, voice
      <id> (en)`, `docLang` stays `EN`, and the remembered voice is
      selected once the list is in.
    Touches `reader.readAloudVoices`, `readAloud.memory` and both
    switches: restore the voices pref while the voice switch is off,
    then the switches, then the memory.

### 3.13

13. **A speed shortcut while the manager sits on the raw tag** (issue
    #59, 1.11.0). Voice off, speed on; a trusted `Shift+C` through
    `nsITextInputProcessor` on the reader's iframe window, fired by the
    polling script the instant `manager.lang` reads the tag — the window
    opens ~370–500 ms after `_prepareReadAloud()` and stands ~250–400
    ms. Expected: `keydown()` returns 1; the toast reads the manager's
    speed + 0.1 (`1.1×` from 1 — nothing has restored a speed for the
    tag); **no `EN` key ever**; the memory pref's `speed` is the new
    one; every existing key's `speed` follows it, written exactly once,
    by `persistSpeed` under `setDefaultSpeed` (the spread); the log has
    `read-aloud memory (a speed the pref could not carry): speed 1.1,
    voice …` then `spread read-aloud speed 1.1 to N reader(s)`, N the
    loaded readers open (1 on 2026-09-05, 3 on 2026-09-06). Once the
    list lands the manager is on `en` at that speed with the `en`
    entry's voice. Before the fix the shortcut created `"EN": {"speed":
    …}` and the pref observer, not `learnSpeed`, carried the speed.

### 3.14

14. **The move hook is per manager, and a reload takes it with it**
    (issue #59, 1.11.0). On an open reader
    `Object.prototype.hasOwnProperty.call(manager, '_resolveVoice')` is
    true (through the Xray and waived) while `getPrototypeOf(manager)`
    keeps its own `_resolveVoice` (system-voices' prototype shadow;
    `diagnostics.systemVoices()` → `patched: true`). Across an in-place
    reinstall with that tab open, sampled every 5 ms: the own property
    disappears for a moment (~55 ms measured) and comes back as a
    different function — tag the old one (`fn.__probe = 'x'`) and the
    tag must be gone. The new hook works: `manager.setLanguage('EN')`
    on the idle manager moves it back to `en` with the voice switch on
    and `resyncs` records the move (with the switch off Zotero lands on
    the selected tier's `languages[0]` — `ps` measured 2026-09-06,
    `reader.js` 82412 with `resolveLanguage` 38057-38077 comparing base
    languages case-sensitively — and the hook restores for that
    language). No `can't access dead object` in the debug store, nothing of
    ours in `Zotero.getErrors()` (the two `uncaught exception:
    undefined` per in-place install are Zotero's), a tab opened after
    the reload has the own property again, and `diagnostics.patches()`
    shows `live === total` everywhere.
