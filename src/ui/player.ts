import { floatingMenuPlacement } from './player-menu';
import { BAR_HEIGHT, barBand, coveredEdges, type Band, type Covered } from './player-cover';
import type { PlayerSnapshot } from '../read-aloud/player-controller';
import { PREF_PREFIX, playerLayout, setPlayerLayout, type PrefsBackend } from '../core/settings';

/** Gecko can detach defaultView without marking the document wrapper dead. */
export function isPlayerDocumentLive(doc: { readonly defaultView?: { closed?: boolean } | null } | null, dead: (value: unknown) => boolean): boolean {
  try { return !!doc && !dead(doc) && !!doc.defaultView && !dead(doc.defaultView) && !doc.defaultView.closed; }
  catch { return false; }
}

/** Own player UI, driven by a narrow adapter to the reader engine. */
export function createPluginPlayer(deps: {
  uri: string;
  iconURI: string;
  dead(value: unknown): boolean;
  error(error: unknown): void;
  exportResize(target: Window, callback: (height: number) => void): void;
  exportFloating(target: Window, move: (dx: number, dy: number) => void): void;
  exportMenu(target: Window, place: (json: string) => string): void;
  exportLayout(target: Window, change: (layout: string) => void): void;
  renderLayout(target: Window, layout: string): boolean;
  prefs: PrefsBackend;
  snapshot(reader: any): PlayerSnapshot;
  command(reader: any, action: string, value?: unknown): Promise<void>;
  exportCommand(target: Window, command: (action: string, value?: unknown) => void): void;
  update(target: Window, json: string): boolean;
  strings(): Record<string, string>;
  watchSettings(changed: () => void): () => void;
  notice(reader: any, message: string): void;
  listenKeys(reader: any, target: Window): () => void;
}) {
  deps.prefs.setDefault?.(PREF_PREFIX + 'readAloud.playerLayout', 'top');
  const readLayout = () => playerLayout(deps.prefs);
  const panelHeight = (expanded: boolean) => expanded ? 202 : 108;
  let layout = readLayout();
  let enabled = deps.prefs.get(PREF_PREFIX + 'readAloud.usePluginPlayer') !== false;
  const live = (doc: Document) => isPlayerDocumentLive(doc, deps.dead);
  const settingsDocuments = new Set<Document>();
  function updateSettingsLayout(doc: Document): void {
    const select = doc.getElementById('ztts-player-layout') as HTMLSelectElement | null;
    if (select) select.value = layout;
    const label = doc.getElementById('ztts-player-layout-label');
    if (label) {
      label.textContent = select?.selectedOptions[0]?.textContent ?? '';
      label.setAttribute('data-l10n-id', 'ztts-player-' + ({ A: 'bottom', B: 'floating', top: 'top' }[layout]));
    }
    for (const option of doc.querySelectorAll('#ztts-player-layout-menu [data-value]')) {
      const selected = option.getAttribute('data-value') === layout;
      option.setAttribute('aria-checked', String(selected));
      option.toggleAttribute('autofocus', selected);
    }
  }
  function changeLayout(value: string): void {
    if (value !== 'A' && value !== 'B' && value !== 'top') return;
    setPlayerLayout(deps.prefs, value);
    layout = value;
    refresh();
    for (const doc of settingsDocuments) {
      if (!live(doc)) { settingsDocuments.delete(doc); continue; }
      updateSettingsLayout(doc);
    }
  }
  const entries = new Map<Document, { frame: HTMLIFrameElement; style: HTMLStyleElement; button: HTMLButtonElement; open: boolean; reader: any; nativeOpened: boolean; lastSnapshot: string; actionError: string | null; openedAt: number; moved: boolean; expanded: boolean; menuInset: number; listener: (event: MessageEvent) => void; resize: () => void; connect: () => void; cleanup: () => void }>();
  function syncAppearance(doc: Document): void {
    const entry = entries.get(doc);
    if (!entry || !live(doc)) return;
    if (layout === 'A' || layout === 'top') {
      const rect = doc.querySelector('#split-view')?.getBoundingClientRect();
      if (rect) {
        entry.frame.style.left = rect.left + 'px';
        entry.frame.style.width = rect.width + 'px';
      }
    }
    {
      const css = doc.defaultView!.getComputedStyle(doc.documentElement);
      const native = doc.querySelector('.read-aloud-popup');
      const nativeCSS = native ? doc.defaultView!.getComputedStyle(native) : null;
      const trigger = native?.querySelector('.custom-select-trigger');
      const triggerCSS = trigger ? doc.defaultView!.getComputedStyle(trigger) : null;
      const root = entry.frame.contentDocument?.documentElement;
      const colors = {
        bg: nativeCSS?.backgroundColor || css.getPropertyValue('--color-toolbar').trim() || '#fafafa',
        fg: nativeCSS?.color || css.getPropertyValue('--fill-primary').trim() || '#303137',
        border: css.getPropertyValue('--color-border').trim() || '#dedfe3',
        accent: css.getPropertyValue('--color-accent').trim() || '#356dc2',
        'font-family': nativeCSS?.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
        'font-size': nativeCSS?.fontSize || '13px',
        'control-bg': triggerCSS?.backgroundColor || css.getPropertyValue('--color-background').trim() || '#ffffff',
        'control-border': triggerCSS?.borderColor || css.getPropertyValue('--color-border').trim() || '#dedfe3',
        icon: css.getPropertyValue('--fill-secondary').trim() || nativeCSS?.color || '#777777',
      };
      for (const [name, value] of Object.entries(colors)) root?.style.setProperty('--preview-' + name, value);
    }
    if (layout === 'B' && !entry.moved) {
      const split = doc.querySelector('#split-view')?.getBoundingClientRect();
      const top = (doc.querySelector('.toolbar')?.getBoundingClientRect().bottom ?? 41) + 10;
      entry.frame.style.left = Math.max(0, Math.min((split?.left ?? 0) + 10, (doc.defaultView?.innerWidth ?? 300) - 300)) + 'px';
      entry.frame.style.top = (top - entry.menuInset) + 'px';
    }
    if (layout === 'top') {
      const toolbarBottom = doc.querySelector('.toolbar')?.getBoundingClientRect().bottom ?? 41;
      entry.frame.style.top = toolbarBottom + 'px';
    }
  }
  function paint(doc: Document): void {
    if (!live(doc)) return;
    const entry = entries.get(doc)!;
    entry.moved = false; entry.menuInset = 0;
    const visible = enabled && entry.open;
    entry.frame.hidden = !visible;
    entry.button.hidden = !enabled;
    entry.button.classList.toggle('active', visible);
    entry.button.setAttribute('aria-expanded', String(visible));
    entry.style.textContent = '#ztts-player-toggle[hidden], #ztts-player-frame[hidden] { display: none !important; }';
    if (enabled) entry.style.textContent += '\n.read-aloud-popup, #read-aloud { display: none !important; }';
    // The bars lie over the document's edge (#135): a resized document area
    // re-lays the document out, and Zotero blurs an EPUB while it does. Only
    // Zotero's find bar, 15 px below the top of the view it opens in, is moved
    // out from under the Top bar; side by side, both views reach the top.
    if (visible && layout === 'top') {
      entry.style.textContent += '\n.split-view .primary-view .find-popup, body.enable-vertical-split-view .split-view .secondary-view .find-popup { margin-top: ' + BAR_HEIGHT + 'px !important; }';
    }
    entry.frame.style.cssText = 'position:fixed;z-index:10000;border:0;background:transparent;color-scheme:light;';
    if (layout === 'A') entry.frame.style.cssText += 'left:0;bottom:0;width:100%;height:34px;';
    if (layout === 'B') entry.frame.style.cssText += 'left:10px;top:51px;width:min(300px,95vw);height:' + panelHeight(entry.expanded) + 'px;';
    if (layout === 'top') entry.frame.style.cssText += 'left:0;top:41px;width:100%;height:34px;';
    const background = doc.defaultView?.getComputedStyle(doc.querySelector('.toolbar') ?? doc.body).backgroundColor ?? '';
    const channels = background.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [255, 255, 255];
    const dark = channels.reduce((a, b) => a + b, 0) < 384;
    entry.frame.setAttribute('data-layout', layout);
    if (!entry.frame.contentWindow || !deps.renderLayout(entry.frame.contentWindow, layout)) {
      entry.frame.setAttribute('src', deps.uri + '?embedded=1&variant=' + layout + (dark ? '&dark=1' : ''));
    }
    syncAppearance(doc);
    entry.connect();
  }
  function attach(reader: any): void {
    try {
      for (const doc of entries.keys()) if (!live(doc)) detach(doc);
      const doc = reader?._iframeWindow?.document as Document | undefined;
      if (!doc?.body || !live(doc)) return;
      if (entries.has(doc)) { entries.get(doc)!.connect(); return; }
      // Recover nodes left by an interrupted prototype hot-upgrade.
      for (const stale of doc.querySelectorAll('#ztts-player-prototype, #ztts-player-prototype-layout, #ztts-player-toolbar-slot, #ztts-player-frame, #ztts-player-style, #ztts-player-toggle')) stale.remove();
      const button = doc.createElement('button');
      button.id = 'ztts-player-toggle';
      button.className = 'toolbar-button';
      button.type = 'button';
      button.title = 'Zotero-TTS';
      button.setAttribute('aria-label', 'Zotero-TTS');
      button.setAttribute('aria-controls', 'ztts-player-frame');
      const icon = doc.createElement('img');
      icon.src = deps.iconURI;
      icon.alt = '';
      icon.width = 20;
      icon.height = 20;
      button.append(icon);
      doc.querySelector('#read-aloud')?.before(button);
      const frame = doc.createElement('iframe');
      frame.id = 'ztts-player-frame';
      frame.setAttribute('title', 'Zotero-TTS');
      const style = doc.createElement('style');
      style.id = 'ztts-player-style';
      const listener = (event: MessageEvent) => {
        if (event.source !== frame.contentWindow || typeof event.data !== 'string') return;
        if (event.data === 'ztts-preview-ready') {
          if (frame.contentWindow) deps.exportResize(frame.contentWindow, resizeMenu);
          resize();
          return;
        }
      };
      const resize = () => {
        try {
          syncAppearance(doc);
          const entry = entries.get(doc);
          // Host resize can change available menu space without resizing the child.
          if (entry && layout === 'B') { entry.lastSnapshot = ''; publish(doc); }
        } catch (error) { deps.error(error); }
      };
      const win = doc.defaultView as any;
      const geometry = new win.ResizeObserver(resize);
      const split = doc.querySelector('#split-view');
      if (split) geometry.observe(split);
      const toolbar = doc.querySelector('.toolbar');
      if (toolbar) geometry.observe(toolbar);
      const changes = new win.MutationObserver(resize);
      for (const node of [doc.documentElement, doc.body]) changes.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'data-color-scheme'] });
      const scheme = win.matchMedia('(prefers-color-scheme: dark)');
      scheme.addEventListener('change', resize);
      // Export a synchronous callback into the child, with no stale document retained.
      const resizeMenu = (value: number) => {
        const height = Number(value);
        if (!(height >= 34 && height <= 500)) return;
        const entry = entries.get(doc);
        if (layout === 'B' && entry?.menuInset) {
          frame.style.top = (frame.getBoundingClientRect().top + entry.menuInset) + 'px';
          entry.menuInset = 0;
          const player = frame.contentDocument?.querySelector('.player') as HTMLElement | null;
          if (player) player.style.top = '0px';
        }
        if (frame.style.height !== height + 'px') frame.style.height = height + 'px';
      };
      let unlistenKeys: (() => void) | null = null;
      const loaded = () => {
        if (frame.contentWindow) {
          deps.exportResize(frame.contentWindow, resizeMenu);
          deps.exportMenu(frame.contentWindow, json => {
            const entry = entries.get(doc);
            if (!entry || layout !== 'B' || !live(doc)) return '';
            const request = JSON.parse(json);
            const box = frame.getBoundingClientRect();
            const placement = floatingMenuPlacement({
              panelTop: box.top + entry.menuInset, panelHeight: panelHeight(entry.expanded),
              anchorTop: box.top + Number(request.top), anchorBottom: box.top + Number(request.bottom),
              menuHeight: Number(request.height), viewportHeight: win.innerHeight,
            });
            entry.menuInset = placement.panelInset;
            const player = frame.contentDocument?.querySelector('.player') as HTMLElement | null;
            if (player) player.style.top = placement.panelInset + 'px';
            if (box.top !== placement.frameTop) frame.style.top = placement.frameTop + 'px';
            if (box.height !== placement.frameHeight) frame.style.height = placement.frameHeight + 'px';
            return JSON.stringify({ top: placement.menuTop - placement.frameTop, height: placement.menuHeight, side: placement.side });
          });
          deps.exportFloating(frame.contentWindow, (dx, dy) => {
            if (layout !== 'B' || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
            const box = frame.getBoundingClientRect();
            entries.get(doc)!.moved = true;
            frame.style.left = Math.max(0, Math.min(win.innerWidth - box.width, box.left + dx)) + 'px';
            frame.style.top = Math.max(0, Math.min(win.innerHeight - panelHeight(entries.get(doc)!.expanded), box.top + dy)) + 'px';
          });
          deps.exportLayout(frame.contentWindow, changeLayout);
          unlistenKeys?.();
          unlistenKeys = deps.listenKeys(reader, frame.contentWindow);
          deps.exportCommand(frame.contentWindow, (action, value) => { void act(doc, action, value); });
          const entry = entries.get(doc)!;
          entry.lastSnapshot = '';
          publish(doc);
        }
        resize();
      };
      let connectionTimer: ReturnType<typeof setTimeout> | undefined;
      const connect = () => {
        clearTimeout(connectionTimer);
        let attempts = 0;
        const tryConnect = () => {
          if (!live(doc)) { detach(doc); return; }
          try {
            if (frame.contentDocument?.querySelector('.player')) { loaded(); return; }
            if (++attempts < 100) connectionTimer = setTimeout(tryConnect, 50);
            else deps.error(new Error('Zotero-TTS: player did not finish loading.'));
          } catch (error) { deps.error(error); }
        };
        connectionTimer = setTimeout(tryConnect, 50);
      };
      const toggle = (event: Event) => {
        event.stopPropagation();
        if (!enabled) return;
        const entry = entries.get(doc)!;
        if (!entry.open) entry.expanded = deps.snapshot(reader).expandOnOpen;
        entry.open = !entry.open;
        entry.openedAt = entry.open ? Date.now() : 0;
        paint(doc);
        void act(doc, entry.open ? 'open' : 'close');
      };
      button.addEventListener('click', toggle);
      entries.set(doc, { frame, style, button, open: false, reader, nativeOpened: deps.snapshot(reader).opened, lastSnapshot: '', actionError: null, openedAt: 0, moved: false, expanded: deps.snapshot(reader).expandOnOpen, menuInset: 0, listener, resize, connect, cleanup: () => {
        clearTimeout(connectionTimer);
        for (const cleanup of [() => unlistenKeys?.(), () => button.removeEventListener('click', toggle),
          () => geometry.disconnect(), () => changes.disconnect(), () => scheme.removeEventListener('change', resize)]) {
          try { cleanup(); } catch (error) { if (live(doc)) deps.error(error); }
        }
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
      if (!live(doc)) { detach(doc); continue; }
      try { paint(doc); } catch (error) { deps.error(error); }
    }
  }
  async function act(doc: Document, action: string, value?: unknown): Promise<void> {
    const entry = entries.get(doc);
    if (!entry || !enabled || !live(doc)) return;
    entry.actionError = null;
    if (action === 'options') { if (layout === 'B') { entry.expanded = !entry.expanded; publish(doc); } return; }
    try { await deps.command(entry.reader, action, value); }
    catch (error) { if (!live(doc)) return; entry.actionError = error instanceof Error ? error.message : String(error); deps.notice(entry.reader, entry.actionError); deps.error(error); }
    if (live(doc)) publish(doc);
  }
  function publish(doc: Document): void {
    const entry = entries.get(doc);
    if (!entry || !live(doc)) return;
    const state = deps.snapshot(entry.reader);
    if (state.opened !== entry.nativeOpened) {
      entry.nativeOpened = state.opened;
      if (enabled && entry.open !== state.opened) { if (state.opened) entry.expanded = state.expandOnOpen; entry.open = state.opened; entry.openedAt = state.opened ? Date.now() : 0; paint(doc); }
    }
    const json = JSON.stringify({ ...state, expanded: entry.expanded, error: entry.actionError ?? state.error,
      loading: entry.open && !state.voices.length && Date.now() - entry.openedAt < 15000,
      strings: deps.strings() });
    if (json !== entry.lastSnapshot && entry.frame.contentWindow && deps.update(entry.frame.contentWindow, json)) entry.lastSnapshot = json;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  function tick(): void {
    if (disposed) return;
    for (const [doc, entry] of entries) {
      if (!live(doc)) { detach(doc); continue; }
      try { publish(doc); } catch (error) { deps.error(error); }
    }
    timer = setTimeout(tick, 250);
  }
  timer = setTimeout(tick, 250);
  const unwatch = deps.watchSettings(() => {
    const nextLayout = readLayout(), nextEnabled = deps.prefs.get(PREF_PREFIX + 'readAloud.usePluginPlayer') !== false;
    if (nextLayout !== layout || nextEnabled !== enabled) { layout = nextLayout; enabled = nextEnabled; refresh(); }
    for (const doc of settingsDocuments) {
      if (!live(doc)) { settingsDocuments.delete(doc); continue; }
      updateSettingsLayout(doc);
      const toggle = doc.getElementById('ztts-player-enabled') as HTMLInputElement | null;
      if (toggle) toggle.checked = enabled;
    }
  });
  function detach(doc: Document): void {
    const entry = entries.get(doc);
    if (!entry) return;
    entries.delete(doc);
    const report = live(doc);
    for (const cleanup of [entry.cleanup,
      () => doc.defaultView?.removeEventListener('message', entry.listener),
      () => doc.defaultView?.removeEventListener('resize', entry.resize),
      () => entry.button.remove(), () => entry.frame.remove(), () => entry.style.remove()]) {
      try { cleanup(); } catch (error) { if (report) deps.error(error); }
    }
  }
  return {
    attach,
    inspect() {
      return { enabled, layout, resource: deps.uri, readers: [...entries].filter(([doc]) => live(doc)).map(([doc, entry]) => ({
        open: entry.open, expanded: entry.expanded, menuInset: entry.menuInset, ready: !!entry.frame.contentDocument?.querySelector('.player'),
        frames: doc.querySelectorAll('#ztts-player-frame').length, actionError: entry.actionError,
        state: deps.snapshot(entry.reader),
      })) };
    },
    isOpen(reader: unknown): boolean {
      if (!enabled) return false;
      for (const [doc, entry] of entries) {
        if (entry.reader === reader && live(doc)) return entry.open;
      }
      return false;
    },
    /** How much of a box a docked bar lies over, in the document that holds `frame`, a view's iframe (#135). */
    covered(frame: unknown, box: Band): Covered {
      try {
        // By id, not through `entries`: the follow reaches the document behind a waived wrapper, which a key from our side misses
        const bar = (frame as Element | null)?.ownerDocument?.getElementById('ztts-player-frame') as HTMLIFrameElement | null;
        if (enabled && bar && !bar.hidden) return coveredEdges(barBand(layout, bar.getBoundingClientRect()), box);
      } catch { /* a closed tab's document */ }
      return { top: 0, bottom: 0 };
    },
    setLayout: changeLayout,
    setEnabled(value: boolean) {
      enabled = value;
      for (const entry of entries.values()) entry.open = false;
      deps.prefs.set(PREF_PREFIX + 'readAloud.usePluginPlayer', value);
      refresh();
    },
    prepareSettingsMenu(doc: Document) {
      if (!live(doc)) return;
      const button = doc.getElementById('ztts-player-layout-trigger')!;
      const menu = doc.getElementById('ztts-player-layout-menu')!;
      updateSettingsLayout(doc);
      const rect = button.getBoundingClientRect();
      menu.style.left = rect.left + 'px';
      menu.style.top = rect.bottom + 4 + 'px';
      menu.style.minWidth = rect.width + 'px';
    },
    initSettings(doc: Document) {
      for (const held of settingsDocuments) if (!live(held)) settingsDocuments.delete(held);
      settingsDocuments.add(doc);
      const select = doc.getElementById('ztts-player-layout') as HTMLSelectElement | null;
      const toggle = doc.getElementById('ztts-player-enabled') as HTMLInputElement | null;
      if (select) select.value = layout;
      updateSettingsLayout(doc);
      if (toggle) toggle.checked = enabled;
    },
    dispose() {
      disposed = true; clearTimeout(timer); unwatch();
      for (const doc of entries.keys()) detach(doc);
      entries.clear();
      settingsDocuments.clear();
    },
  };
}
