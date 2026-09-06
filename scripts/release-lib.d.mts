/** Types for release-lib.mjs, which the release scripts and the tests share. */
export const VERSION_RE: RegExp;
export function stripPrerelease(version: string): string;
export function compareVersions(a: string, b: string): -1 | 0 | 1;
export function setVersionLine(text: string, version: string): string;
export function releaseLink(version: string): string;
export function pointUpdateJson(text: string, version: string): string;
