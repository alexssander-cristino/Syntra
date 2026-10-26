import test from 'node:test';
import assert from 'node:assert/strict';
import { isPositiveDatabaseId } from './security-actions.js';

test('accepts positive PostgreSQL bigint identifiers', () => {
  assert.equal(isPositiveDatabaseId('1'), true);
  assert.equal(isPositiveDatabaseId('9223372036854775807'), true);
});

test('rejects malformed, zero, negative, and overflowing identifiers', () => {
  for (const value of ['', '0', '000', '-1', '1.2', '1x', '9223372036854775808', null, undefined]) {
    assert.equal(isPositiveDatabaseId(value), false, String(value));
  }
});
