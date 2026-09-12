[Checklist index](../README.md)

## 1c. Fish UI refinement and English regions (issue #91, beta5)

The owner first reviews the installed UI. Start a tester logic pass only
after that approval; beta2's completed pass above does not verify beta3.

- The standalone Find Model IDs link, saved-IDs hint and Refresh Fish
  list button do not appear. Model IDs is a link inside Voices (Model IDs).
  Its `?` explains a voice ID and names the discovery page. Voice sources
  has normal weight, with three checkboxes on one row; all lock with the
  provider enabled, retaining their choices. Cloud's action buttons are below the source switches; Local's
  heading includes the Fish Speech repository address. By eye: spacing,
  wrapping and alignment in the user's settings window. Compare the left
  input edges of Speechify, Fish API key, Voices and Fish Speech Address:
  they share one column, and the full inline link caption fits on one line.
- English voices with explicit provider-published regions appear in the
  matching regional English language groups, as Azure's do. Unmarked
  English remains generic and multilingual models remain multilingual.
  Compare the same model IDs before and after grouping: favorites and
  saved selections retain their IDs. Unit fixtures cover conflicting or
  absent region metadata without guessing an accent from a name.
- Enable and Test connection fetch fresh Fish lists rather than merely
  reporting a previously cached count. Existing source-union, timeout,
  retained-manual and account-isolation behavior from section 1b still
  applies. Use one free-model probe per check, and preserve user sessions.
