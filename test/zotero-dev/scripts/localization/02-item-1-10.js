// Item 1.10: the strings resolve in the sandbox, read-only, no settings
// window needed. startup()'s "strings" and "own strings source" steps;
// diagnostics.l10n()'s source/appLocales/sample/fallback/registry/formatted;
// the plugin's own Fluent source from chrome scope (issue #64); the "own
// strings source" debug line this install's startup wrote (00-before-fix.js
// turns the debug store on before the install for this).
(async () => {
  const out = { check: '02-item-1.10' };

  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  out.startupVersion = startup.version;
  out.startupFailed = startup.failed;
  const steps = startup.steps || [];
  out.stringsStepOk = steps.find((s) => s.name === 'strings')?.ok ?? null;
  out.ownStringsSourceStepOk = steps.find((s) => s.name === 'own strings source')?.ok ?? null;
  out.ownStringsSourceStepIndex = steps.findIndex((s) => s.name === 'own strings source');

  const l10n = JSON.parse(await Zotero.ZoteroTTS.diagnostics.l10n());
  out.source = l10n.source;
  out.appLocales = l10n.appLocales;
  out.zoteroLocale = l10n.zoteroLocale;
  out.sample = l10n.sample;
  out.fallback = l10n.fallback;
  out.registry = l10n.registry;
  out.formatted = l10n.formatted;

  try {
    const reg = L10nRegistry.getInstance();
    out.ownSourceHasFileEnUS = reg.hasSource('zotero-tts') ? reg.getSource('zotero-tts').hasFile('en-US', 'zotero-tts.ftl') : 'no source';
  } catch (e) {
    out.ownSourceHasFileEnUSError = String(e);
  }

  try {
    const loc = new Localization(['zotero-tts.ftl'], true);
    out.chromeSyncSample = loc.formatValueSync('ztts-heading-sync');
  } catch (e) {
    out.chromeSyncSampleError = String(e);
  }

  try {
    const debugText = await Zotero.Debug.get();
    const lines = String(debugText)
      .split('\n')
      .filter((l) => l.includes('own strings source'));
    out.ownStringsSourceLogLines = lines.slice(-3);
  } catch (e) {
    out.debugGetError = String(e);
  }

  return JSON.stringify(out);
})()
