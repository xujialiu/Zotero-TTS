/* eslint-env browser */
/* global Zotero, Services */

// 沙箱全局见 spec §2.10。这里只允许用白名单内的东西。

function install() {}

function uninstall() {}

async function startup({ id, version, rootURI }) {
  Services.scriptloader.loadSubScript(rootURI + 'content/zotero-tts.js');
  await Zotero.ZoteroTTS.startup({ id, version, rootURI });
}

async function shutdown() {
  await Zotero.ZoteroTTS?.shutdown();
  Zotero.ZoteroTTS = undefined;
}
