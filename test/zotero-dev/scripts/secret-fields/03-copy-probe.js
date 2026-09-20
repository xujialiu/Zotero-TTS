// secret-fields item 3: diagnostics.secrets(true) selects every field's
// value for one reading of editor.canCopy() (the point of the whole
// change -- Gecko refuses copy/cut on a type="password" editor whatever its
// revealed state, and these are type="text" now) and puts the selection
// and the focus back. Checked against every NON-EMPTY field; an empty
// field has nothing to copy and is reported, not asserted. Runs with
// whatever reveal state the pane is currently in -- the case's point is
// that copying does not depend on it.
// params: none. state: none read or written.
(async () => {
  const report = JSON.parse(Zotero.ZoteroTTS.diagnostics.secrets(true));
  const nonEmpty = report.fields.filter((f) => f.length > 0);
  const empty = report.fields.filter((f) => f.length === 0);
  return JSON.stringify(
    {
      pane: report.pane,
      total: report.fields.length,
      nonEmptyCount: nonEmpty.length,
      emptyCount: empty.length,
      nonEmpty: nonEmpty.map((f) => ({ pref: f.pref, length: f.length, revealed: f.revealed, canCopy: f.canCopy })),
      empty: empty.map((f) => ({ pref: f.pref, canCopy: f.canCopy })),
      allNonEmptyCopy: nonEmpty.length > 0 && nonEmpty.every((f) => f.canCopy === true),
    },
    null,
    1,
  );
})();
