[Checklist index](../README.md)

## The secret fields: covered, uncovered by the eye, and copyable

The eleven fields whose value is a secret — the four API keys, the
Cloudflare token, the two **Extra headers** lines and the WebDAV
password. Issue #19 covered them with `type="password"` and left the
uncovering to Gecko's own reveal button; Gecko allows no copy and no cut
out of a password editor, revealed or not, so the cover is the pane's own
now (`-webkit-text-security`, `ui/secret-rows.ts`) and the eye after each
field switches it.

The masked half of item 1.3 ([provider-controls](provider-controls.md))
moved here; the lock itself stayed there.

Run with the settings window open on the plugin's pane. Nothing here
changes a pref: the diagnostic reports lengths, never values.

### 1

1. **Every field is covered, and none of them is a password box.**
   `Zotero.ZoteroTTS.diagnostics.secrets()` — `pane: "open"` and 11
   fields; for each: `type: "text"`, `textSecurity: "disc"`,
   `revealed: false`, `eye.pressed: "false"`, `eye.disabled` matching
   whether that provider is on. A `type: "password"`, a missing `eye` or
   a `textSecurity` that is not `disc` on a covered field is a FAIL.
   Report `pref`, `type`, `textSecurity`, `length` — never a value.

### 2

2. **The eye uncovers a field and covers it again.** On an unlocked
   section (a provider that is off), click the eye after its Extra
   headers or API key field, then `diagnostics.secrets()`: that field
   `revealed: true`, `textSecurity: "none"`, `eye.pressed: "true"`, and
   its `length` unchanged. Click again: back to `revealed: false`,
   `textSecurity: "disc"`, the same `length`. No other field moved.

### 3

3. **A value can be taken out of the field.** `diagnostics.secrets(true)`
   — every non-empty field `canCopy: true`, covered as much as revealed:
   the cover is paint, and the box is an ordinary one. This is the whole
   reason for the change, and the field that fails it is the finding.
   The probe selects each value for the length of one reading and puts
   the selection and the focus back.

### 4

4. **A provider that is on keeps its secrets covered.** With a provider
   enabled: its fields `disabled: true` in the pane, and in
   `diagnostics.secrets()` `revealed: false` with `eye.disabled: true`.
   Then, on a provider that is off: reveal one of its fields, Enable it
   (item 1.6's commit point), and the field must come back
   `revealed: false` with the eye greyed — a value uncovered for editing
   never stays bare behind the lock (issue #19). Restore the switch.

### 5

5. **By eye, a human only.** The dots read as they did when Gecko drew
   them; the eye sits between the field and the `?`, on the row's centre
   line, and takes the window's text color in both themes; an empty Extra
   headers field still shows its `Name: value; Name: value` hint; the
   eye is greyed, and does nothing, on a locked section.
