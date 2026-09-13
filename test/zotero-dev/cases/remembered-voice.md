[Checklist index](../README.md) · [Scripts](../scripts/remembered-voice/README.md)

## The remembered voice (issues #35, #36, #37, #49)

A remembered default the list does not offer, the language dropdown and
one voice across tabs. Item 4.7 runs with two fixtures open, A speaking.

Items 3.2, 3.11 and 4.7 of the checklist, under their original numbers.

### 3.2

2. **A remembered default the list does not offer** (issues #35, #36,
   #37, fixed in 1.10.2). Point the memory at an unoffered voice (a
   non-favorite under favorites-only), open the popup: expected the
   manager starts on **a Local voice it does offer, favorites first**,
   a line in the reader says which, the memory keeps the default, and
   `selectedVoiceID` is never a Zotero voice (`bdd0dcc3-en-US` was the
   metered fallback before the fix). Also: a manager sitting on the
   Standard tier follows a Local `mul` pick (#36), and a popup reopened
   right after favorites-only changed applies the remembered voice
   against the **new** list (#37). Expected outputs: the fix's own
   verification on the three issues; derive the current ones from
   `src/read-aloud/memory-sync.ts`.

### 3.11

11. **The player's language dropdown lands on the language's remembered
    voice** (issue #49, 1.10.10). With *Use one voice everywhere* on, the
    memory naming a single-language Local voice V_en under `en`, the
    `mul` entry naming a Local multilingual voice V_mul — neither the
    first of its Local pool, or the check proves nothing — and both
    fixtures paused on V_en: tab 1's dropdown to *Multiple languages*,
    driven through its own rows (the language `CustomSelect`'s trigger,
    then `pointerup` on the `…-option-mul` row), read in the same
    script. Expected `manager._persistedVoices` = the `mul` entry (voice
    V_mul) right after the click — the mechanism; before the fix it was
    still the `en` entry — `selectedVoiceID` V_mul, both pref entries as
    before, the memory V_mul (`mul`), tab 2 on V_mul and still paused,
    and the log in order: `staged Zotero's entry for the dropdown's mul:
    voice V_mul`, `read-aloud memory (a pick the pref did not show): …
    V_mul (mul)`, `applied read-aloud memory: en -> mul, …` (tab 2's
    lane move), `spread read-aloud voice V_mul (mul): en: resynced`.
    Back to *English (United States)* (`…-option-en-US`):
    `_persistedVoices` the `en` entry, `selectedVoiceID` V_en (the first
    en-US voice of the pool — AIGenerate1 on 2026-09-05 and 2026-09-06,
    Masaru for `mul` — was the bug), entries untouched, memory V_en
    (`en`), tab 2 on V_en. The `staged … dropdown's` line appears once
    per click and never on a popup open, a spread, a pref restore or
    `_prepareReadAloud()`. With an en-GB Local voice listed, *English
    (United Kingdom)* loads the `en` entry and Zotero's own region rule
    then skips V_en for the first en-GB voice (Abbi on 2026-09-06),
    rewriting the entry with region `GB` — Zotero's design; the pref
    snapshot restores it. A language with no entry starts on Zotero's
    own choice, as without the plugin. Drive the dropdown in the
    **selected** tab: a player opened through the API in a background
    tab never mounts its DOM (the rulebook). Zotero logs one
    `selectionRanges[0] is undefined` TypeError (reader.js
    `_getAnnotationFromSelectionRanges`) per dropdown click, its own
    noise, nothing of ours in the stack. Measured 2026-09-06 with
    Andrew / AlloyTurbo at 2.1×, 1.10.10-beta.

### 4.7

7. **One voice everywhere across tabs.** Both sessions open: a
   `selectVoice` in A → `spread read-aloud voice … : <lang>: resynced`,
   B's `selectedVoiceID` follows within ~2 s, the memory follows,
   `diagnostics.readAloudMemory()` shows both with `listsDefault: true`;
   the reverse from B.
