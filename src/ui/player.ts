import type { PlayerSnapshot } from '../read-aloud/player-controller';
import { PREF_PREFIX, type PrefsBackend } from '../core/settings';

/** Own player UI, driven by a narrow adapter to the reader engine. */
export function createPluginPlayer(deps: {
  uri: string;
  iconURI: string;
  dead(value: unknown): boolean;
  error(error: unknown): void;
  exportResize(target: Window, callback: (height: number) => void): void;
  exportFloating(target: Window, move: (dx: number, dy: number) => void): void;
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
  const readLayout = () => { const value = deps.prefs.get(PREF_PREFIX + 'readAloud.playerLayout'); return value === 'B' || value === 'top' ? value : 'A'; };
  let layout = readLayout();
  let enabled = deps.prefs.get(PREF_PREFIX + 'readAloud.usePluginPlayer') !== false;
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
    if (!['A', 'B', 'top'].includes(value)) return;
    layout = value;
    deps.prefs.set(PREF_PREFIX + 'readAloud.playerLayout', value);
    refresh();
    for (const doc of settingsDocuments) {
      if (deps.dead(doc) || doc.defaultView?.closed) { settingsDocuments.delete(doc); continue; }
      updateSettingsLayout(doc);
    }
  }
  const entries = new Map<Document, { frame: HTMLIFrameElement; style: HTMLStyleElement; button: HTMLButtonElement; open: boolean; reader: any; nativeOpened: boolean; lastSnapshot: string; actionError: string | null; openedAt: number; moved: boolean; listener: (event: MessageEvent) => void; resize: () => void; connect: () => void; cleanup: () => void }>();
  function syncAppearance(doc: Document): void {
    const entry = entries.get(doc);
    if (!entry || deps.dead(doc)) return;
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
      entry.frame.style.top = top + 'px';
    }
    if (layout === 'top') {
      const toolbarBottom = doc.querySelector('.toolbar')?.getBoundingClientRect().bottom ?? 41;
      entry.frame.style.top = toolbarBottom + 'px';
      const rule = entry.style.sheet?.cssRules[entry.style.sheet.cssRules.length - 1] as CSSStyleRule | undefined;
      if (rule?.selectorText === '#split-view') rule.style.setProperty('top', toolbarBottom + 34 + 'px', 'important');
    }
  }
  function paint(doc: Document): void {
    const entry = entries.get(doc)!;
    entry.moved = false;
    const visible = enabled && entry.open;
    entry.frame.hidden = !visible;
    entry.button.hidden = !enabled;
    entry.button.classList.toggle('active', visible);
    entry.button.setAttribute('aria-expanded', String(visible));
    entry.style.textContent = '#ztts-player-toggle[hidden], #ztts-player-frame[hidden] { display: none !important; }';
    if (enabled) entry.style.textContent += '\n.read-aloud-popup, #read-aloud { display: none !important; }';
    // Reserve real reader space for the two docked layouts; floating leaves it intact.
    if (visible && layout === 'A') entry.style.textContent += '\n#split-view { bottom: 34px !important; }';
    if (visible && layout === 'top') entry.style.textContent += '\n#split-view { top: 75px !important; }';
    entry.frame.style.cssText = 'position:fixed;z-index:10000;border:0;background:transparent;color-scheme:light;';
    if (layout === 'A') entry.frame.style.cssText += 'left:0;bottom:0;width:100%;height:34px;';
    if (layout === 'B') entry.frame.style.cssText += 'left:10px;top:51px;width:min(300px,95vw);height:192px;';
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
      for (const doc of entries.keys()) if (deps.dead(doc)) entries.delete(doc);
      const doc = reader?._iframeWindow?.document as Document | undefined;
      if (!doc?.body) return;
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
      const resize = () => { try { syncAppearance(doc); } catch (error) { deps.error(error); } };
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
        if (height >= 34 && height <= 500 && frame.style.height !== height + 'px') frame.style.height = height + 'px';
      };
      let unlistenKeys: (() => void) | null = null;
      const loaded = () => {
        if (frame.contentWindow) {
          deps.exportResize(frame.contentWindow, resizeMenu);
          deps.exportFloating(frame.contentWindow, (dx, dy) => {
            if (layout !== 'B' || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
            const box = frame.getBoundingClientRect();
            entries.get(doc)!.moved = true;
            frame.style.left = Math.max(0, Math.min(win.innerWidth - box.width, box.left + dx)) + 'px';
            frame.style.top = Math.max(0, Math.min(win.innerHeight - 192, box.top + dy)) + 'px';
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
          if (deps.dead(doc)) return;
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
        entry.open = !entry.open;
        entry.openedAt = entry.open ? Date.now() : 0;
        paint(doc);
        void act(doc, entry.open ? 'open' : 'close');
      };
      button.addEventListener('click', toggle);
      entries.set(doc, { frame, style, button, open: false, reader, nativeOpened: deps.snapshot(reader).opened, lastSnapshot: '', actionError: null, openedAt: 0, moved: false, listener, resize, connect, cleanup: () => {
        unlistenKeys?.();
        button.removeEventListener('click', toggle);
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
  async function act(doc: Document, action: string, value?: unknown): Promise<void> {
    const entry = entries.get(doc);
    if (!entry || !enabled || deps.dead(doc)) return;
    entry.actionError = null;
    try { await deps.command(entry.reader, action, value); }
    catch (error) { entry.actionError = error instanceof Error ? error.message : String(error); deps.notice(entry.reader, entry.actionError); deps.error(error); }
    if (!deps.dead(doc)) publish(doc);
  }
  function publish(doc: Document): void {
    const entry = entries.get(doc);
    if (!entry || deps.dead(doc)) return;
    const state = deps.snapshot(entry.reader);
    if (state.opened !== entry.nativeOpened) {
      entry.nativeOpened = state.opened;
      if (enabled && entry.open !== state.opened) { entry.open = state.opened; entry.openedAt = state.opened ? Date.now() : 0; paint(doc); }
    }
    const json = JSON.stringify({ ...state, error: entry.actionError ?? state.error,
      loading: entry.open && !state.voices.length && Date.now() - entry.openedAt < 15000,
      strings: deps.strings() });
    if (json !== entry.lastSnapshot && entry.frame.contentWindow && deps.update(entry.frame.contentWindow, json)) entry.lastSnapshot = json;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  function tick(): void {
    if (disposed) return;
    for (const [doc, entry] of entries) {
      if (deps.dead(doc)) { try { entry.cleanup(); } catch {} entries.delete(doc); continue; }
      try { publish(doc); } catch (error) { deps.error(error); }
    }
    timer = setTimeout(tick, 250);
  }
  timer = setTimeout(tick, 250);
  const unwatch = deps.watchSettings(() => {
    const nextLayout = readLayout(), nextEnabled = deps.prefs.get(PREF_PREFIX + 'readAloud.usePluginPlayer') !== false;
    if (nextLayout !== layout || nextEnabled !== enabled) { layout = nextLayout; enabled = nextEnabled; refresh(); }
    for (const doc of settingsDocuments) if (!deps.dead(doc) && !doc.defaultView?.closed) {
      updateSettingsLayout(doc);
      const toggle = doc.getElementById('ztts-player-enabled') as HTMLInputElement | null;
      if (toggle) toggle.checked = enabled;
    }
  });
  return {
    attach,
    inspect() {
      return { enabled, layout, readers: [...entries].filter(([doc]) => !deps.dead(doc)).map(([doc, entry]) => ({
        open: entry.open, ready: !!entry.frame.contentDocument?.querySelector('.player'),
        frames: doc.querySelectorAll('#ztts-player-frame').length, actionError: entry.actionError,
        state: deps.snapshot(entry.reader),
      })) };
    },
    setLayout: changeLayout,
    setEnabled(value: boolean) {
      enabled = value;
      for (const entry of entries.values()) entry.open = false;
      deps.prefs.set(PREF_PREFIX + 'readAloud.usePluginPlayer', value);
      refresh();
    },
    prepareSettingsMenu(doc: Document) {
      const button = doc.getElementById('ztts-player-layout-trigger')!;
      const menu = doc.getElementById('ztts-player-layout-menu')!;
      updateSettingsLayout(doc);
      const rect = button.getBoundingClientRect();
      menu.style.left = rect.left + 'px';
      menu.style.top = rect.bottom + 4 + 'px';
      menu.style.minWidth = rect.width + 'px';
    },
    initSettings(doc: Document) {
      settingsDocuments.add(doc);
      const select = doc.getElementById('ztts-player-layout') as HTMLSelectElement | null;
      const toggle = doc.getElementById('ztts-player-enabled') as HTMLInputElement | null;
      if (select) select.value = layout;
      updateSettingsLayout(doc);
      if (toggle) toggle.checked = enabled;
    },
    dispose() {
      disposed = true; clearTimeout(timer); unwatch();
      for (const [doc, entry] of entries) {
        if (deps.dead(doc)) continue;
        try { entry.cleanup(); doc.defaultView?.removeEventListener('message', entry.listener); doc.defaultView?.removeEventListener('resize', entry.resize); entry.button.remove(); entry.frame.remove(); entry.style.remove(); }
        catch (error) { deps.error(error); }
      }
      entries.clear();
      settingsDocuments.clear();
    },
  };
}
