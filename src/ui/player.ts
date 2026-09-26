import { floatingMenuPlacement } from './player-menu';
import { BAR_HEIGHT, barBand, coveredEdges, type Band, type Covered } from './player-cover';
import type { PlayerSnapshot } from '../read-aloud/player-controller';
import { PREF_PREFIX, playerLayout, setPlayerLayout, type PrefsBackend } from '../core/settings';
import { t } from '../core/l10n';

/** Zotero's own player and its headphone button, never shown while the plugin runs (ADR 0007). */
export const HIDE_ZOTERO_PLAYER = '.read-aloud-popup, #read-aloud { display: none !important; }';
const HIDDEN_PARTS = '#ztts-player-toggle[hidden], #ztts-player-frame[hidden] { display: none !important; }';

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
  const panelHeight = (expanded: boolean, remaining = false) => (expanded ? 202 : 108) + (remaining ? 36 : 0);
  let layout = readLayout();
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
  const entries = new Map<Document, { frame: HTMLIFrameElement; style: HTMLStyleElement; button: HTMLButtonElement; open: boolean; reader: any; nativeOpened: boolean;
    /** Why this reader's Player cannot appear, if it cannot: its attach threw, or its frame never finished loading (ADR 0007). */
    failed: 'attach' | 'frame' | null;
    /** The reading this Player refused is already closed and said so. */
    refused: boolean; lastSnapshot: string; actionError: string | null; openedAt: number; moved: boolean; expanded: boolean; remaining: boolean; menuInset: number; listener: (event: MessageEvent) => void; resize: () => void; connect: () => void; cleanup: () => void }>();
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
    const visible = entry.open;
    entry.frame.hidden = !visible;
    entry.button.hidden = false;
    entry.button.classList.toggle('active', visible);
    entry.button.setAttribute('aria-expanded', String(visible));
    entry.style.textContent = HIDDEN_PARTS + '\n' + HIDE_ZOTERO_PLAYER;
    // The bars lie over the document's edge (#135): a resized document area
    // re-lays the document out, and Zotero blurs an EPUB while it does. Only
    // Zotero's find bar, 15 px below the top of the view it opens in, is moved
    // out from under the Top bar; side by side, both views reach the top.
    if (visible && layout === 'top') {
      entry.style.textContent += '\n.split-view .primary-view .find-popup, body.enable-vertical-split-view .split-view .secondary-view .find-popup { margin-top: ' + BAR_HEIGHT + 'px !important; }';
    }
    entry.frame.style.cssText = 'position:fixed;z-index:10000;border:0;background:transparent;color-scheme:light;';
    if (layout === 'A') entry.frame.style.cssText += 'left:0;bottom:0;width:100%;height:34px;';
    if (layout === 'B') entry.frame.style.cssText += 'left:10px;top:51px;width:min(300px,95vw);height:' + panelHeight(entry.expanded, entry.remaining) + 'px;';
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
    let doc: Document | undefined;
    try {
      for (const held of entries.keys()) if (!live(held)) detach(held);
      doc = reader?._iframeWindow?.document as Document | undefined;
      if (!doc?.body || !live(doc)) return;
      if (entries.has(doc)) { entries.get(doc)!.connect(); return; }
      build(reader, doc);
    } catch (error) {
      deps.error(error);
      // Its hiding rule is in: a reading opened here is refused, not left to Zotero's own player
      const entry = doc ? entries.get(doc) : undefined;
      if (entry) entry.failed = 'attach';
    }
  }
  function build(reader: any, doc: Document): void {
    // Recover nodes left by an interrupted prototype hot-upgrade, and the hiding rule an upgrade left behind.
    for (const stale of doc.querySelectorAll('#ztts-player-prototype, #ztts-player-prototype-layout, #ztts-player-toolbar-slot, #ztts-player-frame, #ztts-player-style, #ztts-player-toggle')) stale.remove();
    // First, so that nothing failing below leaves Zotero's own player showing (ADR 0007)
    const style = doc.createElement('style');
    style.id = 'ztts-player-style';
    style.textContent = HIDDEN_PARTS + '\n' + HIDE_ZOTERO_PLAYER;
    doc.head.append(style);
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
    const frame = doc.createElement('iframe');
    frame.id = 'ztts-player-frame';
    frame.setAttribute('title', 'Zotero-TTS');
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
    let geometry: { observe(target: Element): void; disconnect(): void } | null = null;
    let changes: { observe(target: Node, options: MutationObserverInit): void; disconnect(): void } | null = null;
    let scheme: MediaQueryList | null = null;
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
            panelTop: box.top + entry.menuInset, panelHeight: panelHeight(entry.expanded, entry.remaining),
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
          frame.style.top = Math.max(0, Math.min(win.innerHeight - panelHeight(entries.get(doc)!.expanded, entries.get(doc)!.remaining), box.top + dy)) + 'px';
        });
        deps.exportLayout(frame.contentWindow, changeLayout);
        unlistenKeys?.();
        unlistenKeys = deps.listenKeys(reader, frame.contentWindow);
        deps.exportCommand(frame.contentWindow, (action, value) => { void act(doc, action, value); });
        const entry = entries.get(doc)!;
        // A frame that loaded late recovers the Player; an attach that threw does not
        if (entry.failed === 'frame') { entry.failed = null; entry.refused = false; }
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
          else {
            const entry = entries.get(doc);
            if (entry && !entry.failed) entry.failed = 'frame';
            deps.error(new Error('Zotero-TTS: player did not finish loading.'));
          }
        } catch (error) { deps.error(error); }
      };
      connectionTimer = setTimeout(tryConnect, 50);
    };
    const toggle = (event: Event) => {
      event.stopPropagation();
      const entry = entries.get(doc)!;
      if (entry.failed) { deps.notice(reader, t('ztts-player-failed')); return; }
      if (!entry.open) entry.expanded = deps.snapshot(reader).expandOnOpen;
      entry.open = !entry.open;
      entry.openedAt = entry.open ? Date.now() : 0;
      paint(doc);
      void act(doc, entry.open ? 'open' : 'close');
    };
    entries.set(doc, { frame, style, button, open: false, reader, nativeOpened: deps.snapshot(reader).opened, failed: null, refused: false, lastSnapshot: '', actionError: null, openedAt: 0, moved: false, remaining: false, expanded: deps.snapshot(reader).expandOnOpen, menuInset: 0, listener, resize, connect, cleanup: () => {
      clearTimeout(connectionTimer);
      for (const cleanup of [() => unlistenKeys?.(), () => button.removeEventListener('click', toggle),
        () => geometry?.disconnect(), () => changes?.disconnect(), () => scheme?.removeEventListener('change', resize)]) {
        try { cleanup(); } catch (error) { if (live(doc)) deps.error(error); }
      }
    } });
    doc.querySelector('#read-aloud')?.before(button);
    button.addEventListener('click', toggle);
    geometry = new win.ResizeObserver(resize);
    const split = doc.querySelector('#split-view');
    if (split) geometry!.observe(split);
    const toolbar = doc.querySelector('.toolbar');
    if (toolbar) geometry!.observe(toolbar);
    changes = new win.MutationObserver(resize);
    for (const node of [doc.documentElement, doc.body]) changes!.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'data-color-scheme'] });
    scheme = win.matchMedia('(prefers-color-scheme: dark)') as MediaQueryList;
    scheme.addEventListener('change', resize);
    doc.body.append(frame);
    doc.defaultView?.addEventListener('message', listener);
    doc.defaultView?.addEventListener('resize', resize);
    paint(doc);
  }
  function refresh(): void {
    for (const doc of entries.keys()) {
      if (!live(doc)) { detach(doc); continue; }
      try { paint(doc); } catch (error) { deps.error(error); }
    }
  }
  async function act(doc: Document, action: string, value?: unknown): Promise<void> {
    const entry = entries.get(doc);
    if (!entry || !live(doc)) return;
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
    entry.remaining = !!state.remaining?.length;
    if (entry.failed) { refuse(entry, state.opened); return; }
    if (state.opened !== entry.nativeOpened) {
      entry.nativeOpened = state.opened;
      if (entry.open !== state.opened) { if (state.opened) entry.expanded = state.expandOnOpen; entry.open = state.opened; entry.openedAt = state.opened ? Date.now() : 0; paint(doc); }
    }
    const json = JSON.stringify({ ...state, expanded: entry.expanded, error: entry.actionError ?? state.error,
      loading: entry.open && !state.voices.length && Date.now() - entry.openedAt < 15000,
      strings: deps.strings() });
    if (json !== entry.lastSnapshot && entry.frame.contentWindow && deps.update(entry.frame.contentWindow, json)) entry.lastSnapshot = json;
  }
  /**
   * A reading opened where the Player cannot appear — by Zotero's shortcut,
   * Shift+Space or Read Aloud from Here — is closed at once and the reason
   * shown, once per opening: Zotero's own player never stands in (ADR 0007).
   */
  function refuse(entry: { reader: any; refused: boolean }, opened: boolean): void {
    if (!opened) { entry.refused = false; return; }
    if (entry.refused) return;
    entry.refused = true;
    deps.notice(entry.reader, t('ztts-player-failed'));
    void deps.command(entry.reader, 'close').catch(deps.error);
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
    const nextLayout = readLayout();
    if (nextLayout !== layout) { layout = nextLayout; refresh(); }
    for (const doc of settingsDocuments) {
      if (!live(doc)) { settingsDocuments.delete(doc); continue; }
      updateSettingsLayout(doc);
    }
  });
  /** `keepHiding`: an upgrade leaves Zotero's own player hidden until the successor attaches (ADR 0007). */
  function detach(doc: Document, keepHiding = false): void {
    const entry = entries.get(doc);
    if (!entry) return;
    entries.delete(doc);
    const report = live(doc);
    const style = keepHiding && report ? () => { entry.style.textContent = HIDE_ZOTERO_PLAYER; } : () => entry.style.remove();
    for (const cleanup of [entry.cleanup,
      () => doc.defaultView?.removeEventListener('message', entry.listener),
      () => doc.defaultView?.removeEventListener('resize', entry.resize),
      () => entry.button.remove(), () => entry.frame.remove(), style]) {
      try { cleanup(); } catch (error) { if (report) deps.error(error); }
    }
  }
  return {
    attach,
    inspect() {
      return { layout, resource: deps.uri, readers: [...entries].filter(([doc]) => live(doc)).map(([doc, entry]) => ({
        open: entry.open, failed: entry.failed, expanded: entry.expanded, menuInset: entry.menuInset, ready: !!entry.frame.contentDocument?.querySelector('.player'),
        frames: doc.querySelectorAll('#ztts-player-frame').length, actionError: entry.actionError,
        state: deps.snapshot(entry.reader),
      })) };
    },
    isOpen(reader: unknown): boolean {
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
        if (bar && !bar.hidden) return coveredEdges(barBand(layout, bar.getBoundingClientRect()), box);
      } catch { /* a closed tab's document */ }
      return { top: 0, bottom: 0 };
    },
    setLayout: changeLayout,
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
      if (select) select.value = layout;
      updateSettingsLayout(doc);
    },
    /** `handBack` on a disable or uninstall: Zotero's own player shows again. Otherwise it stays hidden for the successor (ADR 0007). */
    dispose(options: { handBack: boolean } = { handBack: true }) {
      disposed = true; clearTimeout(timer); unwatch();
      for (const doc of [...entries.keys()]) detach(doc, !options.handBack);
      entries.clear();
      settingsDocuments.clear();
    },
  };
}
