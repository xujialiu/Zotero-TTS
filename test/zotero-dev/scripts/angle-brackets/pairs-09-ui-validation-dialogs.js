(async () => {
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  const doc = win?.document;
  const box = doc?.getElementById('ztts-strip-angle-brackets');
  const input = doc?.getElementById('ztts-bracket-pairs');
  if (!win || !box || !input) return JSON.stringify({ error: 'bracket controls missing' });
  const wait = ms => new Promise(resolve => win.setTimeout(resolve, ms));
  const state = () => ({
    prefEnabled: Zotero.Prefs.get('zotero-tts.readAloud.stripAngleBrackets'),
    enabledUser: Services.prefs.prefHasUserValue('extensions.zotero.zotero-tts.readAloud.stripAngleBrackets'),
    prefPairs: Zotero.Prefs.get('zotero-tts.readAloud.bracketPairs'),
    pairsUser: Services.prefs.prefHasUserValue('extensions.zotero.zotero-tts.readAloud.bracketPairs'),
    checked: !!box.checked,
    checkboxDisabled: !!box.disabled,
    inputValue: input.value,
    inputDisabled: !!input.disabled,
  });
  const dispatchInput = value => {
    input.value = value;
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
  };
  const dispatchCommand = () => box.dispatchEvent(new win.Event('command', { bubbles: true }));
  const showInvalid = async (value, action) => {
    dispatchInput(value);
    box.checked = true;
    dispatchCommand();
    let dialog = null;
    for (let i = 0; i < 30; i++) {
      dialog = doc.getElementById('ztts-notice');
      if (dialog) break;
      await wait(20);
    }
    if (!dialog) return { value, action, error: 'dialog missing', after: state() };
    const buttons = Array.from(dialog.querySelectorAll('button')).map(button => button.textContent || button.getAttribute('label') || '');
    const text = (dialog.textContent || '').replace(/\\s+/g, ' ').trim();
    const result = { value, action, text, buttons, beforeAction: state() };
    const index = action === 'defaults' ? 0 : 1;
    const button = dialog.querySelectorAll('button')[index];
    if (!button) return { ...result, error: 'button missing', after: state() };
    button.click();
    await wait(30);
    result.after = state();
    return result;
  };
  const initial = state();
  box.checked = false;
  dispatchCommand();
  await wait(20);
  const disabled = state();
  const empty = await showInvalid('', 'cancel');
  const entry = await showInvalid('aa', 'cancel');
  const duplicateCancel = await showInvalid('<> <>', 'cancel');
  const duplicateDefaults = await showInvalid('<> <>', 'defaults');
  return JSON.stringify({ initial, disabled, dialogs: { empty, entry, duplicateCancel, duplicateDefaults }, final: state() }, null, 1);
})()
