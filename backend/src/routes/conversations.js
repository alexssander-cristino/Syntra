import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

async function ownedConversation(id, userId) {
  return pool.query('SELECT id, title, model, created_at, updated_at FROM conversations WHERE id = $1 AND user_id = $2', [id, userId]);
}

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.title, c.model, c.created_at, c.updated_at,
        (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message
       FROM conversations c WHERE c.user_id = $1 ORDER BY c.updated_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ conversations: result.rows.map(c => ({ ...c, id: String(c.id) })) });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const title = String(req.body.title || 'Nova conversa').trim().slice(0, 120) || 'Nova conversa';
    const model = String(req.body.model || process.env.OLLAMA_DEFAULT_MODEL || 'qwen3:4b').slice(0, 120);
    const result = await pool.query(
      'INSERT INTO conversations (user_id, title, model) VALUES ($1, $2, $3) RETURNING id, title, model, created_at, updated_at',
      [req.user.id, title, model]
    );
    res.status(201).json({ conversation: { ...result.rows[0], id: String(result.rows[0].id) } });
  } catch (err) { next(err); }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
    const own = await ownedConversation(req.params.id, req.user.id);
    if (!own.rowCount) return res.status(404).json({ error: 'Conversa não encontrada.' });
    const result = await pool.query(
      'SELECT id, role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC, id ASC',
      [req.params.id]
    );
    res.json({ messages: result.rows.map(m => ({ ...m, id: String(m.id) })) });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim().slice(0, 120);
    const model = req.body.model ? String(req.body.model).slice(0, 120) : null;
    const own = await ownedConversation(req.params.id, req.user.id);
    if (!own.rowCount) return res.status(404).json({ error: 'Conversa não encontrada.' });
    const result = await pool.query(
      `UPDATE conversations SET title = COALESCE(NULLIF($1, ''), title),
       model = COALESCE($2, model), updated_at = NOW()
       WHERE id = $3 AND user_id = $4 RETURNING id, title, model, updated_at`,
      [title, model, req.params.id, req.user.id]
    );
    res.json({ conversation: { ...result.rows[0], id: String(result.rows[0].id) } });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Conversa não encontrada.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
