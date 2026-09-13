(async () => {
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  const doc = win?.document;
  const box = doc?.getElementById('ztts-strip-angle-brackets');
  const input = doc?.getElementById('ztts-bracket-pairs');
  if (!win || !box || !input) return JSON.stringify({ error: 'bracket controls missing' });
  const wait = ms => new Promise(resolve => win.setTimeout(resolve, ms));
  const state = () => ({
    enabled: Zotero.Prefs.get('zotero-tts.readAloud.stripAngleBrackets'),
    pairs: Zotero.Prefs.get('zotero-tts.readAloud.bracketPairs'),
    checked: !!box.checked,
    inputValue: input.value,
    inputDisabled: !!input.disabled,
  });
  const triggerAndCancel = async value => {
    input.value = value;
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
    box.checked = true;
    box.dispatchEvent(new win.Event('command', { bubbles: true }));
    let dialog = null;
    for (let i = 0; i < 30; i++) {
      dialog = doc.getElementById('ztts-notice');
      if (dialog) break;
      await wait(20);
    }
    if (!dialog) return { value, error: 'dialog missing', after: state() };
    const text = (dialog.textContent || '').replace(/\\s+/g, ' ').trim();
    const buttons = Array.from(dialog.querySelectorAll('button')).map(button => button.textContent || '');
    const cancel = dialog.querySelectorAll('button')[1];
    cancel?.click();
    await wait(30);
    return { value, text, buttons, after: state() };
  };
  if (box.checked) {
    box.checked = false;
    box.dispatchEvent(new win.Event('command', { bubbles: true }));
    await wait(20);
  }
  const before = state();
  const oneChar = await triggerAndCancel('<');
  const sameChars = await triggerAndCancel('**');
  input.value = '<> []';
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
  box.checked = true;
  box.dispatchEvent(new win.Event('command', { bubbles: true }));
  await wait(30);
  return JSON.stringify({ before, oneChar, sameChars, restored: state() }, null, 1);
})()
