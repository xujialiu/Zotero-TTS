// secret-fields item 5 (by eye, a human only): geometry and screenshots for
// the eye moved INSIDE the field (beta3, commit 23dcbf9) -- supersedes the
// beta2 version of this script, whose eyeBetweenFieldAndHelp assumed the
// old outside placement. Reports, for an unlocked row (Cloudflare's API
// token), a locked one (Fish Audio's API key) and a full unlocked one
// (Local's Extra headers, 151 chars): the field/eye/help rects, whether the
// eye's own box sits inside the field with its right edge ~4px in from the
// field's own right border and vertically centred on the field (the CSS's
// own arithmetic -- see preferences.css's comment on button.ztts-reveal);
// the field's reserved end padding (no dot should run under the eye); and
// the eye's computed mask-image/opacity/disabled/position. Also compares
// the '?' label's x against a plain field with no eye (OpenAI Compatible's
// Address row) and a secret row's own hbox height against a plain row's in
// the same section, to confirm the control still advances the row by
// nothing. Screenshots go through drawSnapshot (driving notes Sec5), since
// zotero_screenshot's target:"window"/"element" are checked separately by
// the tester, not from this script.
// Requires the settings window already open on the plugin's pane.
// params: tmpDir. state: none written.
(async () => {
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win) throw new Error('settings window is not open -- run 01-secrets-static.js first');
  const doc = win.document;
  const EPS = 1; // px tolerance for subpixel rounding

  function rectOf(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width };
  }

  function findInput(pref) {
    return Array.from(doc.querySelectorAll('input[preference]')).find((el) => el.getAttribute('preference') === pref) || null;
  }

  function secretRowGeometry(secretPref) {
    const input = findInput(secretPref);
    if (!input) return { present: false };
    const eye = input.nextElementSibling && input.nextElementSibling.getAttribute('class') === 'ztts-reveal' ? input.nextElementSibling : null;
    const help = eye && eye.nextElementSibling && eye.nextElementSibling.classList?.contains('ztts-help') ? eye.nextElementSibling : null;
    const inputRect = rectOf(input);
    const eyeRect = rectOf(eye);
    const helpRect = rectOf(help);
    const eyeStyle = eye ? win.getComputedStyle(eye) : null;
    const inputStyle = win.getComputedStyle(input);
    const rowEl = input.closest('hbox');
    return {
      present: true,
      inputRect,
      eyeRect,
      helpRect,
      eyeInsideField: eyeRect ? (eyeRect.left >= inputRect.left - EPS && eyeRect.right <= inputRect.right + EPS) : null,
      insetFromRightBorder: eyeRect ? +(inputRect.right - eyeRect.right).toFixed(2) : null, // expect ~4
      eyeCentreOnField: eyeRect ? Math.abs((eyeRect.top + eyeRect.height / 2) - (inputRect.top + inputRect.height / 2)) < EPS : null,
      helpOffsetFromInputRight: helpRect ? +(helpRect.left - inputRect.right).toFixed(2) : null, // expect ~5, same as a row with no eye
      rowHeight: rowEl ? rectOf(rowEl).height : null,
      eyePosition: eyeStyle ? eyeStyle.position : null,
      eyeDisabledAttr: eye ? eye.disabled : null,
      eyeMaskImage: eyeStyle ? (eyeStyle.maskImage || eyeStyle.webkitMaskImage) : null,
      eyeBackgroundColor: eyeStyle ? eyeStyle.backgroundColor : null,
      eyeOpacity: eyeStyle ? eyeStyle.opacity : null,
      inputPaddingInlineEnd: inputStyle.paddingInlineEnd || inputStyle.paddingRight,
      inputFontSizePx: parseFloat(inputStyle.fontSize),
      placeholder: input.placeholder || null,
      valueLength: input.value.length,
    };
  }

  function plainRowGeometry(pref) {
    const input = findInput(pref);
    if (!input) return { present: false };
    const nextClass = input.nextElementSibling ? input.nextElementSibling.getAttribute('class') : null;
    const help = nextClass === 'ztts-help'
      ? input.nextElementSibling
      : (input.nextElementSibling?.nextElementSibling?.classList?.contains('ztts-help') ? input.nextElementSibling.nextElementSibling : null);
    const inputRect = rectOf(input);
    const helpRect = rectOf(help);
    const rowEl = input.closest('hbox');
    return {
      present: true,
      hasEye: nextClass === 'ztts-reveal',
      inputRect,
      helpRect,
      helpOffsetFromInputRight: helpRect ? +(helpRect.left - inputRect.right).toFixed(2) : null,
      rowHeight: rowEl ? rectOf(rowEl).height : null,
    };
  }

  const out = { theme: { dark: win.matchMedia('(prefers-color-scheme: dark)').matches } };
  out.unlockedRow = secretRowGeometry('extensions.zotero.zotero-tts.cloudflare.apiToken'); // cloudflare is off
  out.lockedRow = secretRowGeometry('extensions.zotero.zotero-tts.fish.apiKey'); // fish is on
  out.fullHeadersRow = secretRowGeometry('extensions.zotero.zotero-tts.local.headers'); // 151 chars, local is off
  out.plainAddressRow = plainRowGeometry('extensions.zotero.zotero-tts.compatible.baseURL'); // no eye, has its own '?'

  out.helpAlignment = {
    // expect both ~0: the '?' after a secret row's field and after a plain
    // one land at the same x (preferences.css's own arithmetic -- the
    // eye's pullback plus its own end margin advances the row by nothing)
    unlockedVsPlain: out.unlockedRow.helpRect && out.plainAddressRow.helpRect ? +(out.unlockedRow.helpRect.left - out.plainAddressRow.helpRect.left).toFixed(2) : null,
    lockedVsPlain: out.lockedRow.helpRect && out.plainAddressRow.helpRect ? +(out.lockedRow.helpRect.left - out.plainAddressRow.helpRect.left).toFixed(2) : null,
  };

  const accountIdRow = plainRowGeometry('extensions.zotero.zotero-tts.cloudflare.accountId'); // same section, no secret, no eye, no help
  out.rowHeightDelta = accountIdRow.rowHeight != null && out.unlockedRow.rowHeight != null
    ? +(out.unlockedRow.rowHeight - accountIdRow.rowHeight).toFixed(2) // expect ~0: row height unchanged from a row without an eye
    : null;

  // Screenshot, via drawSnapshot -- zotero_screenshot's own window/element
  // targets are checked by the tester outside this script.
  const outDir = Zotero.ZoteroTTSRun.params.tmpDir + (Zotero.isWin ? '\\screenshots' : '/screenshots');
  await IOUtils.makeDirectory(outDir, { ignoreExisting: true, createAncestors: true });
  const sep = Zotero.isWin ? '\\' : '/';
  async function snap(filename, rect) {
    const domRect = rect || new win.DOMRect(0, 0, win.innerWidth, win.innerHeight);
    const snapshot = await win.browsingContext.currentWindowGlobal.drawSnapshot(domRect, 2, 'rgb(255,255,255)');
    const canvas = new win.OffscreenCanvas(domRect.width * 2, domRect.height * 2);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(snapshot, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const buf = await blob.arrayBuffer();
    const path = outDir + sep + filename;
    await IOUtils.write(path, new Uint8Array(buf));
    return path;
  }

  async function snapSection(id, filename, height) {
    const section = doc.getElementById(id);
    if (!section) return null;
    section.scrollIntoView({ block: 'start' });
    await new Promise((r) => setTimeout(r, 200));
    const rect = section.getBoundingClientRect();
    return snap(filename, new win.DOMRect(0, Math.max(0, rect.top - 10), win.innerWidth, height));
  }

  out.cloudflarePath = await snapSection('ztts-provider-cloudflare', 'secret-fields-cloudflare-unlocked.png', 160);
  out.fishPath = await snapSection('ztts-provider-fish', 'secret-fields-fish-locked.png', 160);
  out.localFullPath = await snapSection('ztts-provider-local', 'secret-fields-local-full.png', 160);

  out.innerWidth = win.innerWidth;
  out.innerHeight = win.innerHeight;
  return JSON.stringify(out, null, 1);
})();
