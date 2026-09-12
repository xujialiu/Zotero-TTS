[Checklist index](../README.md)

## 3d. Plugin-owned PDF following (issue #90, 1.12.1-beta3)

Run §0 and §3a alongside this section. The measured fixture is the owner's
PDF beginning "Getting the scale right…" (library title `manuscript`,
121 segments, Kokoro-af_alloy at 3×). Use only a permitted document and
save its reading position, zoom, find/split state and window state first.
No provider or shortcut changes are required. Counts/positions below are
beta3 observations, not constants to assert at another viewport.

1. **Ownership after an in-place install.** All 20 startup steps are ok,
   `failed: []`. The idle PDF reports `owned: true`, `patched: true`,
   `following: false`, `pending: false`, `last: null`. Its
   `_zoteroTTSPdfFollowId` exists; the native position lock intentionally
   reads false. Prove the installed bundle against the intended XPI, not
   the beta version alone. Compare errors with a pre-install baseline.
2. **A renderable PDF under a hidden chrome document.** PDF document
   visible, view not suspended, host not minimized: `visible: true`
   even if the host chrome document reports hidden. Verify real audio
   clock and segment advancement, not word timers alone. The 95-second
   run advanced 0–35, kept following with zero recorded manual inputs,
   and produced 28 distinct targets. Target updates alone do not prove
   physical scrolling; record both independently.
3. **Late native unlocks are not manual intent.** On the permitted view,
   call native `_onManualNavigation`, write its lock false and deliver a
   delayed scroll event. Later real segments must keep following and
   updating targets (measured 35–43). A queued native follow-shaped
   navigation is dropped. Original state/segments identity and Promise
   shape remain; strict original Promise identity is unit-tested.
4. **Manual keys stay disengaged across playback.** Trusted PageDown:
   consumed 2, `following: false`, `reason: 'keyboard'`; actual later
   segments leave `last.at` frozen (43–50 measured). Trusted End:
   consumed 1 and physical navigation (1237→9568 measured). A raw
   `dispatchEvent` is not a trusted-input test.
5. **Read Aloud shortcuts reengage.** Trusted Shift+Enter, ArrowRight
   and Shift+ArrowRight: consumed 1, following true, reason `explicit`;
   actual skips measured 50→51→53. Do not classify configurable skip
   shortcuts as manual page navigation. TIP KeyboardEvent initialization
   dictionaries must be cloned into the PDF window; press/release Shift
   through TIP as well, rather than assuming a dictionary modifier works.
6. **Resume preserves manual intent (#93).** After manual disengagement,
   put the current sentence inside the viewport while paused. Direct
   manager playback and the native playback toggle must leave following
   false; repeat with the sentence out of view. Go to reading position
   then restores following. This replaces #90's resume-in-view behavior.
7. **Trusted pointer inputs.** Prove events reach the PDF viewer. An
   ordinary click keeps following. Ctrl+wheel changes zoom (1.8→2.2
   measured) but keeps following; ordinary wheel disengages with reason
   `wheel`. Restore the exact zoom in cleanup. Separately verify input
   priority during a moving animation when that condition is observable;
   a wheel tested without an animation is not proof of interruption.
8. **Actual navigation and find results.** A search result (`scale`,
   12 matches measured) disengages with reason `find`. Native Next Page
   disengages with reason `navigation` (1→2 measured). Restore complete
   find state after asynchronous result callbacks finish, not just its
   query or open flag.
9. **Latest-state recovery while paused.** Hidden/minimized following
   reports pending. On return, measure the latest paused sentence, not
   the last pre-hide target: segment 53's new target 5648.86 replaced
   4583.66, and viewport samples were 9568→6002→5660→5648. Pending
   clears while renderable. Also test that an already manually
   disengaged view remains so after becoming visible; observations that
   stay hidden do not complete this negative case.
10. **Cross-page geometry.** Segment 28 carries two next-page rects;
    measured whole y 3598.4–4093.36, viewport height 1279, fits true:
    expected and issued target both 3206.38. Record actual arrival
    separately. The taller-than-viewport real-word/stand-in cases remain
    in §3a and unit tests; this fixture's current layout is not a giant.
11. **Secondary lifecycle.** Wait for its viewerContainer, then push
    the real composed Read Aloud state: a secondary with no rendered
    pages gains its own marker/native-lock accessor. Close the split:
    marker and accessor disappear. Restore split type, size and state.
    A controlled post-readiness push is not proof of automatic first
    attachment; automatic readiness and independent manual intent need
    their own live check (unit coverage exists).
12. **Measurement limits and human checks.** Beta3's uninterrupted run
    stayed at scrollTop 0; a direct unwrapped native smooth control also
    stayed at 0 while positional scrolling worked. A later paused
    recovery did physically move. Continuous visible motion, animation
    interruption, scrollbar drag (the measured gutter was 0 px),
    touch/pen/hand drag and the manually disengaged visible-recovery
    negative case must not be called live passes without observation.
    Never fake visibility or replace smooth scrolling to manufacture a
    successful natural-playback test. On 2026-09-11 the owner subsequently
    read the reported PDF from the beginning on beta3 and reported no
    problem. Record that as owner acceptance of actual continuous use,
    not as an automated motion pass or coverage of untried gestures.
13. **Cleanup and errors.** Remove test listeners, frames and timers.
    Restore bookmarks through reader/Item APIs and the plugin sampler;
    their write timestamps will update. Restore zoom/find/split state
    and respect later user window changes. Beta3 ended with 58 rows,
    zero queued writes, no write in progress, player closed/inactive,
    unchanged voice/memory preferences and no new dead-object/plugin
    debug failures. Four source-less `uncaught exception: undefined`
    records during installation remain unattributed; do not describe
   that as a completely empty error console.
