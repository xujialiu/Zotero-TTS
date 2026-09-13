[Checklist index](../README.md) · [Scripts](../scripts/fish-settings-refinement/README.md)

## 1c. Fish settings refinement (issue #91, beta5)

The owner first reviews the installed UI. Start a tester logic pass only
after that approval; the 1.12.2-beta2 pass recorded in
[1b](fish-voice-sources.md) does not verify beta3.

- The standalone Find Model IDs link, saved-IDs hint and Refresh Fish
  list button do not appear. Model IDs is a link inside Voices (Model IDs).
  Its `?` explains a voice ID and names the discovery page. Voice sources
  has normal weight, with three checkboxes on one row; all lock with the
  provider enabled, retaining their choices. Cloud's action buttons are below the source switches; Local's
  heading includes the Fish Speech repository address. By eye: spacing,
  wrapping and alignment in the user's settings window. Compare the left
  input edges of Speechify, Fish API key, Voices and Fish Speech Address:
  they share one column, and the full inline link caption fits on one line.
- Enable and Test connection fetch fresh Fish lists rather than merely
  reporting a previously cached count. Existing source-union, timeout,
  retained-manual and account-isolation behavior from section 1b still
  applies. Use one free-model probe per check, and preserve user sessions.
