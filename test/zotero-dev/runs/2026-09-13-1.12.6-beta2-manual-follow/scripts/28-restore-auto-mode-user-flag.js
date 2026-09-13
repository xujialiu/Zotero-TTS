return (() => {
  const name = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const entry = Zotero.__ztts100Baseline?.prefs?.['readAloud.autoScrollMode'];
  const defaults = Services.prefs.getDefaultBranch('');
  const defaultValue = defaults.getStringPref(name, 'sentence');
  if (entry?.user) {
    if (entry.value === defaultValue) {
      defaults.setStringPref(name, '__ztts100_temporary_default__');
      Services.prefs.setStringPref(name, entry.value);
      defaults.setStringPref(name, defaultValue);
    } else Services.prefs.setStringPref(name, entry.value);
  } else if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name);
  return JSON.stringify({ value: Services.prefs.getStringPref(name, '<none>'), user: Services.prefs.prefHasUserValue(name), expectedValue: entry?.value ?? null, expectedUser: entry?.user ?? false, default: defaults.getStringPref(name, '<none>') });
})()
