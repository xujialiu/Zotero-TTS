// Item 3 (issue #113): Test connection, one section at a time, nothing
// switched on. Reuses the pane 02-pane-structure-item2.js left open. Each
// click is captured with an http-on-modify-request observer (masked host,
// path + method only -- never the address) so the report can say which
// route was hit without ever naming the server. The OpenAI Compatible
// address is emptied for one click and restored right after, from the
// live input's own value (never a param, never printed).
// NOTE (2026-09-16 run): a critical bug found in item 1 (migration re-runs
// on every in-place reinstall and wipes mimo/compatible) means mimo.apiKey
// and compatible.* are blank on THIS run, not the freshly-migrated values
// the case assumed -- so the mimo/compatible "Connected..." success paths
// are not reachable here. This script still captures whatever the pane
// actually shows, which remains useful evidence for the no-key/no-address
// message wording.
// params: none. state: reads nothing; writes item3 (this script's own
// output, for the record only).
(async () => {
  const out = { step: 'test-connections-item3' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win) throw new Error('settings window is not open -- run 02-pane-structure-item2.js first');
  const doc = win.document;

  function captureRequests(fn) {
    const seen = [];
    const observer = {
      observe(subject) {
        try {
          const channel = subject.QueryInterface(Components.interfaces.nsIHttpChannel);
          const uri = channel.URI;
          let auth = null, cfid = null;
          try { auth = !!channel.getRequestHeader('Authorization'); } catch (e) { auth = false; }
          try { cfid = !!channel.getRequestHeader('CF-Access-Client-Id'); } catch (e) { cfid = false; }
          seen.push({ __host: uri.host, method: channel.requestMethod, path: uri.pathQueryRef, hasAuth: auth, hasCfAccessId: cfid });
        } catch (e) { /* not an HTTP channel we can read */ }
      },
    };
    Services.obs.addObserver(observer, 'http-on-modify-request');
    return async () => {
      const r = await fn();
      Services.obs.removeObserver(observer, 'http-on-modify-request');
      // Mask hosts to stable tags without ever naming them.
      const tags = new Map();
      const masked = seen.map((s) => {
        if (!tags.has(s.__host)) tags.set(s.__host, 'host' + tags.size);
        return { host: tags.get(s.__host), method: s.method, path: s.path, hasAuth: s.hasAuth, hasCfAccessId: s.hasCfAccessId };
      });
      return { result: r, requests: masked };
    };
  }

  async function testSection(id) {
    const button = doc.getElementById('ztts-test-' + id);
    const result = doc.getElementById('ztts-test-result-' + id);
    if (!button || !result) throw new Error('Test connection row for ' + id + ' not found');
    const before = result.textContent;
    const run = captureRequests(async () => {
      button.click();
      const trace = [];
      const t0 = Date.now();
      let sawTesting = false;
      while (Date.now() - t0 < 20000) {
        const text = result.textContent;
        trace.push({ t: Date.now() - t0, text });
        if (text && /testing|检查|检测/i.test(text)) sawTesting = true;
        // Break on "was Testing…, now settled" rather than "text changed from
        // before" -- a second click that lands on the SAME final message as
        // the previous one (found live 2026-09-16: compatible's empty-address
        // click after compatible's own no-address click) never satisfies
        // "text !== before" and used to run the full 20s poll for nothing.
        if (text && sawTesting && !button.disabled && !/testing/i.test(text)) break;
        await sleep(150);
      }
      return { before, sawTesting, finalText: result.textContent, traceFirst: trace[0] || null, traceLast: trace[trace.length - 1] || null, traceCount: trace.length };
    });
    return await run();
  }

  try {
    out.openaiOfficial = await testSection('openai-official');
    out.mimo = await testSection('mimo');
    out.compatible = await testSection('compatible');

    // Address emptied on OpenAI Compatible, temporarily, restored right after.
    const addressInput = doc.querySelector('#ztts-provider-compatible input[preference$=".baseURL"]');
    if (!addressInput) throw new Error('no address input for compatible');
    const originalAddress = addressInput.value;
    out.compatibleAddressOriginalLength = originalAddress.length;
    addressInput.value = '';
    addressInput.dispatchEvent(new win.Event('change', { bubbles: true }));
    await sleep(200);
    out.compatibleEmptyAddress = await testSection('compatible');
    // Restore right after, from the input's own prior value -- never a param.
    addressInput.value = originalAddress;
    addressInput.dispatchEvent(new win.Event('change', { bubbles: true }));
    await sleep(200);
    out.compatibleAddressRestoredLength = addressInput.value.length;
    out.compatibleAddressRestored = addressInput.value === originalAddress;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  Zotero.ZoteroTTSRun.state.item3 = out;
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
