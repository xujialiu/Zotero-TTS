return (() => {
  const state = Zotero.__zttsOfficialFollowup, base = state && state.baseline, reader = (Zotero.Reader._readers || [])[0];
  if (!state || !base || !reader) throw new Error('baseline or user reader missing');
  const proto = Object.getPrototypeOf(reader), current = Object.getOwnPropertyDescriptor(proto, '_getReadAloudRemoteInterface');
  if (!base.nativeStub && current && typeof current.value === 'function') base.nativeStub = { proto, descriptor: current };
  if (!current || typeof current.value !== 'function') return JSON.stringify({ removed: false, reason: 'no ReaderTab own native test stub', ancestor: null }, null, 1);
  const ancestor = Object.getPrototypeOf(proto), original = ancestor && Object.getOwnPropertyDescriptor(ancestor, '_getReadAloudRemoteInterface');
  delete proto._getReadAloudRemoteInterface;
  return JSON.stringify({ removed: !Object.prototype.hasOwnProperty.call(proto, '_getReadAloudRemoteInterface'), previousSource: String(current.value).slice(0, 180), ancestorSource: original && typeof original.value === 'function' ? String(original.value).slice(0, 180) : null }, null, 1);
})()
