import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const MAX_DOCUMENT_CHARS = 100_000;
const MAX_DOCUMENTS_PER_USER = 50;

function normalizeText(value) {
  return String(value || '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
}

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, filename, char_length(content) AS characters, created_at
       FROM documents WHERE user_id = $1
       ORDER BY created_at DESC, id DESC LIMIT 100`,
      [req.user.id]
    );
    return res.json({ documents: result.rows.map(row => ({ ...row, id: String(row.id) })) });
  } catch (error) { return next(error); }
});

router.post('/', async (req, res, next) => {
  const filename = String(req.body?.filename || 'documento.txt').trim().replace(/[\\/\\\\]/g, '_').slice(0, 180);
  const content = normalizeText(req.body?.content);
  if (!content) return res.status(400).json({ error: 'O documento está vazio.' });
  if (content.length > MAX_DOCUMENT_CHARS) return res.status(413).json({ error: `O documento excede ${MAX_DOCUMENT_CHARS} caracteres.` });

  try {
    const count = await pool.query('SELECT COUNT(*)::int AS total FROM documents WHERE user_id = $1', [req.user.id]);
    if (count.rows[0].total >= MAX_DOCUMENTS_PER_USER) return res.status(409).json({ error: `Limite de ${MAX_DOCUMENTS_PER_USER} documentos por conta atingido.` });
    const result = await pool.query(
      `INSERT INTO documents (user_id, filename, content)
       VALUES ($1, $2, $3)
       RETURNING id, filename, char_length(content) AS characters, created_at`,
      [req.user.id, filename || 'documento.txt', content]
    );
    return res.status(201).json({ document: { ...result.rows[0], id: String(result.rows[0].id) } });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (req, res, next) => {
  if (!/^\d+$/.test(String(req.params.id))) return res.status(400).json({ error: 'Documento inválido.' });
  try {
    const result = await pool.query('DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Documento não encontrado.' });
    return res.json({ ok: true });
  } catch (error) { return next(error); }
});

export async function retrieveDocumentContext(userId, prompt, limit = 4) {
  const words = String(prompt || '').toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || [];
  const uniqueWords = [...new Set(words)].slice(0, 8);
  if (!uniqueWords.length) return '';
  try {
    const patterns = uniqueWords.map(word => `%${word.replace(/[%_\\]/g, '\\$&')}%`);
    const clauses = patterns.map((_, index) => `content ILIKE $${index + 2} ESCAPE E'\\\\'`);
    const limitParam = patterns.length + 2;
    const sql = `SELECT filename, content FROM documents WHERE user_id = $1 AND (${clauses.join(' OR ')}) ORDER BY created_at DESC LIMIT $${limitParam}`;
    const result = await pool.query(sql, [userId, ...patterns, limit]);
    return result.rows.map(row => {
      const lower = row.content.toLowerCase();
      const hit = uniqueWords.find(word => lower.includes(word)) || '';
      const start = hit ? Math.max(0, lower.indexOf(hit) - 450) : 0;
      return `[Documento: ${row.filename}]\n${row.content.slice(start, start + 1600)}`;
    }).join('\n\n');
  } catch (error) {
    if (error.code === '42P01') {
      console.error('[Syntra/Documents] Migração de documentos ainda não aplicada.');
      return '';
    }
    throw error;
  }
}

export default router;
