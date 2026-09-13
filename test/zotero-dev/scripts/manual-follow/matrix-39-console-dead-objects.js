return (() => {
  const service = Components.classes['@mozilla.org/consoleservice;1'].getService(Components.interfaces.nsIConsoleService);
  const messages = service.getMessageArray() ?? [];
  const matches = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    let errorMessage = '';
    try { errorMessage = String(message.errorMessage ?? message.message ?? ''); } catch (e) {}
    if (!errorMessage.includes("can't access dead object")) continue;
    let stack = null;
    try { stack = message.stack ?? null; } catch (e) {}
    matches.push({
      sourceName: (() => { try { return message.sourceName ?? null; } catch (e) { return null; } })(),
      lineNumber: (() => { try { return message.lineNumber ?? null; } catch (e) { return null; } })(),
      columnNumber: (() => { try { return message.columnNumber ?? null; } catch (e) { return null; } })(),
      errorMessage,
      timeStamp: (() => { try { return message.timeStamp ?? null; } catch (e) { return null; } })(),
      stack,
    });
  }
  return JSON.stringify({ totalConsoleMessages: messages.length, matchingDeadObjectMessages: matches.length, matches });
})()
