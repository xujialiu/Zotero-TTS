// Item 2 (issue #130): "The plugin player shows them." The fixture's popup
// is already open+paused (01). diagnostics.pluginPlayer()'s readers array
// carries no itemID/title of its own; the fixture's entry is identified by
// entry.open === true -- the owner's own reader (read once at the very
// start of this run, see the report) has entry.open === false and stays
// untouched throughout, so exactly one entry should ever read open:true
// while the fixture's popup is open; asserts that uniqueness rather than
// assuming array order. Checks state.opened:true, providers equal to item
// 1's tiers with their labels (no Zotero Standard/Premium), provider one
// of them, voices.length > 0, error:null.
// Leaves the popup OPEN and PAUSED for item 3.
// params: none. state: reads fixtureItemID; writes nothing new.
(async () => {
  const out = { step: 'item2-plugin-player-shows' };
  const S = Zotero.ZoteroTTSRun.state;

  try {
    const itemID = S.fixtureItemID;
    if (!itemID) throw new Error('state.fixtureItemID is missing -- run 00-baseline-setup.js first');

    const pp = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
    const openOnes = pp.readers.filter((r) => r.open === true);
    out.totalReaders = pp.readers.length;
    out.openReadersCount = openOnes.length;
    if (openOnes.length !== 1) {
      throw new Error('cannot uniquely identify the fixture\'s pluginPlayer entry by open:true -- opens: ' + JSON.stringify(pp.readers.map((r) => r.open)));
    }
    const mine = openOnes[0];
    out.entry = mine;

    out.stateOpenedTrue = mine.state.opened === true;
    out.providers = mine.state.providers;
    out.providersHasNoZoteroTiers = !mine.state.providers.some((p) => p.value === 'standard' || p.value === 'premium');
    out.providersHasFish = mine.state.providers.some((p) => p.value === 'fish');

    // Cross-check against item 1's providerTiers() tiers/labels for the same reader.
    const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    const fixtureTitle = S.fixtureTitle;
    const ptMine = pt.readers.find((x) => x.title === fixtureTitle) || null;
    out.providerTiersTiers = ptMine ? ptMine.tiers : null;
    out.providersMatchTiers = ptMine
      ? JSON.stringify(mine.state.providers.map((p) => p.value).sort()) === JSON.stringify(ptMine.tiers.slice().sort())
      : null;
    out.providerLabelsMatch = ptMine
      ? mine.state.providers.every((p) => pt.labels && pt.labels[p.value] === p.label)
      : null;

    out.providerIsOneOfThem = mine.state.providers.some((p) => p.value === mine.state.provider);
    out.voicesLengthPositive = Array.isArray(mine.state.voices) && mine.state.voices.length > 0;
    out.errorNull = mine.state.error === null;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
