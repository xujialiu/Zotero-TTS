// secret-fields item 5 (by eye, a human only): geometry and a screenshot
// to judge it from, since zotero_screenshot's target:"window" does not
// resolve the preferences window here (checked separately by the tester,
// not from this script) -- the same drawSnapshot -> OffscreenCanvas ->
// IOUtils.write path settings-pane/02-screenshots.js used for the pane
// (driving notes Sec5). Reports, for an unlocked row (Cloudflare's API
// token, eye enabled) and a locked one (Fish Audio's API key, eye
// disabled): the field/eye/help rects, whether the eye sits between them
// on the row's centre line, the eye's computed mask-image (on/off state)
// and color, and whether an empty Extra headers field still shows its
// placeholder text under the mask.
// Requires the settings window already open on the plugin's pane.
// params: tmpDir. state: none written.
(async () => {
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win) throw new Error('settings window is not open -- run 01-secrets-static.js first');
  const doc = win.document;

  function rowGeometry(secretPref) {
    const input = Array.from(doc.querySelectorAll('input.ztts-secret')).find((el) => el.getAttribute('preference') === secretPref);
    if (!input) return { present: false };
    const eye = input.nextElementSibling && input.nextElementSibling.getAttribute('class') === 'ztts-reveal' ? input.nextElementSibling : null;
    const help = eye && eye.nextElementSibling && eye.nextElementSibling.classList?.contains('ztts-help') ? eye.nextElementSibling : null;
    const r = (el) => (el ? el.getBoundingClientRect() : null);
    const inputRect = r(input);
    const eyeRect = r(eye);
    const helpRect = r(help);
    const style = eye ? win.getComputedStyle(eye) : null;
    const rowCentre = inputRect ? inputRect.top + inputRect.height / 2 : null;
    return {
      present: true,
      inputRect: inputRect && { top: inputRect.top, bottom: inputRect.bottom, left: inputRect.left, right: inputRect.right, height: inputRect.height },
      eyeRect: eyeRect && { top: eyeRect.top, bottom: eyeRect.bottom, left: eyeRect.left, right: eyeRect.right, height: eyeRect.height },
      helpRect: helpRect && { top: helpRect.top, bottom: helpRect.bottom, left: helpRect.left, right: helpRect.right, height: helpRect.height },
      eyeBetweenFieldAndHelp: !!(eyeRect && helpRect && eyeRect.left >= inputRect.right - 1 && helpRect.left >= eyeRect.right - 1),
      rowCentre,
      eyeCentreOnRowCentre: eyeRect ? Math.abs(eyeRect.top + eyeRect.height / 2 - rowCentre) < 1.5 : null,
      eyeDisabledAttr: eye ? eye.disabled : null,
      eyeMaskImage: style ? style.maskImage || style.webkitMaskImage : null,
      eyeBackgroundColor: style ? style.backgroundColor : null,
      eyeOpacity: style ? style.opacity : null,
      placeholder: input.placeholder || null,
      valueLength: input.value.length,
    };
  }

  // matchMedia is the reliable read: an early version of this script tried
  // a theme/lwtheme-brighttext attribute and got a false negative in a
  // profile the screenshot below proves was dark (found this run).
  const out = { theme: { dark: win.matchMedia('(prefers-color-scheme: dark)').matches } };
  out.unlockedRow = rowGeometry('extensions.zotero.zotero-tts.cloudflare.apiToken'); // cloudflare is off
  out.lockedRow = rowGeometry('extensions.zotero.zotero-tts.fish.apiKey'); // fish is on
  out.emptyHeadersRow = rowGeometry('extensions.zotero.zotero-tts.local.headers'); // placeholder check

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

  const cfSection = doc.getElementById('ztts-provider-cloudflare');
  if (cfSection) cfSection.scrollIntoView({ block: 'start' });
  await new Promise((r) => setTimeout(r, 200));
  const cfRect = cfSection.getBoundingClientRect();
  out.cloudflarePath = await snap('secret-fields-cloudflare-unlocked.png', new win.DOMRect(0, Math.max(0, cfRect.top - 10), win.innerWidth, 160));

  const fishSection = doc.getElementById('ztts-provider-fish');
  if (fishSection) fishSection.scrollIntoView({ block: 'start' });
  await new Promise((r) => setTimeout(r, 200));
  const fishRect = fishSection.getBoundingClientRect();
  out.fishPath = await snap('secret-fields-fish-locked.png', new win.DOMRect(0, Math.max(0, fishRect.top - 10), win.innerWidth, 160));

  out.innerWidth = win.innerWidth;
  out.innerHeight = win.innerHeight;
  return JSON.stringify(out, null, 1);
})();
