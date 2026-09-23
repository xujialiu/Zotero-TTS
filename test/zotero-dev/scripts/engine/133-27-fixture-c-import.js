// A third fixture, imported fresh: 133-18 through 133-26's repeated fault
// tests on fixture A (and the read-ahead window reaching 3 segments past
// wherever it was driven) left almost every segment of fixture A, and then
// of fixture B too, already resolved (good or permanently failed) under
// some earlier mode before the next fault test's own repositionTo ever
// touched it -- read-ahead is only ever 3 segments deep, but this run
// picked voices and drove positions so many times that it caught up with
// itself. A fresh item removes the question entirely: nothing has ever
// asked its fake voice for anything.
// params: fixturesDir. state: writes fixtures.C.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const path = PathUtils.join(Zotero.ZoteroTTSRun.params.fixturesDir, 'fixture-a.pdf');
  const item = await Zotero.Attachments.importFromFile({ file: path, libraryID: Zotero.Libraries.userLibraryID, title: 'ztts-133 2026-09-23 C (fault tests)' });
  const fixtureC = { itemID: item.id, key: item.key, title: item.getField('title') };
  S.fixtures.C = fixtureC;
  return JSON.stringify(fixtureC, null, 1);
})();
