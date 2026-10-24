import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { MEMORY_LIMIT } from '../memory.js';

const router = Router();
router.use(requireAuth);

// GET /api/memory — only the authenticated user's memories.
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, content, source, created_at, updated_at
       FROM user_memories
       WHERE user_id = $1
       ORDER BY updated_at DESC, id DESC
       LIMIT 100`,
      [req.user.id]
    );
    return res.json({ memories: result.rows.map(item => ({ ...item, id: String(item.id) })) });
  } catch (error) {
    return next(error);
  }
});

// POST /api/memory — explicitly save a memory.
router.post('/', async (req, res, next) => {
  const content = String(req.body?.content || '').trim().replace(/\s+/g, ' ');
  if (content.length < 2) {
    return res.status(400).json({ error: 'Escreva uma memória com pelo menos 2 caracteres.' });
  }
  if (content.length > MEMORY_LIMIT) {
    return res.status(400).json({ error: `A memória deve ter no máximo ${MEMORY_LIMIT} caracteres.` });
  }
  if (/\b(password|senha|token|api[ _-]?key|secret|segredo|cart[aã]o de cr[eé]dito|cvv|cpf|rg|passaporte)\b/i.test(content)) {
    return res.status(400).json({ error: 'Por segurança, não salve senhas, credenciais ou identificadores sensíveis na memória.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO user_memories (user_id, content, source)
       VALUES ($1, $2, 'manual')
       ON CONFLICT (user_id, lower(content))
       DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
       RETURNING id, content, source, created_at, updated_at`,
      [req.user.id, content]
    );
    return res.status(201).json({
      memory: { ...result.rows[0], id: String(result.rows[0].id) }
    });
  } catch (error) {
    return next(error);
  }
});

// DELETE /api/memory — clear only this user's memories.
router.delete('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM user_memories WHERE user_id = $1',
      [req.user.id]
    );
    return res.json({ ok: true, deleted: result.rowCount });
  } catch (error) {
    return next(error);
  }
});

// DELETE /api/memory/:id — delete one memory owned by this user.
router.delete('/:id', async (req, res, next) => {
  if (!/^\d+$/.test(String(req.params.id))) {
    return res.status(400).json({ error: 'Memória inválida.' });
  }
  try {
    const result = await pool.query(
      'DELETE FROM user_memories WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: 'Memória não encontrada.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
