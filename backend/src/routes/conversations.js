import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { isValidMessageRating } from '../chat-actions.js';

const router = Router();
router.use(requireAuth);

async function ownedConversation(id, userId) {
  return pool.query(
    'SELECT id, title, model, is_pinned, archived_at, created_at, updated_at FROM conversations WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
}

// GET /api/conversations?q=termo&archived=true
// A pesquisa abrange títulos e conteúdo das mensagens, sempre limitada ao usuário autenticado.
router.get('/', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim().slice(0, 120);
    const archived = String(req.query.archived || '').toLowerCase() === 'true';
    const result = await pool.query(
      `SELECT c.id, c.title, c.model, c.is_pinned, c.archived_at,
        c.created_at, c.updated_at,
        (SELECT m.content FROM messages m
         WHERE m.conversation_id = c.id
         ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message
       FROM conversations c
       WHERE c.user_id = $1
         AND (($2::boolean = TRUE AND c.archived_at IS NOT NULL)
           OR ($2::boolean = FALSE AND c.archived_at IS NULL))
         AND (
           $3 = ''
           OR POSITION(LOWER($3) IN LOWER(c.title)) > 0
           OR EXISTS (
             SELECT 1 FROM messages m
             WHERE m.conversation_id = c.id
               AND POSITION(LOWER($3) IN LOWER(m.content)) > 0
           )
         )
       ORDER BY c.is_pinned DESC, c.updated_at DESC
       LIMIT 100`,
      [req.user.id, archived, query]
    );
    res.json({
      conversations: result.rows.map(c => ({ ...c, id: String(c.id) }))
    });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const title = String(req.body.title || 'Nova conversa').trim().slice(0, 120) || 'Nova conversa';
    const model = String(req.body.model || process.env.OLLAMA_DEFAULT_MODEL || 'qwen3:4b').slice(0, 120);
    const result = await pool.query(
      'INSERT INTO conversations (user_id, title, model) VALUES ($1, $2, $3) RETURNING id, title, model, is_pinned, archived_at, created_at, updated_at',
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
      'SELECT id, role, content, rating, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC, id ASC',
      [req.params.id]
    );
    res.json({ messages: result.rows.map(m => ({ ...m, id: String(m.id) })) });
  } catch (err) { next(err); }
});


router.post('/:id/messages/:messageId/feedback', async (req, res, next) => {
  try {
    const conversationId = String(req.params.id);
    const messageId = String(req.params.messageId);
    const rating = req.body?.rating;

    if (!/^\d+$/.test(conversationId) || !/^\d+$/.test(messageId)) {
      return res.status(400).json({ error: 'Conversa ou mensagem inválida.' });
    }
    if (!isValidMessageRating(rating)) {
      return res.status(400).json({ error: 'A avaliação deve ser positiva (1) ou negativa (-1).' });
    }

    const result = await pool.query(
      `UPDATE messages AS m
       SET rating = $1
       FROM conversations AS c
       WHERE m.id = $2
         AND m.conversation_id = c.id
         AND c.id = $3
         AND c.user_id = $4
         AND m.role = 'assistant'
       RETURNING m.id, m.rating`,
      [rating, messageId, conversationId, req.user.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Resposta não encontrada nesta conversa.' });
    }
    return res.json({ feedback: { messageId: String(result.rows[0].id), rating: result.rows[0].rating } });
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const titleProvided = Object.prototype.hasOwnProperty.call(req.body, 'title');
    const title = titleProvided ? String(req.body.title || '').trim().slice(0, 120) : null;
    if (titleProvided && !title) {
      return res.status(400).json({ error: 'O título não pode ficar vazio.' });
    }

    const modelProvided = Object.prototype.hasOwnProperty.call(req.body, 'model');
    const model = modelProvided ? String(req.body.model || '').trim().slice(0, 120) : null;
    if (modelProvided && !model) {
      return res.status(400).json({ error: 'Selecione um modelo válido.' });
    }

    const pinProvided = typeof req.body.is_pinned === 'boolean';
    const archivedProvided = typeof req.body.archived === 'boolean';

    const result = await pool.query(
      `UPDATE conversations
       SET title = CASE WHEN $1::boolean THEN $2 ELSE title END,
           model = CASE WHEN $3::boolean THEN $4 ELSE model END,
           is_pinned = CASE WHEN $5::boolean THEN $6 ELSE is_pinned END,
           archived_at = CASE
             WHEN $7::boolean THEN CASE WHEN $8::boolean THEN NOW() ELSE NULL END
             ELSE archived_at
           END,
           updated_at = NOW()
       WHERE id = $9 AND user_id = $10
       RETURNING id, title, model, is_pinned, archived_at, created_at, updated_at`,
      [
        titleProvided, title,
        modelProvided, model,
        pinProvided, req.body.is_pinned === true,
        archivedProvided, req.body.archived === true,
        req.params.id, req.user.id
      ]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Conversa não encontrada.' });
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
