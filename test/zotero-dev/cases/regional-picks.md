[Checklist index](../README.md)

## 1d. Regional picks stay selected in PDF and EPUB (issue #91, beta6)

The owner approved the UI and requested this regression fix and a Luna-max
tester pass. Run the baseline, this section, and the final Fish controls
from 1b/1c; do not run the whole plugin checklist.

1. Import an owned PDF fixture and an EPUB fixture. Keep the owner's
   existing readers untouched. Save prefs in Zotero memory, suspend
   auto-upload/settings sync for temporary choices, and avoid propagating
   fixture voice picks into user readers. Restore native voice entries and
   remembered voice before re-enabling global voice propagation.
2. On each fixture's paused player, start with a listed generic English
   Local voice. Through the actual language dropdown choose English
   (United States), English (United Kingdom), then generic English. Read
   the selected voice's normalized language and displayed dropdown value
   after settling: en-US, en-GB, en respectively, still on the Local tier.
   Repeat another available region. Do not assert a vendor-specific voice
   when the native Local pool contains multiple providers.
3. The debug line `staged an exact en-US voice for the language pick`
   proves the correction ran when a generic remembered voice would win.
   A matching remembered regional voice remains selected. Existing regional
   changes which work natively stay native. Preserve paused state.
4. On the owned fixtures only, reproduce stale requested fields: a generic
   selected voice with `_region=US`, and a regional selected voice with
   `_region=null`. The same explicit user picks still settle correctly;
   confirm actual manager getters so a wrapper-only write is not a probe.
5. Unit tests cover global voice memory on/off, no exact voice in the
   selected tier without switching to a paid tier, and automatic restores.
   Test global propagation live only if no protected reader would be changed.
   A click on a language with no concrete regional voice retains native
   fallback behavior; no fabricated voice is added.
6. Read plugin errors, erase owned fixtures, close test windows as needed,
   and restore every changed setting, source choice, native voice entry and
   remembered voice. Verify original reader states and pref user-value
   presence. The fixed beta can remain installed.

**Verified 2026-09-12 on 1.12.2-beta6 by Luna-max zotero-tester.**
PDF and EPUB: US, GB, generic English and CA stayed en-US, en-GB, en and
en-CA at 500 ms and roughly one second, on Local and paused; repeated US
selection kept the matching voice. Both stale requested-region cases
passed on both formats, and exact-staging logs proved the code path. Fish
controls, inline link and aligned columns remained correct. All fixtures,
positions, preference bytes/user-value presence, global-voice/sync settings
and debug state were restored; original reader states were unchanged and
there were no new plugin/dead-object errors. No playback advancement or
sound-quality claim is made by this paused-menu pass.
