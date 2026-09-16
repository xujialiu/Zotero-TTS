/** Throwaway reader UI: every playback control stays inside the mock page. */
export function createPlayerPrototype(deps: {
  uri: string;
  dead(value: unknown): boolean;
  error(error: unknown): void;
  exportResize(target: Window, callback: (height: number) => void): void;
}) {
  let layout = 'A';
  let enabled = true;
  let hideNative = true;
  const entries = new Map<Document, { frame: HTMLIFrameElement; slot: HTMLDivElement; style: HTMLStyleElement; listener: (event: MessageEvent) => void; resize: () => void; connect: () => void; cleanup: () => void }>();
  function syncAppearance(doc: Document): void {
    const entry = entries.get(doc);
    if (!entry || deps.dead(doc)) return;
    if (layout === 'A') {
      const rect = doc.querySelector('#split-view')?.getBoundingClientRect();
      if (rect) {
        entry.frame.style.left = rect.left + 'px';
        entry.frame.style.width = rect.width + 'px';
      }
      const css = doc.defaultView!.getComputedStyle(doc.documentElement);
      const root = entry.frame.contentDocument?.documentElement;
      const colors = {
        bg: css.getPropertyValue('--color-toolbar').trim() || '#fafafa',
        fg: css.getPropertyValue('--color-control').trim() || '#303137',
        border: css.getPropertyValue('--color-border').trim() || '#dedfe3',
        accent: css.getPropertyValue('--color-accent').trim() || '#356dc2',
      };
      for (const [name, value] of Object.entries(colors)) root?.style.setProperty('--preview-' + name, value);
    }
    positionToolbar(doc);
  }
  function positionToolbar(doc: Document): void {
    if (layout !== 'D') return;
    const frame = entries.get(doc)?.frame;
    const slot = entries.get(doc)?.slot;
    const toolbar = doc.querySelector('.toolbar');
    if (!frame || !toolbar || !slot) return;
    const slotRect = slot.getBoundingClientRect();
    frame.style.left = slotRect.left + 'px';
    frame.style.top = slotRect.top + 'px';
    frame.style.width = slotRect.width + 'px';

  }
  function paint(doc: Document): void {
    const entry = entries.get(doc)!;
    entry.frame.hidden = !enabled;
    entry.slot.hidden = !enabled || layout !== 'D';
    entry.style.textContent = enabled && hideNative ? '.read-aloud-popup, #read-aloud { display: none !important; }' : '';
    // Reserve real reader space for the two docked layouts; floating leaves it intact.
    if (enabled && layout === 'A') entry.style.textContent += '\n#split-view { bottom: 34px !important; }';
    if (enabled && layout === 'C') entry.style.textContent += '\n#split-view { right: 280px !important; }';
    if (enabled && layout === 'D') entry.style.textContent += `
      .toolbar { display: flex !important; gap: 12px !important; }
      .toolbar > .start { flex: 0 0 auto !important; width: max-content !important; min-width: max-content !important; }
      .toolbar #numPages { width: max-content !important; min-width: max-content !important; flex: 0 0 auto !important; }
      .toolbar #numPages > div { position: static !important; width: max-content !important; white-space: nowrap !important; }
      .toolbar > .center { position: static !important; transform: none !important; flex: 0 0 auto !important; margin-left: auto !important; }
      .toolbar > .end { flex: 0 0 auto !important; }
      #ztts-player-toolbar-slot { display: block; position: relative; flex: 1 1 620px; max-width: 620px; min-width: 0; height: 40px; }
    `;
    entry.frame.style.cssText = 'position:fixed;z-index:10000;border:0;background:transparent;color-scheme:light;';
    if (layout === 'A') entry.frame.style.cssText += 'left:0;bottom:0;width:100%;height:34px;';
    if (layout === 'B') entry.frame.style.cssText += 'right:28px;bottom:28px;width:min(530px,95vw);height:164px;';
    if (layout === 'C') entry.frame.style.cssText += 'right:0;top:41px;width:280px;height:calc(100% - 41px);';
    if (layout === 'D') {
      entry.frame.style.height = '40px';
      positionToolbar(doc);
    }
    const background = doc.defaultView?.getComputedStyle(doc.querySelector('.toolbar') ?? doc.body).backgroundColor ?? '';
    const channels = background.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [255, 255, 255];
    const dark = channels.reduce((a, b) => a + b, 0) < 384;
    entry.frame.setAttribute('src', deps.uri + '?embedded=1&variant=' + layout + (dark ? '&dark=1' : ''));
    syncAppearance(doc);
    entry.connect();
  }
  function attach(reader: any): void {
    try {
      for (const doc of entries.keys()) if (deps.dead(doc)) entries.delete(doc);
      const doc = reader?._iframeWindow?.document as Document | undefined;
      if (!doc?.body || entries.has(doc)) return;
      // Recover nodes left by an interrupted prototype hot-upgrade.
      for (const stale of doc.querySelectorAll('#ztts-player-prototype, #ztts-player-prototype-layout, #ztts-player-toolbar-slot')) stale.remove();
      const frame = doc.createElement('iframe');
      frame.id = 'ztts-player-prototype';
      frame.setAttribute('title', 'Zotero-TTS player (UI preview)');
      const style = doc.createElement('style');
      const slot = doc.createElement('div');
      slot.id = 'ztts-player-toolbar-slot';
      slot.hidden = true;
      doc.querySelector('.toolbar > .start')?.after(slot);
      style.id = 'ztts-player-prototype-layout';
      const listener = (event: MessageEvent) => {
        if (event.source !== frame.contentWindow || typeof event.data !== 'string') return;
        if (event.data === 'ztts-preview-ready') {
          if (frame.contentWindow) deps.exportResize(frame.contentWindow, resizeMenu);
          resize();
          return;
        }
        if (event.data.startsWith('ztts-preview-drag:') && layout === 'B') {
          const [dx, dy] = event.data.slice('ztts-preview-drag:'.length).split(',').map(Number);
          if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
          const box = frame.getBoundingClientRect();
          frame.style.left = Math.max(0, Math.min((doc.defaultView?.innerWidth ?? 0) - box.width, box.left + dx)) + 'px';
          frame.style.bottom = Math.max(0, Math.min((doc.defaultView?.innerHeight ?? 0) - 164, (doc.defaultView?.innerHeight ?? 0) - box.bottom - dy)) + 'px';
          frame.style.right = 'auto';
        }
      };
      const resize = () => { try { syncAppearance(doc); } catch (error) { deps.error(error); } };
      const win = doc.defaultView as any;
      const geometry = new win.ResizeObserver(resize);
      const split = doc.querySelector('#split-view');
      if (split) geometry.observe(split);
      geometry.observe(slot);
      const changes = new win.MutationObserver(resize);
      for (const node of [doc.documentElement, doc.body]) changes.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'data-color-scheme'] });
      const scheme = win.matchMedia('(prefers-color-scheme: dark)');
      scheme.addEventListener('change', resize);
      // Export a synchronous callback into the child, with no stale document retained.
      const resizeMenu = (value: number) => {
        const height = Number(value);
        if (layout !== 'C' && height >= 34 && height <= 500 && frame.style.height !== height + 'px') frame.style.height = height + 'px';
      };
      const loaded = () => {
        if (frame.contentWindow) deps.exportResize(frame.contentWindow, resizeMenu);
        resize();
      };
      let connectionTimer: ReturnType<typeof setTimeout> | undefined;
      const connect = () => {
        clearTimeout(connectionTimer);
        let attempts = 0;
        const tryConnect = () => {
          if (deps.dead(doc)) return;
          try {
            if (frame.contentDocument?.querySelector('.player')) { loaded(); return; }
            if (++attempts < 100) connectionTimer = setTimeout(tryConnect, 50);
            else deps.error(new Error('Zotero-TTS: player preview did not finish loading.'));
          } catch (error) { deps.error(error); }
        };
        connectionTimer = setTimeout(tryConnect, 50);
      };
      entries.set(doc, { frame, slot, style, listener, resize, connect, cleanup: () => {
        clearTimeout(connectionTimer);
        geometry.disconnect(); changes.disconnect(); scheme.removeEventListener('change', resize);
      } });
      doc.head.append(style);
      doc.body.append(frame);
      doc.defaultView?.addEventListener('message', listener);
      doc.defaultView?.addEventListener('resize', resize);
      paint(doc);
    } catch (error) { deps.error(error); }
  }
  function refresh(): void {
    for (const doc of entries.keys()) {
      if (deps.dead(doc)) { entries.delete(doc); continue; }
      try { paint(doc); } catch (error) { deps.error(error); }
    }
  }
  return {
    attach,
    setLayout(value: string) { if (['A', 'B', 'C', 'D'].includes(value)) { layout = value; refresh(); } },
    setEnabled(value: boolean) { enabled = value; refresh(); },
    setHideNative(value: boolean) { hideNative = value; refresh(); },
    initSettings(doc: Document) {
      const select = doc.getElementById('ztts-prototype-layout') as HTMLSelectElement | null;
      const toggle = doc.getElementById('ztts-prototype-enabled') as HTMLInputElement | null;
      const hide = doc.getElementById('ztts-prototype-hide') as HTMLInputElement | null;
      if (select) select.value = layout;
      if (toggle) toggle.checked = enabled;
      if (hide) hide.checked = hideNative;
    },
    dispose() {
      for (const [doc, entry] of entries) {
        if (deps.dead(doc)) continue;
        try { entry.cleanup(); doc.defaultView?.removeEventListener('message', entry.listener); doc.defaultView?.removeEventListener('resize', entry.resize); entry.frame.remove(); entry.slot.remove(); entry.style.remove(); }
        catch (error) { deps.error(error); }
      }
      entries.clear();
    },
  };
}
