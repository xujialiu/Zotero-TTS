// Item 1: plants a leftover the way an earlier instance leaves one -- sets
// the fixture tab's manager's OWN loadVoices to a reader-realm function
// (Cu.exportFunction) that resolves without touching `this`, so it never
// fills the stage. Run this AFTER installing 1.14.3 in place (the tester's
// own zotero_plugin_install, outside this kit) and BEFORE reinstalling
// 1.14.3 again, so the second attach() picks up this fake as "the manager's
// own property" the way the pre-fix code reads it. The fake function
// object is kept in state.fakeLoadVoices (never returned/serialized) so
// item 3 can confirm by identity that it is gone after the fix's own
// clean detach.
// params: none. state: reads fixture; writes fakeLoadVoices, plantEvidence.
(async () => {
  const out = { step: 'item1-plant-leftover' };
  const S = Zotero.ZoteroTTSRun.state;
  try {
    const list = Zotero.Reader._readers || [];
    let reader = null;
    for (let i = 0; i < list.length; i++) if (list[i]?.itemID === S.fixture.id) reader = list[i];
    if (!reader) throw new Error('fixture reader not found');
    const manager = Components.utils.waiveXrays(reader._internalReader._readAloudManager);
    out.beforeOwnLoadVoices = Object.prototype.hasOwnProperty.call(manager, 'loadVoices');
    out.beforeSource = typeof manager.loadVoices === 'function' ? String(manager.loadVoices).slice(0, 80) : null;

    const fake = Components.utils.exportFunction(function (asked) {
      // Resolves without touching `this` (the stage): stage._allVoices
      // stays undefined, reproducing "can't access property length, list
      // is undefined" the next time load() reads list.length.
      return Promise.resolve();
    }, manager);
    manager.loadVoices = fake;
    // exportFunction's OWN return value re-wraps differently than a later
    // property READ of the same slot (probed live 2026-09-25: comparing
    // the two, even immediately after assignment, is already !==) -- so
    // the identity check kept for item 3 is captured by READING the
    // property back, never the exportFunction return value.
    const plantedAsRead = manager.loadVoices;
    S.fakeLoadVoicesAsRead = plantedAsRead;
    S.fakeLoadVoicesSelfConsistent = plantedAsRead === manager.loadVoices;

    out.afterOwnLoadVoices = Object.prototype.hasOwnProperty.call(manager, 'loadVoices');
    out.plantedIsCurrentOwn = manager.loadVoices === plantedAsRead;
    out.plantedTypeof = typeof fake;
    out.managerActive = !!manager.active;
    out.managerPaused = !!manager.paused;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
