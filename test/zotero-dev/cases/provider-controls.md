[Checklist index](../README.md) · [Scripts](../scripts/provider-controls/README.md)

## A provider section: locked fields, Test connection and Enable

What every provider section shares.

Items 1.3, 1.5 and 1.6 of the checklist, under their original numbers.

### 1.3

3. **Locked sections.** Every enabled provider: inputs `disabled`,
   button `Disable`; report `disabled` and `value.length`, never a value.
   The fields whose value is a secret, and the eye that uncovers them,
   are [secret-fields](secret-fields.md).

### 1.5

5. **Test connection, once per provider.** Click-then-poll trace, 100 ms.
   Expected the success line derived from `src/ui/prefs-pane.ts`
   (`Connected. N voices available. …`), within 15 s — measured 211–674
   ms. A failure is acceptable only as a clear message; a status stuck
   at `Testing…` or cleared with no message is a FAIL.

### 1.6

6. **Enable is a commit point** (Local engine, free): Disable → Base URL
   `http://127.0.0.1:9` (the input has no id: select it by its
   `preference` attribute, set `value`, dispatch `input` and `change`)
   → Test connection says `Cannot reach Kokoro at
   http://127.0.0.1:9. Is the server running? (TypeError: NetworkError
   when attempting to fetch resource.)` — the address it tried, never
   the old `not running at that address` (issue #47) → Enable with that
   address leaves the provider **off** with the same sentence beside it,
   the pref false (issue #21) → the real address back → Enable passes,
   the pref true, the section locked. Restore the address verbatim.
