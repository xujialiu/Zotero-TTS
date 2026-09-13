# Manual follow beta4 scripts: automatic recovery on reentry (issue #100)

[Report and raw returns](../report.md).
These scripts use a fresh baseline and disposable fixtures.
The current user reader state must be read anew, not copied from beta3.
Run 01/03/04 for baseline/temporary transport/fixtures, then the PDF and
EPUB readiness scripts before opening players. The 06b retry waits for
EPUB page mapping; it does not justify opening the player early.

Scripts 12–15 exercise repeated out-of-view waits and automatic partial
reentry in PDF/scrolled EPUB, both modes. Script 19 covers paginated
semantic navigation, 20 the disabled legacy rule, and 21/22 controlled
sentence transitions. A controlled transition is not natural audio:
the fixture AudioContexts did not advance during this pass.
Scripts 23–28 close fixtures, restore original state and audit it; the
corrected 26b/28 steps are the final restoration record. Adapt fixture
identifiers and all baseline state before reuse, and preserve the
original snapshot across retries.
