// Two screenshots for a human to judge issue #112's headings (the brief's
// C3): the pane's top (Azure/Cloudflare/Fish/Fish Speech headings visible)
// and the Zotero section, each a PNG saved under .tmp/zotero-dev/screenshots/
// via drawSnapshot -> OffscreenCanvas -> IOUtils.write (driving notes Sec5).
// drawSnapshot returns a PROMISE of an ImageBitmap in this Firefox, not the
// bitmap itself -- awaiting it is required, or drawImage throws
// "Argument 1 could not be converted" (found the hard way). Requires the
// settings window already open on the zotero-tts pane (run
// 01-heading-links.js first, or open it directly); does not close the
// window itself.
// params: none. state: none written; standalone.
(async () => {
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win) throw new Error('settings window is not open -- open it on the zotero-tts pane first');
  const doc = win.document;
  const outDir = Zotero.ZoteroTTSRun.params.tmpDir + (Zotero.isWin ? '\\screenshots' : '/screenshots');
  await IOUtils.makeDirectory(outDir, { ignoreExisting: true, createAncestors: true });
  const sep = Zotero.isWin ? '\\' : '/';

  async function snap(filename) {
    const domRect = new win.DOMRect(0, 0, win.innerWidth, win.innerHeight);
    const snapshot = await win.browsingContext.currentWindowGlobal.drawSnapshot(domRect, 1, 'rgb(255,255,255)');
    const canvas = new win.OffscreenCanvas(win.innerWidth, win.innerHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(snapshot, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const buf = await blob.arrayBuffer();
    const path = outDir + sep + filename;
    await IOUtils.write(path, new Uint8Array(buf));
    return path;
  }

  win.scrollTo(0, 0);
  const azureSection = doc.getElementById('ztts-provider-azure');
  if (azureSection) azureSection.scrollIntoView({ block: 'start' });
  await new Promise((r) => setTimeout(r, 200));
  const topPath = await snap('settings-pane-top-c112.png');

  const zoteroSection = doc.getElementById('ztts-zotero-section');
  if (zoteroSection) zoteroSection.scrollIntoView({ block: 'start' });
  await new Promise((r) => setTimeout(r, 200));
  const zoteroPath = await snap('settings-pane-zotero-section-c112.png');

  return JSON.stringify({ topPath, zoteroPath, innerWidth: win.innerWidth, innerHeight: win.innerHeight });
})();
