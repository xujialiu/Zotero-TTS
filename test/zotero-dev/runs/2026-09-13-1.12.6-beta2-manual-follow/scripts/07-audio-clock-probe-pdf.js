return (async () => {
  const root = Zotero.__ztts100;
  const reader = root?.pdf?.reader;
  const manager = reader?._internalReader?._readAloudManager;
  const rw = reader?._iframeWindow;
  if (!reader || !manager || !rw) throw new Error('PDF playback probe state is missing');
  try { Zotero_Tabs.select(reader.tabID); reader.focus?.(); rw.focus?.(); } catch (e) {}
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  const K = rw.KeyboardEvent;
  const ev = (key, code, keyCode) => new K('', { key, code, keyCode, bubbles: true, cancelable: true });
  tip.beginInputTransactionForTests(rw);
  const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(' ', 'Space', 32)), tip.keyup(ev(' ', 'Space', 32)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
  const samples = [];
  for (let i = 0; i < 8; i++) {
    const controller = manager._controller;
    samples.push({ t: i * 250, active: !!manager.active, paused: !!manager.paused, position: controller?._position ?? null, context: controller?._audioContext?.state ?? null, time: controller?._audioContext?.currentTime ?? null, source: !!controller?._sourceNode });
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  let pauseError = null;
  try { if (manager.active && !manager.paused) manager.pause(); } catch (e) { pauseError = String(e); }
  return JSON.stringify({ ret, pauseError, samples: { first: samples[0], last: samples.at(-1), count: samples.length }, clockMoved: (samples.at(-1)?.time ?? 0) > (samples[0]?.time ?? 0) + 0.05 });
})()
