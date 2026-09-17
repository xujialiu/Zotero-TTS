[Checklist index](../README.md) · [Scripts](../scripts/settings-sync-while-reading/README.md)

## Synced settings during reading (issues #68, #121)

Use the setup and restoration rules of [settings sync](settings-sync.md).
Issue #121 supersedes the old rule that any open player deferred every
provider section. The original item numbers remain below.

### 1.16

16. **Only affected changes wait.** Open a fixture on Azure, paused or
    playing, and sync newer `azure.voice`, an unused provider's setting,
    and a shortcut. Only the Azure item is deferred; the other two apply.
    The status names the deferred count and the applied keys. Keep another
    fixture open on a different provider, then close only the Azure
    player's popup, leaving its reader tab open. That close triggers the
    pending Azure change and its provider check. The unrelated player's
    voice and controller stay unchanged. Pausing Azure does not release
    the pending item. Pushing local settings is never deferred.

    Evaluate related provider settings and the favorites pair together.
    A batch that disables favorites-only and clears the favorite marks
    must apply together when it leaves current voices available. Removing
    a current voice while keeping the filter on must wait.

    A failed provider check that returns after playback starts leaves that
    provider enabled and schedules its check for after reading ends.
    Unit tests exercise this race; the focused live evidence is retained
    in the [reading guard case](reading-guard.md), item 3.9.

### 6.16

16. The original settings-sync item is now covered by 1.16 above. Previous
    1.11.7 measurements established blanket deferral, not the selective
    behavior required by #121; do not reuse their PASS as current evidence.
