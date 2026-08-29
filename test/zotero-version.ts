// A port of Mozilla's nsIVersionComparator (toolkit/xre/nsVersionComparator.cpp),
// the comparator Zotero runs a plugin's strict_min_version / strict_max_version
// through. It is test-only: nothing in the plugin compares versions at runtime,
// but the manifest's bounds are only as good as this ranking, and the ranking is
// not the intuitive one — a trailing non-numeric part sorts *below* nothing
// ("1.0pre" < "1.0"), which is why a Zotero source build "10.0.SOURCE.<hash>"
// is below plain "10.0" (issue #8).
//
// zotero-version.test.ts pins every case here against the values Zotero's own
// Services.vc produced, so the port is checked rather than trusted.

const INT32_MAX = 2147483647;

interface VersionPart {
  numA: number;
  strB: string | null;
  numC: number;
  extraD: string | null;
}

const ABSENT: VersionPart = { numA: 0, strB: null, numC: 0, extraD: null };

/** C's strtol(s, &end, 10): the leading integer, and whatever follows it. */
function strtol(s: string): { value: number; rest: string } {
  const digits = /^[ \t\n\r\f\v]*[+-]?[0-9]+/.exec(s);
  if (!digits) return { value: 0, rest: s };
  return { value: parseInt(digits[0], 10), rest: s.slice(digits[0].length) };
}

/** ParseVP: one dot-separated part as <numA><strB><numC><extraD>. */
function parsePart(part: string): VersionPart {
  if (part === '*') return { numA: INT32_MAX, strB: '', numC: 0, extraD: null };

  const { value, rest } = strtol(part);
  if (rest === '') return { numA: value, strB: null, numC: 0, extraD: null };
  // "1.0+" is defined to mean "1.1pre".
  if (rest.startsWith('+')) return { numA: value + 1, strB: 'pre', numC: 0, extraD: null };

  const numStart = rest.search(/[0-9+-]/);
  if (numStart < 0) return { numA: value, strB: rest, numC: 0, extraD: null };
  const tail = strtol(rest.slice(numStart));
  return {
    numA: value,
    strB: rest.slice(0, numStart),
    numC: tail.value,
    extraD: tail.rest === '' ? null : tail.rest,
  };
}

function cmpNum(a: number, b: number): number {
  if (a < b) return -1;
  return a === b ? 0 : 1;
}

/** ns_strcmp / ns_strnncmp: any string sorts *before* no string. */
function cmpStr(a: string | null, b: string | null): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function cmpPart(a: VersionPart, b: VersionPart): number {
  return cmpNum(a.numA, b.numA) || cmpStr(a.strB, b.strB) || cmpNum(a.numC, b.numC)
    || cmpStr(a.extraD, b.extraD);
}

/** -1, 0 or 1, exactly as Services.vc.compare(a, b) would report it. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.');
  const right = b.split('.');
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const result = cmpPart(
      i < left.length ? parsePart(left[i]) : ABSENT,
      i < right.length ? parsePart(right[i]) : ABSENT,
    );
    if (result !== 0) return result;
  }
  return 0;
}

/**
 * Whether Zotero at `version` would accept a plugin declaring these bounds —
 * XPIDatabase.sys.mjs `isCompatibleWith`, including Zotero's own patch: a
 * version containing "-beta", "-dev" or "SOURCE" skips the maximum entirely
 * (XPIInstall.sys.mjs sets strictCompatibility false), but never the minimum.
 */
export function acceptsPlugin(
  version: string,
  bounds: { strict_min_version?: string; strict_max_version?: string },
): boolean {
  if (compareVersions(version, bounds.strict_min_version || '0') < 0) return false;
  const strict = !version.includes('-beta') && !version.includes('-dev')
    && !version.includes('SOURCE');
  if (!strict) return true;
  return compareVersions(version, bounds.strict_max_version || '*') <= 0;
}
