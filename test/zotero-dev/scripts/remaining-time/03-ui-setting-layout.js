(async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const params = run.params;
  const prefs = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 10000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = null;
      try { value = await test(); } catch (_) {}
      if (value) return value;
      await sleep(step);
    }
    try { return await test(); } catch (_) { return null; }
  };
  const readerOf = id => { for (const reader of Zotero.Reader?._readers || []) if (reader?.itemID === id) return reader; return null; };
  const fixture = state.fixtures?.epub;
  const reader = fixture ? readerOf(fixture.id) : null;
  if (!reader) throw new Error('EPUB reader from scope run is missing');
  const host = Zotero.getMainWindow();
  const hostBefore = state.isolation?.hostBefore || null;
  if (host?.windowState === 2 && host.restore) host.restore();
  host?.focus?.();
  try { Zotero_Tabs.select(reader.tabID); reader._window?.focus?.(); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (_) {}
  const doc = reader._iframeWindow?.document;
  const existingFrame = doc?.getElementById('ztts-player-frame');
  if (existingFrame?.hidden) doc?.getElementById('ztts-player-toggle')?.click();
  const frame = await waitFor(() => { const candidate = doc?.getElementById('ztts-player-frame'); return candidate && !candidate.hidden && candidate.contentDocument?.querySelector('.player') ? candidate : null; }, 15000);
  if (!frame) throw new Error('EPUB player frame is not open');
  const child = frame.contentWindow;
  const frameDoc = frame.contentDocument;
  const manager = reader._internalReader?._readAloudManager;
  const snapshot = () => {
    const root = frame.contentDocument?.querySelector('.player');
    const remaining = frame.contentDocument?.querySelector('.remaining-time');
    const frameRect = frame.getBoundingClientRect();
    const rootRect = root?.getBoundingClientRect();
    const rows = [];
    const lineNodes = remaining?.querySelectorAll('.remaining-line') || [];
    for (let i = 0; i < lineNodes.length; i++) {
      const line = lineNodes[i], name = line.querySelector('.remaining-name'), duration = line.querySelector('.remaining-duration');
      const lr = line.getBoundingClientRect(), nr = name?.getBoundingClientRect(), dr = duration?.getBoundingClientRect();
      rows.push({ text: String(line.textContent || ''), name: String(name?.textContent || ''), duration: String(duration?.textContent || ''), durationVisible: !!dr && dr.left >= lr.left - 1 && dr.right <= lr.right + 1 && dr.right <= (remaining?.getBoundingClientRect().right || lr.right) + 1, nameEllipsis: name ? getComputedStyle(name).textOverflow : null });
    }
    if (!rows.length && remaining) {
      const spans = remaining.querySelectorAll('span');
      for (let i = 0; i < spans.length; i++) rows.push({ text: String(spans[i].textContent || ''), name: String(spans[i].textContent || ''), duration: '', durationVisible: true, nameEllipsis: getComputedStyle(spans[i]).textOverflow });
    }
    const lines = rows.map(row => row.text);
    return {
      frame: { layout: frame.getAttribute('data-layout'), styleHeight: frame.style.height, styleWidth: frame.style.width, rect: { width: frameRect.width, height: frameRect.height } },
      root: root ? { className: root.className, rect: { width: rootRect.width, height: rootRect.height }, scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, scrollHeight: root.scrollHeight, clientHeight: root.clientHeight } : null,
      remaining: remaining ? { hidden: !!remaining.hidden, title: remaining.title, aria: remaining.getAttribute('aria-label'), lines, rows, durationVisible: rows.every(row => row.durationVisible), rect: (() => { const r = remaining.getBoundingClientRect(); return { width: r.width, height: r.height }; })(), scrollWidth: remaining.scrollWidth, clientWidth: remaining.clientWidth } : null,
      manager: { active: !!manager?.active, paused: !!manager?.paused, voice: manager?.selectedVoiceID || null },
    };
  };
  const out = { step: 'ui-setting-layout', before: snapshot(), settingToggle: {}, layouts: {}, widths: {}, longTitle: null };
  if (!out.before.remaining || out.before.remaining.hidden || !out.before.remaining.lines.length) throw new Error('remaining-time row was not visible before toggle');
  const prefKey = prefix + 'readAloud.remainingTime';

  // Exercise the actual pane checkbox while a paused session remains active.
  let prefWin = Services.wm.getMostRecentWindow('zotero:pref');
  if (prefWin) { try { prefWin.close(); } catch (_) {} await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 4000); }
  const opened = Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top'); if (opened?.then) await opened;
  prefWin = await waitFor(() => Services.wm.getMostRecentWindow('zotero:pref'), 8000);
  if (!prefWin) throw new Error('settings window did not open for toggle');
  try { await prefWin.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (_) {}
  const checkbox = await waitFor(() => prefWin.document.querySelector('.ztts-pane [data-l10n-id="ztts-remaining-time"]'), 10000);
  if (!checkbox) throw new Error('remaining-time checkbox missing for toggle');
  if (!checkbox.checked) checkbox.click();
  await waitFor(() => prefs.getBoolPref(prefKey) === true && checkbox.checked, 3000);
  checkbox.click();
  const off = await waitFor(() => prefs.getBoolPref(prefKey) === false && !!frame.contentDocument?.querySelector('.remaining-time')?.hidden, 5000);
  const offSnapshot = snapshot();
  checkbox.click();
  const on = await waitFor(() => prefs.getBoolPref(prefKey) === true && !frame.contentDocument?.querySelector('.remaining-time')?.hidden, 5000);
  const onSnapshot = snapshot();
  out.settingToggle = { off, on, offSnapshot, onSnapshot, activeStayed: offSnapshot.manager.active === out.before.manager.active, pausedStayed: offSnapshot.manager.paused === out.before.manager.paused, linesRestored: onSnapshot.remaining?.lines?.length === out.before.remaining.lines.length };
  try { prefWin.close(); } catch (_) {}
  await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 4000);
  if (!off || !on || !out.settingToggle.activeStayed || !out.settingToggle.pausedStayed || !out.settingToggle.linesRestored) throw new Error('setting toggle changed reading or did not restore row: ' + JSON.stringify(out.settingToggle));

  // Exercise an intentionally long section title through the live outline so
  // the displayed full text and tooltip can be checked without changing locale.
  const internal = reader._internalReader;
  const managerWaived = Components.utils.waiveXrays(manager);
  let originalOutline = null;
  try {
    const structure = Components.utils.waiveXrays(internal._sdt.structure);
    const outline = structure.catalog.outline;
    if (outline?.length && outline[0]) {
      originalOutline = outline;
      const altered = JSON.parse(JSON.stringify(outline));
      altered[0].title = 'Part 1 — a deliberately long section title for the tooltip and narrow panel check';
      structure.catalog.outline = Components.utils.cloneInto(altered, reader._iframeWindow);
      try { managerWaived.repositionTo(0); } catch (_) {}
      await sleep(250);
      if (manager.active && !manager.paused) manager.pause();
      await sleep(200);
    }
  } catch (_) {}
  const longSnapshot = snapshot();
  out.longTitle = { mutationApplied: !!originalOutline, titleLength: longSnapshot.remaining?.title?.length || 0, title: longSnapshot.remaining?.title || null, durationVisible: longSnapshot.remaining?.durationVisible, ellipsisStyle: frameDoc.defaultView?.getComputedStyle(frameDoc.querySelector('.remaining-time .remaining-name, .remaining-time span'))?.textOverflow || null };
  if (originalOutline) { try { Components.utils.waiveXrays(internal._sdt.structure).catalog.outline = originalOutline; } catch (_) {} }
  if (originalOutline && out.longTitle.durationVisible === false) throw new Error('long section title clips the visible duration: ' + JSON.stringify(out.longTitle));

  const setLayout = async layout => {
    const fn = Components.utils.waiveXrays(child).zttsSwitchLayout;
    if (typeof fn !== 'function') throw new Error('player layout export missing');
    fn(layout);
    const ok = await waitFor(() => frame.getAttribute('data-layout') === layout && frame.contentDocument?.querySelector('.player'), 5000);
    if (!ok) throw new Error('layout did not switch to ' + layout);
    await sleep(150);
  };
  const measure = (layout, stateName) => ({ layout, stateName, snapshot: snapshot(), options: !!frame.contentDocument?.querySelector('.options-toggle'), menus: !!frame.contentDocument?.querySelector('.layout-menu') });
  for (const layout of ['top', 'A', 'B']) {
    await setLayout(layout);
    if (layout === 'B') {
      const root = frame.contentDocument.querySelector('.player');
      const options = frame.contentDocument.querySelector('.options-toggle');
      if (!root.classList.contains('collapsed')) options.click();
      await sleep(150);
      out.layouts[layout + '-collapsed'] = measure(layout, 'collapsed');
      if (root.classList.contains('collapsed')) options.click();
      await sleep(150);
      out.layouts[layout + '-expanded'] = measure(layout, 'expanded');
      const move = Components.utils.waiveXrays(child).zttsMovePreview;
      const beforeRect = frame.getBoundingClientRect();
      if (typeof move === 'function') move(12, 8);
      await sleep(100);
      const movedRect = frame.getBoundingClientRect();
      if (typeof move === 'function') move(-12, -8);
      out.layouts[layout + '-drag'] = { moved: Math.abs(movedRect.left - beforeRect.left) > 1 || Math.abs(movedRect.top - beforeRect.top) > 1, before: { left: beforeRect.left, top: beforeRect.top }, after: { left: movedRect.left, top: movedRect.top } };
    } else {
      out.layouts[layout] = measure(layout, 'bar');
    }
  }
  const bars = [out.layouts.top.snapshot, out.layouts.A.snapshot];
  if (!bars.every(value => value.frame.rect.height === 34 && value.root?.rect.height === 34 && value.remaining?.durationVisible)) throw new Error('top/bottom bar height or duration visibility failed: ' + JSON.stringify(out.layouts));
  if (out.layouts['B-collapsed'].snapshot.frame.rect.height < 140 || out.layouts['B-expanded'].snapshot.frame.rect.height < 230) throw new Error('floating panel did not allocate the remaining-time row: ' + JSON.stringify(out.layouts));
  if (!out.layouts['B-drag'].moved) throw new Error('floating panel drag did not move frame');

  // Compare ordinary and narrow host widths, restoring the host bounds before
  // returning to the minimized bridge state.
  const normalWidth = host?.outerWidth || null;
  out.widths.normal = { hostWidth: normalWidth, player: snapshot() };
  let narrowPossible = false;
  try {
    if (host?.resizeTo && normalWidth) { host.resizeTo(Math.min(760, normalWidth), host.outerHeight); await sleep(500); narrowPossible = true; }
  } catch (_) {}
  out.widths.narrow = { hostWidth: host?.outerWidth || null, player: snapshot(), possible: narrowPossible };
  if (narrowPossible && (out.widths.narrow.player.remaining?.hidden || !out.widths.narrow.player.remaining?.durationVisible)) throw new Error('remaining-time row or duration disappeared at narrow width');
  try {
    if (hostBefore && host?.resizeTo) host.resizeTo(hostBefore.outerWidth, hostBefore.outerHeight);
    if (hostBefore && host?.moveTo) host.moveTo(hostBefore.screenX, hostBefore.screenY);
  } catch (_) {}
  if (host?.minimize) host.minimize(); else if (host) host.windowState = host.STATE_MINIMIZED;
  state.uiResults = out;
  return JSON.stringify(out, null, 1);
})()
