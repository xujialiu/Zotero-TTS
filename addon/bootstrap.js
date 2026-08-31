/* eslint-env browser */
/* global Zotero, Services */

// See spec §2.10 for the sandbox globals. Only whitelisted items may be used here.

function install() {}

function uninstall() {}

// A reload is a disable and an enable whose listeners do not wait for each
// other (xpcom/plugins.js onDisabled / onEnabling): the old instance's
// shutdown() can still be pending — the position store closing its
// database — when the new bundle is evaluated and takes Zotero.ZoteroTTS.
// So startup() waits for a shutdown still in flight, and shutdown() clears
// only the global of the instance it stopped; the pending promise is parked
// on Zotero, the one object both scopes share (issue #28). It never
// rejects: a failing shutdown is logged and cannot keep the next startup
// from running.
async function startup({ id, version, rootURI }, reason) {
  await Zotero.ZoteroTTSPendingShutdown;
  Services.scriptloader.loadSubScript(rootURI + 'content/zotero-tts.js');
  await Zotero.ZoteroTTS.startup({ id, version, rootURI });
}

async function shutdown({ id, version, rootURI }, reason) {
  const instance = Zotero.ZoteroTTS;
  const pending = (async () => {
    try {
      await instance?.shutdown();
    } catch (e) {
      Zotero.logError(e);
    } finally {
      if (Zotero.ZoteroTTS === instance) Zotero.ZoteroTTS = undefined;
    }
  })();
  Zotero.ZoteroTTSPendingShutdown = pending;
  try {
    await pending;
  } finally {
    if (Zotero.ZoteroTTSPendingShutdown === pending) Zotero.ZoteroTTSPendingShutdown = undefined;
  }
}

// Called by Zotero for every main window opened after startup; the speed
// shortcuts need a key listener on each one.
function onMainWindowLoad({ window }) {
  Zotero.ZoteroTTS?.onMainWindowLoad(window);
}

function onMainWindowUnload({ window }) {
  Zotero.ZoteroTTS?.onMainWindowUnload(window);
}
