/* The UI receives plain snapshots; only the host adapter can perform actions. */
let state = { provider: '', locale: '', voice: '', speed: 1, volume: 100, automatic: true, playing: false, active: false, expanded: false,
  buffering: false, loading: true, error: null, providers: [], locales: [], voices: [], favorites: [] };
let strings = {};
let variant = new URLSearchParams(location.search).get('variant') || 'top';
let popover = null, anchor = null, refreshPopover = null;
const $ = selector => document.querySelector(selector);
const text = key => strings[key] || ({ play: 'Play', pause: 'Pause', provider: 'Provider', locale: 'Locale', voice: 'Voice', speed: 'Speed', volume: 'Volume', layout: 'Layout', options: 'Options', previousParagraph: 'Skip to Previous Paragraph', previousSentence: 'Skip to Previous Sentence', nextSentence: 'Skip to Next Sentence', nextParagraph: 'Skip to Next Paragraph', automatic: 'Automatic scroll', manual: 'Manual scroll', bottom: 'Bottom bar', floating: 'Floating panel', top: 'Top bar', search: 'Search', empty: 'No matches', loading: 'Loading voices…', 'no-voices': 'No voices available', favorite: 'Favorite', unfavorite: 'Unfavorite', retry: 'Retry', buffering: 'Buffering…' }[key] || key);
const formatSpeed = value => Number(value).toFixed(2) + '×';
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const choices = key => state[key === 'provider' ? 'providers' : key === 'locale' ? 'locales' : 'voices'];
const selectedLabel = key => choices(key).find(option => option.value === state[key])?.label || text(key);
function send(action, value) { window.zttsCommand?.(action, value); }
function notifyHeight() { window.zttsResizePreview?.(variant === 'B' ? ($('.player')?.getBoundingClientRect().height || 108) : popover ? 460 : 34); }
function closePopover(resize = true) {
  anchor?.setAttribute('aria-expanded', 'false'); popover?.remove();
  popover = null; anchor = null; refreshPopover = null;
  if (resize) notifyHeight();
}
function field(key) {
  return `<div class="field ${key === 'voice' ? 'voice' : ''}"><button class="picker" data-pick="${key}" aria-haspopup="dialog" aria-expanded="false"><span class="value">${escapeHTML(selectedLabel(key))}</span><span class="chevron" aria-hidden="true"></span></button></div>`;
}
const layoutControl = `<button class="adjust layout-menu" aria-haspopup="dialog" aria-expanded="false"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="1" stroke="currentColor" stroke-width="1.25"/><path d="M3 7h14M3 13h14" stroke="currentColor" stroke-width="1.25"/></svg></button>`;
const playControl = '<button class="play" type="button"></button>';
const skipControl = action => `<button class="skip" data-navigate="${action}" type="button">${nativeNavigation[action]}</button>`;
function render() {
  // The outgoing DOM still has the previous layout's dimensions.
  closePopover(false);
  $('#player-root').innerHTML = `<section class="player ${variant === 'B' ? 'layout-B' : 'layout-A'} ${variant === 'top' ? 'layout-top' : ''}" aria-label="Zotero-TTS">
    <div class="identity"><button class="options-toggle" type="button" aria-controls="player-choices">${nativeOptions}</button><span class="grip" aria-hidden="true">Zotero-TTS ⠿</span>${variant === 'B' ? layoutControl : ''}</div>
    ${variant === 'B' ? `<div class="transport">${skipControl('previousParagraph')}${skipControl('previousSentence')}${playControl}${skipControl('nextSentence')}${skipControl('nextParagraph')}</div>` : playControl}
    <div class="voice-group" id="player-choices">${field('provider')}${field('locale')}${field('voice')}</div>
    <div class="controls"><button class="adjust" data-adjust="speed" aria-haspopup="dialog">${speedIcon}<span class="adjust-value"></span></button><button class="adjust mode"></button><button class="adjust" data-adjust="volume" aria-haspopup="dialog">${volumeIcon}<span class="adjust-value"></span></button><button class="status-button" hidden>!</button>${variant === 'B' ? '' : layoutControl}</div>
    <div class="remaining-time" hidden></div>
  </section>`;
  document.querySelectorAll('[data-pick]').forEach(button => { button.onclick = () => openPicker(button, button.dataset.pick); });
  document.querySelectorAll('[data-adjust]').forEach(button => { button.onclick = () => openRange(button, button.dataset.adjust); });
  $('.play').onclick = () => send('play');
  $('.options-toggle').onclick = () => { closePopover(); send('options'); };
  document.querySelectorAll('[data-navigate]').forEach(button => { button.onclick = () => send('navigate', button.dataset.navigate); });
  $('.mode').onclick = () => send('automatic', !state.automatic);
  $('.layout-menu').onclick = () => openLayoutMenu($('.layout-menu'));
  $('.status-button').onclick = () => openStatus($('.status-button'));
  if (variant === 'B') makeDraggable($('.grip'));
  updateControls();
  notifyHeight();
}
function updateControls() {
  const play = $('.play');
  if (!play) return;
  const playingLabel = text(state.playing ? 'pause' : 'play');
  play.innerHTML = state.playing ? nativePause : nativePlay;
  play.title = state.buffering ? text('buffering') : playingLabel;
  play.setAttribute('aria-label', playingLabel);
  play.setAttribute('aria-pressed', String(state.playing));
  play.dataset.buffering = String(state.buffering);
  play.disabled = !state.active && !state.voices.length;
  for (const button of document.querySelectorAll('[data-navigate]')) {
    button.title = text(button.dataset.navigate); button.setAttribute('aria-label', button.title); button.disabled = !state.active;
  }
  const options = $('.options-toggle');
  options.title = text('options'); options.setAttribute('aria-label', options.title);
  options.setAttribute('aria-expanded', String(!!state.expanded));
  options.setAttribute('aria-pressed', String(!!state.expanded));
  const collapsed = variant === 'B' && !state.expanded;
  const player = $('.player');
  const hasRemaining = !!state.remaining?.length;
  const changed = player.classList.contains('collapsed') !== collapsed || player.classList.contains('has-remaining') !== hasRemaining;
  if (changed) closePopover(false);
  player.classList.toggle('collapsed', collapsed);
  player.classList.toggle('has-remaining', hasRemaining);
  const remaining = $('.remaining-time');
  remaining.hidden = !hasRemaining;
  const lines = state.remaining || [];
  remaining.title = lines.join(' · ');
  remaining.setAttribute('aria-label', remaining.title);
  remaining.replaceChildren(...lines.map(line => {
    const span = document.createElement('span'); span.textContent = line; return span;
  }));
  $('.voice-group').hidden = collapsed;
  if (changed) notifyHeight();
  for (const key of ['provider', 'locale', 'voice']) {
    const button = document.querySelector(`[data-pick="${key}"]`);
    button.querySelector('.value').textContent = selectedLabel(key);
    button.title = `${text(key)}: ${selectedLabel(key)}`;
    button.setAttribute('aria-label', button.title);
    button.disabled = choices(key).length === 0;
  }
  for (const key of ['speed', 'volume']) {
    const button = $(`[data-adjust="${key}"]`);
    const value = key === 'speed' ? formatSpeed(state.speed) : `${state.volume}%`;
    button.querySelector('.adjust-value').textContent = value;
    button.title = text(key);
    button.setAttribute('aria-label', `${text(key)}: ${value}`);
  }
  const mode = $('.mode'); mode.textContent = state.automatic ? 'A' : 'M';
  mode.classList.toggle('automatic', state.automatic); mode.title = text(state.automatic ? 'automatic' : 'manual');
  mode.setAttribute('aria-label', mode.title); mode.setAttribute('aria-pressed', String(state.automatic));
  $('.layout-menu').title = text('layout'); $('.layout-menu').setAttribute('aria-label', text('layout'));
  const status = $('.status-button');
  status.hidden = !state.error && !!state.voices.length;
  status.textContent = state.error ? '!' : '…';
  status.title = state.error || text(state.loading ? 'loading' : 'no-voices');
  status.setAttribute('aria-label', status.title);
}
let placing = false;
function place() {
  if (!popover || !anchor || placing) return;
  placing = true;
  try {
    if (variant !== 'B') notifyHeight();
    const rect = anchor.getBoundingClientRect();
    popover.style.width = Math.min(305, innerWidth - 20) + 'px';
    popover.style.left = Math.max(10, Math.min(rect.left, innerWidth - popover.offsetWidth - 10)) + 'px';
    if (variant === 'A') {
      popover.style.top = 'auto'; popover.style.bottom = '42px';
      popover.style.maxHeight = 'min(290px, calc(100vh - 52px))';
    } else if (variant === 'top') {
      popover.style.bottom = 'auto'; popover.style.top = '42px';
      popover.style.maxHeight = 'min(290px, calc(100vh - 52px))';
    } else {
      // Measure content independently of its previous constrained scroll area.
      const list = popover.querySelector('.option-list');
      const height = Math.min(290, popover.scrollHeight + 2 + (list ? list.scrollHeight - list.clientHeight : 0));
      const raw = window.zttsPlaceMenu?.(JSON.stringify({ top: rect.top, bottom: rect.bottom, height }));
      let position;
      if (raw) position = JSON.parse(raw);
      else {
        // Standalone preview has no expanding host frame.
        const below = Math.max(0, innerHeight - rect.bottom - 18), above = Math.max(0, rect.top - 18);
        const down = height <= below || (height > above && below >= above);
        const available = Math.min(height, down ? below : above);
        position = { top: down ? rect.bottom + 8 : rect.top - 8 - available, height: available, side: down ? 'below' : 'above' };
      }
      popover.style.bottom = 'auto'; popover.style.top = position.top + 'px';
      popover.style.maxHeight = position.height + 'px'; popover.dataset.side = position.side;
    }
    popover.style.visibility = 'visible';
  } finally { placing = false; }
}
function createPopover(button, label) {
  if (anchor === button || button.getAttribute('aria-expanded') === 'true') { closePopover(); return false; }
  closePopover(false); anchor = button;
  popover = document.createElement('div'); popover.className = 'popover'; popover.style.visibility = 'hidden';
  popover.setAttribute('role', 'dialog'); popover.setAttribute('aria-label', label);
  document.body.append(popover); button.setAttribute('aria-expanded', 'true'); return true;
}
function openPicker(button, key) {
  if (!createPopover(button, text(key))) return;
  let search = null;
  if (key !== 'provider') {
    search = document.createElement('input'); search.type = 'search'; search.placeholder = text('search'); search.setAttribute('aria-label', text('search'));
    popover.append(search);
  }
  popover.classList.add('picker-popover');
  const list = document.createElement('div'); list.className = 'option-list'; popover.append(list);
  function update() {
    const scrollTop = list.scrollTop;
    list.replaceChildren();
    const favorites = new Set(state.favorites);
    let values = [...choices(key)];
    if (key === 'voice') values.sort((a, b) => Number(favorites.has(b.value)) - Number(favorites.has(a.value)));
    const query = (search?.value || '').toLocaleLowerCase();
    values = values.filter(option => option.label.toLocaleLowerCase().includes(query) || option.value.toLocaleLowerCase().includes(query));
    for (const value of values) {
      const row = document.createElement('div'); row.className = 'option-row';
      if (key === 'voice') {
        const heart = document.createElement('button'); const favorite = favorites.has(value.value);
        heart.className = 'favorite-heart' + (favorite ? ' favorite' : ''); heart.textContent = favorite ? '♥' : '♡';
        heart.setAttribute('aria-pressed', String(favorite)); heart.setAttribute('aria-label', `${text(favorite ? 'unfavorite' : 'favorite')} ${value.label}`);
        heart.onclick = () => send('favorite', value.value); row.append(heart);
      }
      const option = document.createElement('button'); option.className = 'option' + (state[key] === value.value ? ' chosen' : '');
      option.textContent = value.label; option.title = value.label; option.onclick = () => { closePopover(); send(key, value.value); button.focus({ preventScroll: true }); };
      row.append(option); list.append(row);
    }
    if (!values.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = text('empty'); list.append(empty); }
    place(); list.scrollTop = scrollTop;
  }
  refreshPopover = update; if (search) search.oninput = () => { list.scrollTop = 0; update(); }; update();
  (search || list.querySelector('button'))?.focus({ preventScroll: true });
}
function openRange(button, key) {
  if (!createPopover(button, text(key))) return;
  const speed = key === 'speed';
  popover.innerHTML = `<div class="range-title"><span>${escapeHTML(text(key))}</span><strong></strong></div><input type="range" min="${speed ? .5 : 0}" max="${speed ? 3 : 100}" step="${speed ? .05 : 1}"><div class="presets"></div>`;
  const input = popover.querySelector('input'); input.setAttribute('aria-label', text(key));
  const strong = popover.querySelector('strong');
  const format = value => speed ? formatSpeed(value) : value + '%';
  const update = value => { input.value = value; strong.textContent = format(value); };
  input.oninput = () => { update(input.value); send(key, Number(input.value)); };
  for (const value of speed ? [.5, 1, 1.5, 2, 2.5, 3] : [0, 25, 50, 80, 100]) {
    const preset = document.createElement('button'); preset.textContent = format(value);
    preset.onclick = () => { update(value); send(key, value); }; popover.querySelector('.presets').append(preset);
  }
  refreshPopover = () => update(state[key]); update(state[key]); place(); input.focus({ preventScroll: true });
}
function openLayoutMenu(button) {
  if (!createPopover(button, text('layout'))) return;
  for (const [value, label] of [['A', 'bottom'], ['top', 'top'], ['B', 'floating']]) {
    const option = document.createElement('button'); option.className = 'option layout-option' + (variant === value ? ' chosen' : '');
    option.setAttribute('aria-pressed', String(variant === value)); option.textContent = text(label);
    option.onclick = () => { closePopover(); window.zttsSwitchLayout?.(value); }; popover.append(option);
  }
  place(); popover.querySelector('button')?.focus({ preventScroll: true });
}
function openStatus(button) {
  if (!createPopover(button, 'Zotero-TTS')) return;
  const message = document.createElement('div'); message.className = 'error-message';
  message.textContent = state.error || text(state.loading ? 'loading' : 'no-voices'); popover.append(message);
  if (state.error || (!state.loading && !state.voices.length)) { const retry = document.createElement('button'); retry.className = 'retry'; retry.textContent = text('retry'); retry.onclick = () => { closePopover(); send('retry'); }; popover.append(retry); }
  place();
}
function makeDraggable(handle) {
  handle.onpointerdown = event => {
    if (event.button !== 0) return;
    closePopover(); let x = event.screenX, y = event.screenY; handle.setPointerCapture(event.pointerId);
    handle.onpointermove = next => { window.zttsMovePreview?.(next.screenX - x, next.screenY - y); x = next.screenX; y = next.screenY; };
    handle.onpointerup = handle.onpointercancel = () => { handle.onpointermove = null; };
  };
}
window.zttsSetLayout = next => { if (!['A', 'B', 'top'].includes(next)) return; variant = next; render(); };
window.zttsUpdate = json => { const next = JSON.parse(json); strings = next.strings || {}; state = next; updateControls(); refreshPopover?.(); place(); };
document.addEventListener('pointerdown', event => { if (popover && !popover.contains(event.target) && !anchor.contains(event.target)) closePopover(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && popover) { const previous = anchor; closePopover(); previous?.focus({ preventScroll: true }); event.stopPropagation(); }
  if (popover && !event.target.matches('input') && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
    const buttons = [...popover.querySelectorAll('button')]; const index = buttons.indexOf(document.activeElement);
    const next = buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length];
    next?.focus({ preventScroll: true });
    const list = popover.querySelector('.option-list');
    if (list && next && list.contains(next)) {
      const box = next.getBoundingClientRect(), viewport = list.getBoundingClientRect();
      if (box.top < viewport.top) list.scrollTop -= viewport.top - box.top;
      else if (box.bottom > viewport.bottom) list.scrollTop += box.bottom - viewport.bottom;
    }
    event.preventDefault();
  }
});
window.addEventListener('resize', place);
render();
