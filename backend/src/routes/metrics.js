import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM conversations WHERE user_id = $1) AS conversations,
         (SELECT COUNT(*)::int FROM messages m INNER JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = $1) AS messages,
         (SELECT COUNT(*)::int FROM messages m INNER JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = $1 AND m.role = 'assistant' AND m.rating = 1) AS positive_ratings,
         (SELECT COUNT(*)::int FROM messages m INNER JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = $1 AND m.role = 'assistant' AND m.rating = -1) AS negative_ratings,
         (SELECT COUNT(*)::int FROM documents WHERE user_id = $1) AS documents,
         (SELECT ROUND(AVG(m.generation_ms))::int FROM messages m INNER JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = $1 AND m.role = 'assistant' AND m.generation_ms IS NOT NULL) AS average_generation_ms,
         (SELECT CEIL(COALESCE(SUM(char_length(m.content)), 0) / 4.0)::int FROM messages m INNER JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = $1 AND m.role = 'assistant') AS estimated_output_tokens`,
      [req.user.id]
    );
    return res.set('Cache-Control', 'no-store').json({ metrics: result.rows[0] });
  } catch (error) { return next(error); }
});

export default router;
