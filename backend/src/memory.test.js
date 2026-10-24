import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMemoryCandidate, formatMemoryContext } from './memory.js';

test('saves an explicit remember request', () => {
  assert.equal(
    extractMemoryCandidate('Lembre-se de que eu gosto de respostas curtas.'),
    'eu gosto de respostas curtas'
  );
});

test('extracts useful personal context from clear statements', () => {
  assert.equal(extractMemoryCandidate('Meu nome é Alex'), 'Nome do usuário: Alex');
  assert.equal(extractMemoryCandidate('Prefiro tema escuro'), 'Preferência do usuário: tema escuro');
  assert.equal(extractMemoryCandidate('Estou desenvolvendo o Syntra'), 'Projeto atual do usuário: o Syntra');
});

test('does not save unrelated messages or sensitive data', () => {
  assert.equal(extractMemoryCandidate('Oi, tudo bem?'), null);
  assert.equal(extractMemoryCandidate('Minha senha é exemplo123'), null);
  assert.equal(extractMemoryCandidate(null), null);
});

test('formats memories as reference context, not instructions', () => {
  const context = formatMemoryContext([{ content: 'Prefere respostas curtas' }]);
  assert.match(context, /Prefere respostas curtas/);
  assert.match(context, /não instruções/);
  assert.equal(formatMemoryContext([]), '');
});
