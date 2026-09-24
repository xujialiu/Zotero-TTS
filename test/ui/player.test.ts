import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPluginPlayer } from '../../src/ui/player';
import type { PlayerSnapshot } from '../../src/read-aloud/player-controller';
import { t } from '../../src/core/l10n';

const HIDING_RULE = '.read-aloud-popup, #read-aloud { display: none !important; }';

/** The few DOM calls the Player makes on a reader's document, over plain objects. */
function fakeElement(tag: string): any {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const attributes = new Map<string, string>();
  const el: any = {
    tagName: tag.toUpperCase(), id: '', className: '', type: '', title: '', hidden: false, textContent: '',
    src: '', alt: '', width: 0, height: 0, children: [] as any[], parent: null as any,
    contentWindow: null, contentDocument: null,
    style: { cssText: '', left: '', top: '', width: '', height: '', setProperty() {} },
    classList: { toggle() {} },
    setAttribute(name: string, value: unknown) { attributes.set(name, String(value)); },
    getAttribute(name: string) { return attributes.get(name) ?? null; },
    toggleAttribute() {},
    append(...nodes: any[]) { for (const node of nodes) { node.remove?.(); node.parent = el; el.children.push(node); } },
    before(node: any) {
      const parent = el.parent;
      if (!parent) return;
      node.remove?.();
      node.parent = parent;
      parent.children.splice(parent.children.indexOf(el), 0, node);
    },
    remove() {
      const parent = el.parent;
      if (!parent) return;
      parent.children.splice(parent.children.indexOf(el), 1);
      el.parent = null;
    },
    addEventListener(type: string, fn: (event: unknown) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: (event: unknown) => void) { listeners.get(type)?.delete(fn); },
    click() { for (const fn of listeners.get('click') ?? []) fn({ stopPropagation() {} }); },
    getBoundingClientRect: () => ({ top: 0, bottom: 41, left: 0, right: 800, width: 800, height: 41 }),
    querySelector: () => null,
  };
  return el;
}

function matches(el: any, selector: string): boolean {
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  if (selector.startsWith('.')) return String(el.className).split(' ').includes(selector.slice(1));
  return el.tagName === selector.toUpperCase();
}

function fakeReader(options: { frameLoads?: boolean } = {}) {
  const frameLoads = options.frameLoads ?? true;
  const win: any = {
    closed: false, innerWidth: 1200, innerHeight: 800,
    ResizeObserver: class { observe() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    matchMedia: () => ({ addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '', backgroundColor: 'rgb(255, 255, 255)', color: '', fontFamily: '', fontSize: '', borderColor: '' }),
    addEventListener() {}, removeEventListener() {},
  };
  const root = fakeElement('html');
  const head = fakeElement('head');
  const body = fakeElement('body');
  root.append(head, body);
  const toolbar = fakeElement('div');
  toolbar.className = 'toolbar';
  const headphones = fakeElement('button');
  headphones.id = 'read-aloud';
  toolbar.append(headphones);
  const popup = fakeElement('div');
  popup.className = 'read-aloud-popup';
  body.append(toolbar, popup);
  const all = (): any[] => {
    const found: any[] = [];
    const walk = (el: any) => { for (const child of el.children) { found.push(child); walk(child); } };
    walk(root);
    return found;
  };
  const doc: any = {
    defaultView: win, documentElement: root, head, body,
    createElement(tag: string) {
      const el = fakeElement(tag);
      if (tag === 'iframe') {
        el.contentWindow = {};
        el.contentDocument = {
          documentElement: { style: { setProperty() {} } },
          querySelector: (selector: string) => (selector === '.player' && frameLoads ? {} : null),
        };
      }
      return el;
    },
    querySelector: (selector: string) => all().find(el => matches(el, selector)) ?? null,
    querySelectorAll: (selectors: string) => {
      const list = selectors.split(',').map(s => s.trim());
      return all().filter(el => list.some(selector => matches(el, selector)));
    },
    getElementById: (id: string) => all().find(el => el.id === id) ?? null,
  };
  return { reader: { _iframeWindow: { document: doc } }, doc, win, head, body };
}

function snapshot(opened: boolean): PlayerSnapshot {
  return {
    expandOnOpen: false, opened, active: opened, playing: false, buffering: false,
    provider: '', locale: '', voice: '', speed: 1, volume: 100, automatic: true,
    providers: [], locales: [], voices: [], favorites: [], error: null,
  };
}

function fakePrefs(values: Record<string, unknown> = {}) {
  const map = new Map(Object.entries(values));
  return {
    get: (key: string) => map.get(key),
    set: (key: string, value: unknown) => { map.set(key, value); },
    setDefault: (key: string, value: string) => { if (!map.has(key)) map.set(key, value); },
  };
}

function setup(options: { prefs?: Record<string, unknown> } = {}) {
  const state = { opened: false };
  const deps = {
    uri: 'resource://zotero-tts-player/player.html',
    iconURI: 'resource://zotero-tts-player/icon.png',
    dead: () => false,
    error: vi.fn(),
    exportResize() {}, exportFloating() {}, exportMenu() {}, exportLayout() {},
    renderLayout: () => false,
    prefs: fakePrefs(options.prefs),
    snapshot: vi.fn(() => snapshot(state.opened)),
    command: vi.fn(async () => {}),
    exportCommand() {},
    update: () => true,
    strings: () => ({}),
    watchSettings: () => () => {},
    notice: vi.fn(),
    listenKeys: () => () => {},
  };
  return { deps, state };
}

const styles = (head: any) => head.children.filter((el: any) => el.id === 'ztts-player-style');
const toggleOf = (doc: any) => doc.getElementById('ztts-player-toggle');
const frameOf = (doc: any) => doc.getElementById('ztts-player-frame');

describe('the Player, the only player (#134)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("hides Zotero's own player and headphone button in every reader, whatever the retired switch holds", () => {
    const { deps } = setup({ prefs: { 'extensions.zotero.zotero-tts.readAloud.usePluginPlayer': false } });
    const { reader, doc, head } = fakeReader();
    const player = createPluginPlayer(deps);
    player.attach(reader);
    expect(styles(head)).toHaveLength(1);
    expect(styles(head)[0].textContent).toContain(HIDING_RULE);
    expect(toggleOf(doc).hidden).toBe(false);
    expect(doc.querySelector('.toolbar').children.map((el: any) => el.id)).toEqual(['ztts-player-toggle', 'read-aloud']);
    player.dispose({ handBack: true });
  });

  it('opens from its toolbar button, and reports itself open, with no setting to consult', async () => {
    const { deps } = setup({ prefs: { 'extensions.zotero.zotero-tts.readAloud.usePluginPlayer': false } });
    const { reader, doc } = fakeReader();
    const player = createPluginPlayer(deps);
    player.attach(reader);
    toggleOf(doc).click();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.command).toHaveBeenCalledWith(reader, 'open', undefined);
    expect(frameOf(doc).hidden).toBe(false);
    expect(player.isOpen(reader)).toBe(true);
    expect(JSON.parse(JSON.stringify(player.inspect()))).not.toHaveProperty('enabled');
    player.dispose({ handBack: true });
  });

  it("puts the hiding rule in first, so a fault later in attach still keeps Zotero's player hidden", () => {
    const { deps } = setup();
    const { reader, win, head } = fakeReader();
    win.ResizeObserver = class { constructor() { throw new Error('no ResizeObserver here'); } };
    const player = createPluginPlayer(deps);
    player.attach(reader);
    expect(deps.error).toHaveBeenCalled();
    expect(styles(head)).toHaveLength(1);
    expect(styles(head)[0].textContent).toContain(HIDING_RULE);
    player.dispose({ handBack: true });
  });

  it('closes a reading started in a reader whose attach failed, and says the player could not load', async () => {
    const { deps, state } = setup();
    const { reader, win } = fakeReader();
    win.ResizeObserver = class { constructor() { throw new Error('no ResizeObserver here'); } };
    const player = createPluginPlayer(deps);
    player.attach(reader);
    state.opened = true;
    await vi.advanceTimersByTimeAsync(250);
    expect(deps.command).toHaveBeenCalledWith(reader, 'close');
    expect(deps.notice).toHaveBeenCalledWith(reader, t('ztts-player-failed'));
    player.dispose({ handBack: true });
  });

  it('shows the message instead of starting a reading when its frame never finished loading', async () => {
    const { deps } = setup();
    const { reader, doc } = fakeReader({ frameLoads: false });
    const player = createPluginPlayer(deps);
    player.attach(reader);
    await vi.advanceTimersByTimeAsync(100 * 50 + 100);
    expect(deps.error).toHaveBeenCalled();
    toggleOf(doc).click();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.command).not.toHaveBeenCalledWith(reader, 'open', undefined);
    expect(deps.notice).toHaveBeenCalledWith(reader, t('ztts-player-failed'));
    expect(frameOf(doc).hidden).toBe(true);
    player.dispose({ handBack: true });
  });

  it('closes a reading opened by any other way into a reader whose frame never loaded, once', async () => {
    const { deps, state } = setup();
    const { reader, doc } = fakeReader({ frameLoads: false });
    const player = createPluginPlayer(deps);
    player.attach(reader);
    await vi.advanceTimersByTimeAsync(100 * 50 + 100);
    state.opened = true;
    await vi.advanceTimersByTimeAsync(250);
    expect(deps.command).toHaveBeenCalledWith(reader, 'close');
    expect(deps.notice).toHaveBeenCalledTimes(1);
    expect(frameOf(doc).hidden).toBe(true);
    state.opened = false;
    await vi.advanceTimersByTimeAsync(500);
    expect(deps.notice).toHaveBeenCalledTimes(1);
    player.dispose({ handBack: true });
  });

  it("leaves the hiding rule in place across an upgrade, and the successor's replaces it", () => {
    const { deps } = setup();
    const { reader, doc, head } = fakeReader();
    const old = createPluginPlayer(deps);
    old.attach(reader);
    old.dispose({ handBack: false });
    expect(toggleOf(doc)).toBeNull();
    expect(frameOf(doc)).toBeNull();
    expect(styles(head)).toHaveLength(1);
    expect(styles(head)[0].textContent.trim()).toBe(HIDING_RULE);
    const successor = createPluginPlayer(setup().deps);
    successor.attach(reader);
    expect(styles(head)).toHaveLength(1);
    expect(doc.querySelectorAll('#ztts-player-toggle')).toHaveLength(1);
    expect(doc.querySelectorAll('#ztts-player-frame')).toHaveLength(1);
    successor.dispose({ handBack: true });
  });

  it("hands the reader back on a disable or uninstall: nothing of the Player's stays", () => {
    const { deps } = setup();
    const { reader, doc, head } = fakeReader();
    const player = createPluginPlayer(deps);
    player.attach(reader);
    player.dispose({ handBack: true });
    expect(styles(head)).toHaveLength(0);
    expect(toggleOf(doc)).toBeNull();
    expect(frameOf(doc)).toBeNull();
  });

  it('starts closed over a reading its predecessor left open, and its button carries the reading on', async () => {
    const { deps, state } = setup();
    state.opened = true;
    const { reader, doc } = fakeReader();
    const player = createPluginPlayer(deps);
    player.attach(reader);
    await vi.advanceTimersByTimeAsync(500);
    expect(frameOf(doc).hidden).toBe(true);
    toggleOf(doc).click();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.command).toHaveBeenCalledWith(reader, 'open', undefined);
    expect(frameOf(doc).hidden).toBe(false);
    player.dispose({ handBack: true });
  });
});
