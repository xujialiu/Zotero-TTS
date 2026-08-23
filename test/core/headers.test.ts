import { describe, expect, it } from 'vitest';
import { parseHeaderList } from '../../src/core/headers';

describe('parseHeaderList', () => {
  it('reads "Name: value" pairs separated by semicolons or newlines', () => {
    expect(parseHeaderList('CF-Access-Client-Id: abc; CF-Access-Client-Secret: s3cr3t\nX-Extra:  spaced value ')).toEqual({
      'CF-Access-Client-Id': 'abc',
      'CF-Access-Client-Secret': 's3cr3t',
      'X-Extra': 'spaced value',
    });
  });

  it('keeps a colon inside the value', () => {
    expect(parseHeaderList('Authorization: Basic dXNlcjpwYXNz')).toEqual({ Authorization: 'Basic dXNlcjpwYXNz' });
  });

  it('drops malformed pairs and names with spaces', () => {
    expect(parseHeaderList('no colon; : value; Bad Name: x; Empty: ; Good: y;')).toEqual({ Good: 'y' });
  });

  it('returns nothing for an empty field', () => {
    expect(parseHeaderList('')).toEqual({});
    expect(parseHeaderList('  ')).toEqual({});
  });
});
