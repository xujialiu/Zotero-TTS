return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, params = run.params || {};
  const fixtureDir = String(params.fixturesDir || '').replace(/\//g, '\\');
  if (!fixtureDir) throw new Error('fixturesDir is missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async (test, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { const value = test(); if (value) return value; await sleep(100); } return test(); };
  const slots = {
    pdf: { title: 'Zotero-TTS issue 118 PDF ' + Date.now(), itemID: null, key: null },
    epub: { title: 'Zotero-TTS issue 118 EPUB ' + Date.now(), itemID: null, key: null },
  };
  const files = { pdf: PathUtils.join(fixtureDir, 'fixture-a.pdf'), epub: PathUtils.join(fixtureDir, 'return-key', 'return-key.epub') };
  for (const kind of ['pdf', 'epub']) {
    const imported = await Zotero.Attachments.importFromFile({ file: files[kind], libraryID: Zotero.Libraries.userLibraryID, title: slots[kind].title });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error(kind + ' import returned no item');
    slots[kind].itemID = item.id; slots[kind].key = item.key;
  }
  const reader = slot => { for (const r of Zotero.Reader?._readers || []) try { if (r?.itemID === slot?.itemID) return r; } catch (e) {} return null; };
  const internal = slot => reader(slot)?._internalReader || null;
  const manager = slot => internal(slot)?._readAloudManager || null;
  const view = slot => internal(slot)?._primaryView || null;
  const frame = slot => reader(slot)?._iframeWindow?.document?.getElementById('ztts-player-frame') || null;
  const select = slot => { const r = reader(slot); if (!r) return null; try { Zotero_Tabs.select(r.tabID); } catch (e) {} try { r.focus?.(); } catch (e) {} try { view(slot)?._iframeWindow?.focus?.(); } catch (e) {} return r; };
  const readiness = slot => {
    const r = reader(slot), v = view(slot), iframe = v?._iframeWindow || v?.iframeWindow, doc = iframe?.document || v?.iframeDocument;
    const host = r?._window;
    return { selected: !!r && globalThis.Zotero_Tabs?.selectedID === r.tabID, windowState: host?.windowState ?? null,
      suspended: v?._suspended ?? false, iframeHidden: doc?.hidden ?? null, internal: !!internal(slot), manager: !!manager(slot) };
  };
  const open = async (kind) => {
    const slot = slots[kind]; let r = reader(slot);
    if (!r) { const pending = Zotero.Reader.open(slot.itemID, null, { openInBackground: false, allowDuplicate: false }); if (pending?.then) await pending; }
    r = await wait(() => reader(slot)?._internalReader?._readAloudManager ? reader(slot) : null);
    if (!r) throw new Error(kind + ' reader did not expose internal manager');
    select(slot);
    const ready = await wait(() => { const value = readiness(slot); return value.selected && value.windowState !== 2 && value.suspended !== true && value.iframeHidden === false ? value : null; }, 20000);
    if (!ready) throw new Error(kind + ' selected iframe was not ready/visible: ' + JSON.stringify(readiness(slot)));
    await wait(() => frame(slot)?.querySelector?.('.player') || frame(slot)?.contentDocument?.querySelector?.('.player'), 12000);
    return { itemID: slot.itemID, tabID: r.tabID, ready };
  };
  state.fixtures = slots;
  const opened = { pdf: await open('pdf'), epub: await open('epub') };
  const firstManager = manager(slots.pdf);
  let memory = null; try { memory = JSON.parse(Services.prefs.getStringPref('extensions.zotero.zotero-tts.readAloud.memory')).voice?.id || null; } catch (e) {}
  state.safeToOpen = typeof memory === 'string' && memory.includes('::');
  if (!state.safeToOpen) throw new Error('readAloud.memory does not name a configured plugin voice; refusing metered fallback');
  const h = { sleep, wait, reader, internal, manager, view, frame, select, readiness };
  h.child = slot => { const f = frame(slot); return f?.contentWindow ? Components.utils.waiveXrays(f.contentWindow) : null; };
  h.doc = slot => { const r = reader(slot); return r?._iframeWindow?.document || null; };
  h.index = slot => { const r = reader(slot), list = Zotero.Reader?._readers || []; for (let i = 0; i < list.length; i++) if (list[i] === r) return i; return -1; };
  h.diag = (slot, name = 'autoScroll') => { try { const all = JSON.parse(Zotero.ZoteroTTS.diagnostics[name]()), i = h.index(slot); return i >= 0 ? all[i] || null : null; } catch (e) { return { error: String(e) }; } };
  h.source = slot => { const m = manager(slot), v = view(slot); let s = null; try { s = Components.utils.waiveXrays(v?._readAloudState?.activeSegment); } catch (e) {} if (!s) s = m?._activeSegment; try { return s?.sourcePosition ? JSON.parse(JSON.stringify(s.sourcePosition)) : null; } catch (e) { return null; } };
  h.setSegment = async (slot, index) => { const m = manager(slot), c = m?._controller; if (!m?._segments?.[index] || !c) throw new Error('segment ' + index + ' is unavailable'); m._activeSegment = m._segments[index]; c._position = index; m._stateChanged?.(); await sleep(220); return index; };
  h.snap = (slot, label) => { const m = manager(slot), c = m?._controller, f = frame(slot), child = h.child(slot), mode = child?.document?.querySelector?.('.mode'); const d = h.diag(slot); return { label, at: Date.now(), position: Number.isFinite(c?._position) ? c._position : null, active: !!m?.active, paused: !!m?.paused, voice: m?.selectedVoiceID || null, speed: Number(m?.speed) || null, mode: mode?.textContent || null, pressed: mode?.getAttribute?.('aria-pressed') || null, following: d?.following ?? null, source: h.source(slot), audio: c?._audioContext ? { state: c._audioContext.state, currentTime: c._audioContext.currentTime } : null, frame: !!f }; };
  state.helpers = h;
  return JSON.stringify({ fixtureDirChars: fixtureDir.length, opened, safeToOpen: state.safeToOpen,
    memoryVoiceChars: memory?.length || 0, managers: { pdf: !!firstManager, epub: !!manager(slots.epub) }, readiness: { pdf: readiness(slots.pdf), epub: readiness(slots.epub) } }, null, 1);
})()
