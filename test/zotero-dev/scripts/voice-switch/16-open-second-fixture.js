return (async () => {
  const state = Zotero.__ztts95NativeState;
  const itemID = Zotero.__ztts95FixtureB?.itemID;
  if (!state?.nativeStub || !itemID) throw new Error('second fixture transport is missing');
  let reader = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
  if (!reader) Zotero.Reader.open(itemID);
  for (let i = 0; i < 60; i++) {
    reader = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
    if (reader?._internalReader?._readAloudManager) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  if (!reader || !manager) throw new Error('second fixture manager is missing');
  state.readerWindow = reader._iframeWindow;
  const options = Components.utils.waiveXrays(manager._options);
  const internalWaived = Components.utils.waiveXrays(internal);
  state.secondOriginalRemoteInterface = options.remoteInterface;
  state.secondOriginalInternalRemoteInterface = internalWaived._readAloudRemoteInterface;
  const cloned = Components.utils.cloneInto(state.nativeStub, reader._iframeWindow, { cloneFunctions: true });
  options.remoteInterface = cloned;
  internalWaived._readAloudRemoteInterface = cloned;
  try { internalWaived._state.readAloudState.savedPosition = null; } catch (e) {}
  let toggleError = null;
  try { internal.toggleReadAloudPopup(true); } catch (e) { toggleError = String(e); }
  for (let i = 0; i < 60 && (!manager._allVoices?.length || !manager._segments?.length); i++) await new Promise(resolve => setTimeout(resolve, 100));
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
  const mw = Components.utils.waiveXrays(manager);
  mw._activeSegment = null; mw._activeTimestampIndex = null; mw._backwardStopIndex = 0; mw._paused = true;
  try { manager._createController(); } catch (e) {}
  return JSON.stringify({
    toggleError,
    readerIndex: (Zotero.Reader._readers || []).indexOf(reader),
    manager: {
      active: !!manager.active,
      paused: !!manager.paused,
      selected: manager.selectedVoiceID ?? null,
      tier: manager._selectedTier ?? null,
      voices: manager._allVoices?.length ?? null,
      menu: manager.voicesForLanguage?.length ?? null,
      segments: manager._segments?.length ?? null,
    },
    calls: state.calls.filter(c => c.voiceID === 'native95-a').map(c => ({ kind: c.kind, text: c.text })).slice(-10),
  }, null, 1);
})()
