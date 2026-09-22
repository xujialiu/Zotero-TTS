# Providers on first installation (issue #132)

Expected behavior from 1.14.3. Live verification was waived by the owner
for this release; the automated regression is
`test/read-aloud/first-install-catalog.test.ts`.

### 1. A provider with no saved enable choice starts off

Complete the baseline and test WebDAV isolation first. Privately preserve
OpenAI's enabled preference and whether it has a user value. Clear only
that user value, reopen the settings pane, and inspect the effective value,
its default branch value and the voice browser's first column.

Expected: both values are false, the section offers Enable, and the browser
has no OpenAI entry. Listing the catalog must not contact OpenAI. Keep
Zotero's Standard and Premium settings as found. Do not clear API keys,
voice memory or other providers to simulate this condition.

### 2. Explicit choices survive the new default

With catalog requests intercepted to prevent a test request, verify a saved
true value still reads true and a saved false value still reads false.
An explicitly enabled provider whose discovery fails still has a zero-voice
entry; that diagnostic remains useful and is not hidden by this fix.

Restore the exact saved preference and user-value state in a finally block,
remove the interception, then perform the baseline cleanup. No playback or
synthesis is necessary. Never send temporary preferences to the owner's
WebDAV. A future live run retains its executed kit under
`test/zotero-dev/scripts/first-install-providers/`.
