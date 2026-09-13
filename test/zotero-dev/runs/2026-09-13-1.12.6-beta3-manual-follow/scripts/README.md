# Manual follow beta3 scripts (issue #100)

[Combined-build report](../observed-report.md)
and [executed-script manifest](../artifact-manifest.md).
The manifest identifies the reused scripts of the
[beta2 run](../../2026-09-13-1.12.6-beta2-manual-follow/scripts/README.md). The
beta3-specific scripts are the ones in this folder, including setting EPUB
flow before opening its player and cleanup of the extra setup fixture.
Preserve the fresh baseline before running either setup route; do not
substitute the historical item IDs.

Both formats/modes passed the controlled fragment checks and the final
fixture-close route produced no new dead-object messages. Trusted
Shift+Enter/PageDown routing, drag/pan inputs and real cross-page/oversized
geometry remain unverified through this bridge. Direct explicit locking
passed; it does not prove the shortcut route. The report separately
retains an early EPUB-flow setup error and native navigation-away noise.
