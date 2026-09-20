// secret-fields item 2: the eye on an unlocked field (cloudflare is off in
// this profile) uncovers it and covers it again, moving no other field.
// Requires the settings window already open on the plugin's pane
// (01-secrets-static.js, or opened by hand).
// params: none. state: reads nothing; writes nothing durable (the reveal
// itself is never persisted -- ui/secret-rows.ts -- so there is nothing to
// restore on this field beyond leaving it covered, which the script does).
(async () => {
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win) throw new Error('settings window is not open -- run 01-secrets-static.js first');
  const doc = win.document;
  const targetPref = 'extensions.zotero.zotero-tts.cloudflare.apiToken';
  const input = Array.from(doc.querySelectorAll('input.ztts-secret')).find((el) => el.getAttribute('preference') === targetPref);
  if (!input) throw new Error('target field not found: ' + targetPref);
  const eye = input.nextElementSibling;
  if (!eye || eye.getAttribute('class') !== 'ztts-reveal') throw new Error('eye not found for target field');
  if (eye.disabled) throw new Error('target field is locked -- pick a provider that is off');

  const secretsOf = (pref) => JSON.parse(Zotero.ZoteroTTS.diagnostics.secrets()).fields;
  const before = secretsOf();
  const beforeRow = before.find((f) => f.pref === 'cloudflare.apiToken');

  eye.click();
  const afterClick1 = secretsOf();
  const row1 = afterClick1.find((f) => f.pref === 'cloudflare.apiToken');

  eye.click();
  const afterClick2 = secretsOf();
  const row2 = afterClick2.find((f) => f.pref === 'cloudflare.apiToken');

  const othersBefore = JSON.stringify(before.filter((f) => f.pref !== 'cloudflare.apiToken'));
  const others1 = JSON.stringify(afterClick1.filter((f) => f.pref !== 'cloudflare.apiToken'));
  const others2 = JSON.stringify(afterClick2.filter((f) => f.pref !== 'cloudflare.apiToken'));

  return JSON.stringify(
    {
      target: 'cloudflare.apiToken',
      before: beforeRow,
      afterFirstClick: row1,
      afterSecondClick: row2,
      lengthUnchanged: beforeRow.length === row1.length && row1.length === row2.length,
      firstClickOk: row1.revealed === true && row1.textSecurity === 'none' && row1.eye.pressed === 'true',
      secondClickOk: row2.revealed === false && row2.textSecurity === 'disc' && row2.eye.pressed === 'false',
      otherFieldsUnmovedAfterFirstClick: others1 === othersBefore,
      otherFieldsUnmovedAfterSecondClick: others2 === othersBefore,
    },
    null,
    1,
  );
})();
