return (async () => {
  const root = Zotero.__ztts95Followup;
  const fixture = root?.fixtures.a;
  if (!root || !fixture?.reader) throw new Error('fixture A is missing');
  const manager = fixture.reader._internalReader?._readAloudManager;
  const internal = fixture.reader._internalReader;
  if (!manager || !internal) throw new Error('fixture A manager is missing');
  const sleep = root.sleep;
  const readerIndex = (Zotero.Reader._readers || []).indexOf(fixture.reader);
  const diag = () => root.diag(fixture);
  const state = () => root.read(fixture);
  const targetID = root.voices[1];
  const out = { fixture: 'a', readerIndex, targetID };
  let target = null;
  let targetDescriptor = null;
  let targetGetController = null;
  let node = null;
  let nodeDescriptor = null;
  let nodeStop = null;
  try {
    await root.activate(fixture, root.voices[0], true);
    await sleep(250);
    const menu = manager.voicesForLanguage || [];
    for (let i = 0; i < menu.length; i++) if (menu[i]?.id === targetID) { target = menu[i]; break; }
    if (!target) throw new Error('target fixture voice is missing from the filtered menu');
    const targetWaived = Components.utils.waiveXrays(target);
    targetDescriptor = Object.getOwnPropertyDescriptor(targetWaived, 'getController') ?? null;
    targetGetController = targetWaived.getController;
    if (typeof targetGetController !== 'function') throw new Error('target getController is missing');
    targetWaived.getController = function (...args) {
      const prepared = Reflect.apply(targetGetController, this, args);
      fixture.prepared = prepared;
      try {
        const preparedWaived = Components.utils.waiveXrays(prepared);
        const playDescriptor = Object.getOwnPropertyDescriptor(preparedWaived, '_playAudioBuffer') ?? null;
        const nativePlay = preparedWaived._playAudioBuffer;
        if (typeof nativePlay === 'function') {
          preparedWaived._playAudioBuffer = function (...playArgs) {
            fixture.preparedPlays.push({ index: prepared._position, offset: playArgs[1] ?? null });
            return Reflect.apply(nativePlay, this, playArgs);
          };
          fixture.preparedPlayDescriptor = playDescriptor;
        }
      } catch (e) { fixture.preparedWrapError = String(e); }
      return prepared;
    };
    const old = manager._controller;
    node = old?._sourceNode;
    if (!old || !node) throw new Error('old native source is missing before handoff');
    const nodeWaived = Components.utils.waiveXrays(node);
    nodeDescriptor = Object.getOwnPropertyDescriptor(nodeWaived, 'stop') ?? null;
    nodeStop = nodeWaived.stop;
    if (typeof nodeStop !== 'function') throw new Error('old native source stop is missing');
    fixture.calls.length = 0;
    fixture.stopCalls.length = 0;
    fixture.preparedPlays.length = 0;
    fixture.prepared = null;
    fixture.delayMs = 500;
    fixture.delayVoiceID = targetID;
    nodeWaived.stop = function (when) {
      fixture.stopCalls.push({ when: Number.isFinite(when) ? when : null, clock: old._audioContext?.currentTime ?? null });
      return Reflect.apply(nodeStop, this, arguments);
    };
    out.before = state();
    out.highlightBefore = (() => {
      const view = internal._primaryView;
      const s = view?._readAloudState;
      const timestamp = manager.activeTimestamp;
      return {
        timestamp: timestamp ? { ...timestamp, text: String(s?.activeSegment?.text ?? '').slice(timestamp.charStart, timestamp.charEnd) } : null,
        position: s?.activeWordSourcePosition ? { pageIndex: s.activeWordSourcePosition.pageIndex, rects: s.activeWordSourcePosition.rects } : null,
        primaryIdentity: !!(view?._readAloudHighlightedPosition && view._readAloudHighlightedPosition === s?.activeWordSourcePosition),
      };
    })();
    out.trigger = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(1, readerIndex));
    const trace = [];
    for (let i = 0; i < 36; i++) {
      trace.push({ ms: i * 100, state: state(), handoff: diag().handoff });
      if (['committed', 'failed', 'cancelled'].includes(diag().handoff?.stage)) break;
      await sleep(100);
    }
    out.trace = trace;
    out.final = state();
    out.handoff = diag().handoff;
    out.stopCalls = fixture.stopCalls.slice();
    out.targetCalls = fixture.calls.filter(c => c.voiceID === targetID).map(c => ({ kind: c.kind, text: c.text }));
    out.prepared = {
      captured: !!fixture.prepared,
      voice: fixture.prepared?._voice?.id ?? null,
      context: fixture.prepared?._audioContext?.state ?? null,
      plays: fixture.preparedPlays.slice(),
    };
    const view = internal._primaryView;
    const pdfPage = view?._pages?.[0];
    const source = view?._readAloudState?.activeWordSourcePosition;
    const timestamp = manager.activeTimestamp;
    const segmentText = String(manager.activeSegment?.text ?? '');
    const expectedText = timestamp ? segmentText.slice(timestamp.charStart, timestamp.charEnd) : null;
    const signature = pdfPage?._lastSignature ?? null;
    const parseSignature = raw => {
      try { return JSON.parse(raw); } catch (e) { return null; }
    };
    const transformRect = (rect, transform) => {
      if (!Array.isArray(rect) || rect.length !== 4 || !Array.isArray(transform) || transform.length < 6) return null;
      const [x1, y1, x2, y2] = rect;
      const points = [[x1, y1], [x2, y1], [x1, y2], [x2, y2]].map(([x, y]) => [transform[0] * x + transform[2] * y + transform[4], transform[1] * x + transform[3] * y + transform[5]]);
      return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
    };
    const near = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === 4 && b.length === 4 && a.every((v, i) => Number.isFinite(v) && Number.isFinite(b[i]) && Math.abs(v - b[i]) < 3);
    const expectedRect = transformRect(source?.rects?.[0], pdfPage?._originalPage?.viewport?.transform);
    const displayRects = parseSignature(signature);
    const matchingDisplay = Array.isArray(displayRects) ? displayRects.filter(x => near(x?.rect, expectedRect)).map(x => ({ rect: x.rect, color: x.color, kind: x.kind })) : [];
    let textLayerRects = [];
    const textLayer = pdfPage?._originalPage?.textLayer?.div;
    if (textLayer && expectedText) {
      const spans = textLayer.querySelectorAll('span');
      for (let i = 0; i < spans.length; i++) {
        const node = spans[i].firstChild;
        if (!node) continue;
        const raw = String(node.nodeValue ?? '');
        let at = raw.indexOf(expectedText);
        while (at >= 0) {
          const range = textLayer.ownerDocument.createRange();
          range.setStart(node, at); range.setEnd(node, at + expectedText.length);
          const rects = range.getClientRects();
          for (let j = 0; j < rects.length; j++) textLayerRects.push([rects[j].x, rects[j].y, rects[j].right, rects[j].bottom]);
          at = raw.indexOf(expectedText, at + 1);
        }
      }
    }
    out.pdfHighlight = {
      segmentText,
      activeTimestamp: timestamp ? { start: timestamp.start, end: timestamp.end, charStart: timestamp.charStart, charEnd: timestamp.charEnd, text: expectedText } : null,
      sourcePosition: source ?? null,
      primaryIdentity: !!(view?._readAloudHighlightedPosition && view._readAloudHighlightedPosition === source),
      expectedViewRect: expectedRect,
      matchingDisplayRects: matchingDisplay,
      textLayerRects,
      signature: signature,
    };
    const first = trace[0]?.state?.audio;
    const last = out.final?.audio;
    out.clock = { firstState: first?.state ?? null, firstTime: first?.time ?? null, lastState: last?.state ?? null, lastTime: last?.time ?? null, advanced: Number(last?.time) > Number(first?.time) + 0.05 };
    out.status = out.clock.advanced && out.handoff?.stage === 'committed' ? 'PASS' : out.clock.advanced ? 'FAIL' : 'NOT TESTABLE: fresh fixture AudioContext remained suspended';
  } finally {
    fixture.delayMs = 0;
    fixture.delayVoiceID = null;
    fixture.failVoiceID = null;
    fixture.failNext = false;
    if (target) {
      try {
        const targetWaived = Components.utils.waiveXrays(target);
        if (targetDescriptor) Object.defineProperty(targetWaived, 'getController', targetDescriptor);
        else delete targetWaived.getController;
      } catch (e) { out.restoreTargetError = String(e); }
    }
    if (node) {
      try {
        const nodeWaived = Components.utils.waiveXrays(node);
        if (nodeDescriptor) Object.defineProperty(nodeWaived, 'stop', nodeDescriptor);
        else delete nodeWaived.stop;
      } catch (e) { out.restoreNodeError = String(e); }
    }
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
  }
  return JSON.stringify(out, null, 1);
})()
