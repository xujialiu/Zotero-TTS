return (() => {
  const id = Zotero.__ztts95Fixture?.itemID;
  const reader = (Zotero.Reader._readers || []).find(x => x?.itemID === id);
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  const controller = manager?._controller;
  const segment = manager?._segments?.[0];
  const active = Components.utils.waiveXrays(manager)?._activeSegment;
  const snapshot = value => {
    if (!value) return null;
    let position = null;
    let sourcePosition = null;
    try { position = value.position ? JSON.parse(JSON.stringify(value.position)) : null; } catch (e) { position = String(e); }
    try { sourcePosition = value.sourcePosition ? JSON.parse(JSON.stringify(value.sourcePosition)) : null; } catch (e) { sourcePosition = String(e); }
    return { keys: Object.keys(value), text: value.text ?? null, position, sourcePosition, same: value === segment };
  };
  return JSON.stringify({
    managerSegments: manager?._segments?.length ?? null,
    controllerSegments: controller?._segments?.length ?? null,
    segment: snapshot(segment),
    active: snapshot(active),
    controllerSegment: snapshot(controller?._segments?.[0]),
    activeSegmentText: manager?.activeSegment?.text ?? null,
    activeTimestamp: manager?.activeTimestamp ?? null,
  });
})()
