return (() => {
  const state = Zotero.__zttsAllHandoff, reader = (Zotero.Reader._readers || [])[0];
  if (!state || !reader) throw new Error('state or reader missing');
  const proto = Object.getPrototypeOf(reader), descriptor = Object.getOwnPropertyDescriptor(proto, '_getReadAloudRemoteInterface');
  if (!descriptor || typeof descriptor.value !== 'function') throw new Error('ReaderTab native test stub is not present');
  state.nativeScope = { proto, descriptor };
  delete proto._getReadAloudRemoteInterface;
  const parent = Object.getPrototypeOf(proto), original = parent && Object.getOwnPropertyDescriptor(parent, '_getReadAloudRemoteInterface');
  return JSON.stringify({ removed: !Object.prototype.hasOwnProperty.call(proto, '_getReadAloudRemoteInterface'), previousSource: String(descriptor.value).slice(0, 180), ancestorSource: original && typeof original.value === 'function' ? String(original.value).slice(0, 180) : null }, null, 1);
})()
