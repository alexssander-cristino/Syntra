export function validateEditedContent(input, maxChars = 12000) {
  const content = typeof input === 'string' ? input.trim() : '';
  if (!content) return { ok: false, error: 'A mensagem não pode ficar vazia.', content: '' };
  if (content.length > maxChars) {
    return { ok: false, error: `A mensagem excede o limite de ${maxChars} caracteres.`, content };
  }
  return { ok: true, error: null, content };
}

export function isValidMessageRating(value) {
  return value === 1 || value === -1;
}
