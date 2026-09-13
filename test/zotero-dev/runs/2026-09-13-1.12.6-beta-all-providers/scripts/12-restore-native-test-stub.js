return (() => {
  const state = Zotero.__zttsAllHandoff, saved = state && state.nativeScope;
  if (!saved || !saved.proto || !saved.descriptor) return JSON.stringify({ restored: false, reason: 'saved prototype is missing' }, null, 1);
  Object.defineProperty(saved.proto, '_getReadAloudRemoteInterface', saved.descriptor);
  return JSON.stringify({ restored: Object.prototype.hasOwnProperty.call(saved.proto, '_getReadAloudRemoteInterface'), source: String(saved.descriptor.value).slice(0, 180) }, null, 1);
})()
