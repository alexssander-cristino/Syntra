import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidMessageRating, validateEditedContent } from './chat-actions.js';

test('accepts positive and negative response ratings only', () => {
  assert.equal(isValidMessageRating(1), true);
  assert.equal(isValidMessageRating(-1), true);
  for (const value of [0, 2, -2, '1', null, undefined, true]) {
    assert.equal(isValidMessageRating(value), false);
  }
});

test('trims valid edited messages', () => {
  assert.deepEqual(validateEditedContent('  explique melhor  ', 100), {
    ok: true,
    error: null,
    content: 'explique melhor'
  });
});

test('rejects empty edited messages', () => {
  const result = validateEditedContent('   ', 100);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'A mensagem não pode ficar vazia.');
});

test('rejects edited messages above the configured limit', () => {
  const result = validateEditedContent('12345', 4);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'A mensagem excede o limite de 4 caracteres.');
});
