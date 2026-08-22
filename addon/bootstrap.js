/* eslint-env browser */
/* global Zotero, Services */

// See spec §2.10 for the sandbox globals. Only whitelisted items may be used here.

function install() {}

function uninstall() {}

async function startup({ id, version, rootURI }, reason) {
  Services.scriptloader.loadSubScript(rootURI + 'content/zotero-tts.js');
  await Zotero.ZoteroTTS.startup({ id, version, rootURI });
}

async function shutdown({ id, version, rootURI }, reason) {
  await Zotero.ZoteroTTS?.shutdown();
  Zotero.ZoteroTTS = undefined;
}

// Called by Zotero for every main window opened after startup; the speed
// shortcuts need a key listener on each one.
function onMainWindowLoad({ window }) {
  Zotero.ZoteroTTS?.onMainWindowLoad(window);
}

function onMainWindowUnload({ window }) {
  Zotero.ZoteroTTS?.onMainWindowUnload(window);
}
