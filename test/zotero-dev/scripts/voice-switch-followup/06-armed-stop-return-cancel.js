return (async () => {
  const root = Zotero.__ztts95Followup;
  const fixture = root?.fixtures.a;
  if (!root || !fixture?.reader) throw new Error('fixture A is missing');
  const manager = fixture.reader._internalReader?._readAloudManager;
  if (!manager) throw new Error('fixture A manager is missing');
  const readerIndex = (Zotero.Reader._readers || []).indexOf(fixture.reader);
  const targetID = root.voices[1];
  const out = { fixture: 'a', readerIndex, targetID };
  let target = null, targetDescriptor = null, targetGetController = null, node = null, nodeDescriptor = null, nodeStop = null;
  const state = () => root.read(fixture);
  const diag = () => root.diag(fixture);
  try {
    await root.activate(fixture, root.voices[0], true);
    await root.sleep(160);
    const menu = manager.voicesForLanguage || [];
    for (let i = 0; i < menu.length; i++) if (menu[i]?.id === targetID) { target = menu[i]; break; }
    if (!target) throw new Error('target fixture voice is missing');
    const targetWaived = Components.utils.waiveXrays(target);
    targetDescriptor = Object.getOwnPropertyDescriptor(targetWaived, 'getController') ?? null;
    targetGetController = targetWaived.getController;
    const old = manager._controller;
    node = old?._sourceNode;
    if (!old || !node) throw new Error('old native source is missing');
    const nodeWaived = Components.utils.waiveXrays(node);
    nodeDescriptor = Object.getOwnPropertyDescriptor(nodeWaived, 'stop') ?? null;
    nodeStop = nodeWaived.stop;
    if (typeof nodeStop !== 'function') throw new Error('old native source stop is missing');
    fixture.calls.length = 0; fixture.stopCalls.length = 0; fixture.preparedPlays.length = 0; fixture.prepared = null;
    targetWaived.getController = function (...args) {
      const prepared = Reflect.apply(targetGetController, this, args);
      fixture.prepared = prepared;
      return prepared;
    };
    nodeWaived.stop = function (when) {
      fixture.stopCalls.push({ when: Number.isFinite(when) ? when : null, clock: old._audioContext?.currentTime ?? null });
      return Reflect.apply(nodeStop, this, arguments);
    };
    fixture.delayMs = 150; fixture.delayVoiceID = targetID; fixture.failVoiceID = null; fixture.failNext = false; fixture.noTimestamps = false;
    out.before = state();
    out.trigger = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(1, readerIndex));
    const trace = [];
    let returnedToCurrent = false;
    for (let i = 0; i < 40; i++) {
      const d = diag();
      trace.push({ ms: i * 100, state: state(), handoff: d.handoff, stopCalls: fixture.stopCalls.slice() });
      if (d.handoff?.stage === 'word') {
        // Once the early numeric stop is armed, return to the currently
        // selected A through the normal diagnostic path.
        out.returnToCurrent = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(-1, readerIndex));
        returnedToCurrent = true;
        await root.sleep(160);
        out.cancelled = { state: state(), handoff: diag().handoff, stopCalls: fixture.stopCalls.slice() };
        break;
      }
      // On a machine that cannot run a fresh AudioContext, keep the request
      // pending long enough to exercise return-to-current before the bounded
      // resume failure. This still cannot prove the armed-stop reschedule.
      if (i >= 5 && d.handoff?.pending === targetID) {
        out.returnToCurrent = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(-1, readerIndex));
        returnedToCurrent = true;
        await root.sleep(160);
        out.cancelled = { state: state(), handoff: diag().handoff, stopCalls: fixture.stopCalls.slice() };
        break;
      }
      if (d.handoff?.stage === 'failed' || d.handoff?.stage === 'cancelled') break;
      await root.sleep(100);
    }
    out.armed = { state: state(), handoff: diag().handoff, stopCalls: fixture.stopCalls.slice() };
    if (diag().handoff?.stage === 'word') {
      // This is the cancellation under test: the previous step returns from
      // pending target B to the currently selected A.
      out.returnToCurrent = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(-1, readerIndex));
      await root.sleep(160);
      out.cancelled = { state: state(), handoff: diag().handoff, stopCalls: fixture.stopCalls.slice() };
    }
    out.trace = { first: trace[0] ?? null, last: trace.at(-1) ?? null, count: trace.length };
    const armedStops = out.armed.stopCalls ?? [];
    const cancelledStops = out.cancelled?.stopCalls ?? armedStops;
    out.returnedToCurrent = returnedToCurrent;
    out.lateNumericReschedule = !!(out.cancelled && cancelledStops.length > armedStops.length && Number.isFinite(cancelledStops.at(-1)?.when) && Number.isFinite(armedStops[0]?.when) && cancelledStops.at(-1).when > armedStops[0].when);
    out.status = state().audio.state !== 'running' ? 'NOT TESTABLE: fixture AudioContext remained suspended before word arm' : out.lateNumericReschedule && out.cancelled?.handoff?.stage === 'cancelled' ? 'PASS' : 'FAIL';
  } finally {
    fixture.delayMs = 0; fixture.delayVoiceID = null; fixture.failVoiceID = null; fixture.failNext = false; fixture.noTimestamps = false;
    if (target) {
      try { const targetWaived = Components.utils.waiveXrays(target); if (targetDescriptor) Object.defineProperty(targetWaived, 'getController', targetDescriptor); else delete targetWaived.getController; } catch (e) { out.restoreTargetError = String(e); }
    }
    if (node) {
      try { const nodeWaived = Components.utils.waiveXrays(node); if (nodeDescriptor) Object.defineProperty(nodeWaived, 'stop', nodeDescriptor); else delete nodeWaived.stop; } catch (e) { out.restoreNodeError = String(e); }
    }
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
  }
  return JSON.stringify(out, null, 1);
})()
