(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  if (!state.backup?.docs || !state.fixtures?.A || !state.fixtureC) throw new Error('exported backup state missing');
  const sentinel = { voice: { id: state.voices.A.id, lang: state.voices.A.lang }, manual: true, ts: Date.now() + 20000 };
  Services.prefs.setStringPref(prefix + 'readAloud.defaultVoice', JSON.stringify({ id: state.voices.A.id, lang: state.voices.A.lang }));
  for (const key of [`documentVoices.user/${state.fixtures.A.key}`, `documentVoices.user/${state.fixtures.B.key}`, `documentVoices.user/${state.fixtureC.key}`]) Services.prefs.setStringPref(prefix + key, JSON.stringify(sentinel));
  Services.prefs.setStringPref(prefix + 'documentVoiceChanged', String(Number(Services.prefs.getStringPref(prefix + 'documentVoiceChanged', '0')) + 1));
  const current = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  return JSON.stringify({ status: 'PASS', mutatedDefault: current.defaultVoice, mutatedRecords: current.records, settingsWindow: !!Services.wm.getMostRecentWindow('zotero:pref') }, null, 1);
})();
