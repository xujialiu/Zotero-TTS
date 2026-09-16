(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const id = state.fixtures.pdf.id;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const readerOf = itemID => { const list = Zotero.Reader?._readers || []; for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID) return list[i]; return null; };
  const reader = readerOf(id);
  const doc = reader?._iframeWindow?.document;
  const frame = doc?.getElementById('ztts-player-frame');
  const child = frame?.contentWindow ? Components.utils.waiveXrays(frame.contentWindow) : null;
  if (!reader || !frame || !child) throw new Error('open player fixture is missing');
  const manager = () => reader._internalReader?._readAloudManager;
  const controller = () => manager()?._controller;
  const waitFor = async (test, ms = 9000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(100); } return test(); };
  const snap = () => { const m = manager(), c = controller(); return { active: !!m?.active, paused: !!m?.paused, tier: m?.selectedTier || null, language: m?.lang || null, region: m?.currentVoiceRegion || m?.region || null, voice: m?.selectedVoiceID || null, speed: Number(m?.speed) || null, volume: Zotero.Prefs.get('zotero-tts.readAloud.volume'), position: c?._position ?? null, timestamps: c?._currentTimestamps?.length ?? 0, bufferDuration: Number(c?._currentBuffer?.duration) || null, audio: c?._audioContext ? { state: c._audioContext.state, currentTime: c._audioContext.currentTime } : null }; };
  const voices = () => { const source = manager()?.voicesForLanguage || []; const rows = []; for (let i = 0; i < source.length; i++) { const v = source[i]; if (typeof v?.id === 'string') rows.push({ id: v.id, name: String(v.name || v.id), lang: v.lang || null }); } return rows; };
  const languages = () => { const source = manager()?.languages || []; const rows = []; for (let i = 0; i < source.length; i++) rows.push(String(source[i])); return rows; };
  const tiers = () => { const source = manager()?.tiers || []; const rows = []; try { for (const tier of source) rows.push(String(tier)); } catch (e) {} if (!rows.length && typeof source === 'string') rows.push(source); return rows; };
  const diagnostics = async () => { const raw = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer()); let open = null; for (let i = 0; i < (raw.readers || []).length; i++) if (raw.readers[i]?.open) open = raw.readers[i]; return { enabled: raw.enabled, layout: raw.layout, fixture: open?.state || null, providers: open?.state?.providers || [], locales: open?.state?.locales || [], voices: open?.state?.voices || [], favorites: open?.state?.favorites || [], error: open?.actionError || open?.state?.error || null }; };
  const send = async (action, value) => { if (typeof child.zttsCommand !== 'function') throw new Error('zttsCommand export missing'); child.zttsCommand(action, value); await sleep(500); };
  const initial = snap();
  // Keep the transport muted and stabilize the state with the real play button.
  if (initial.active && !initial.paused) { frame.contentDocument?.querySelector('.play')?.click(); await waitFor(() => !!manager()?.paused); }
  const paused = snap();
  const native = { tiers: tiers(), languages: languages(), voices: voices() };
  const before = await diagnostics();
  const uiRows = {};
  for (const key of ['provider', 'locale', 'voice']) {
    const button = frame.contentDocument?.querySelector(`[data-pick="${key}"]`);
    button?.click(); await sleep(100);
    const rows = []; const options = frame.contentDocument?.querySelectorAll('.option') || [];
    for (let i = 0; i < options.length; i++) rows.push(String(options[i].textContent || '').trim());
    uiRows[key] = { count: rows.length, first: rows.slice(0, 5), search: !!frame.contentDocument?.querySelector('input[type="search"]') };
    frame.contentDocument?.body?.dispatchEvent(new frame.contentWindow.Event('pointerdown', { bubbles: true }));
    await sleep(50);
  }
  const pickedProvider = before.providers.length ? before.providers[0].value : null;
  const currentVoice = initial.voice;
  let nextVoice = null;
  for (let i = 0; i < native.voices.length; i++) if (native.voices[i].id !== currentVoice && native.voices[i].id.startsWith('fish::')) { nextVoice = native.voices[i].id; break; }
  const actions = [];
  if (pickedProvider) { await send('provider', pickedProvider); actions.push({ action: 'provider', value: pickedProvider, state: snap() }); }
  if (before.locales.some(v => v.value === 'en-US')) { await send('locale', 'en-US'); actions.push({ action: 'locale', value: 'en-US', state: snap() }); }
  if (nextVoice) { await send('voice', nextVoice); await waitFor(() => snap().voice === nextVoice, 12000); actions.push({ action: 'voice', value: nextVoice, state: snap(), memory: Zotero.Prefs.get('zotero-tts.readAloud.memory') }); }
  await send('speed', 1.2); await waitFor(() => snap().speed === 1.2); const speed = { state: snap(), memory: Zotero.Prefs.get('zotero-tts.readAloud.memory'), voicesPref: Zotero.Prefs.get('reader.readAloudVoices') };
  await send('volume', 25); await sleep(200); const gain = JSON.parse(await Zotero.ZoteroTTS.diagnostics.volume()); const nonzero = { state: snap(), gain }; await send('volume', 0); const muted = { state: snap(), gain: JSON.parse(await Zotero.ZoteroTTS.diagnostics.volume()) };
  const pauseButton = frame.contentDocument?.querySelector('.play');
  if (!manager()?.paused) pauseButton?.click(); await waitFor(() => !!manager()?.paused); const pause = snap();
  pauseButton?.click(); await waitFor(() => !!manager()?.active && !manager()?.paused); const resume = snap();
  await sleep(500); const progression = { before: resume, after: snap() };
  state.controls = { initial, paused, native, before: { providers: before.providers, locales: before.locales, voices: before.voices, error: before.error }, uiRows, actions, speed, nonzero, muted, pause, resume, progression };
  return JSON.stringify(state.controls, null, 1);
})()
