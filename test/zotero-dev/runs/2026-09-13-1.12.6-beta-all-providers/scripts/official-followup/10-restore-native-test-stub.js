return (() => {
  const state = Zotero.__zttsOfficialFollowup, saved = state && state.baseline && state.baseline.nativeStub;
  if (!saved || !saved.proto || !saved.descriptor) return JSON.stringify({ restored: false, reason: 'no pre-existing ReaderTab native test stub' }, null, 1);
  Object.defineProperty(saved.proto, '_getReadAloudRemoteInterface', saved.descriptor);
  return JSON.stringify({ restored: Object.prototype.hasOwnProperty.call(saved.proto, '_getReadAloudRemoteInterface'), source: String(saved.descriptor.value).slice(0, 180) }, null, 1);
})()
