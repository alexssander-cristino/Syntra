import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

// Exportação dos dados pessoais do usuário.
router.get('/export', async (req, res, next) => {
  try {
    const userResult = await pool.query(
      `SELECT id, name, email, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (!userResult.rowCount) {
      return res.status(404).json({
        error: 'Conta não encontrada.'
      });
    }

    const conversationsResult = await pool.query(
      `SELECT id, title, model, created_at, updated_at
       FROM conversations
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [req.user.id]
    );

    const messagesResult = await pool.query(
      `SELECT m.id, m.conversation_id, m.role, m.content, m.rating, m.generation_ms, m.created_at
       FROM messages m
       INNER JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = $1
       ORDER BY m.created_at ASC, m.id ASC`,
      [req.user.id]
    );

    const documentsResult = await pool.query(
      `SELECT id, filename, char_length(content) AS characters, created_at
       FROM documents WHERE user_id = $1 ORDER BY created_at ASC, id ASC`,
      [req.user.id]
    );

    const memoriesResult = await pool.query(
      `SELECT id, content, source, created_at, updated_at
       FROM user_memories
       WHERE user_id = $1
       ORDER BY created_at ASC, id ASC`,
      [req.user.id]
    );

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="syntra-meus-dados.json"'
    );

    return res.json({
      exportedAt: new Date().toISOString(),
      user: userResult.rows[0],
      conversations: conversationsResult.rows,
      messages: messagesResult.rows,
      memories: memoriesResult.rows,
      documents: documentsResult.rows
    });
  } catch (error) {
    return next(error);
  }
});

// Exclusão permanente da conta e de suas conversas.
router.delete('/account', async (req, res, next) => {
  const confirmation = String(req.body?.confirmation || '');

  if (confirmation !== 'EXCLUIR MINHA CONTA') {
    return res.status(400).json({
      error: 'Confirmação de exclusão inválida.'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const user = await client.query(
      'SELECT id FROM users WHERE id = $1 FOR UPDATE',
      [req.user.id]
    );

    if (!user.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Conta não encontrada.'
      });
    }

    await client.query(
      `DELETE FROM messages
       WHERE conversation_id IN (
         SELECT id FROM conversations WHERE user_id = $1
       )`,
      [req.user.id]
    );

    await client.query(
      'DELETE FROM conversations WHERE user_id = $1',
      [req.user.id]
    );

    await client.query(
      'DELETE FROM users WHERE id = $1',
      [req.user.id]
    );

    await client.query('COMMIT');

    res.setHeader('Cache-Control', 'no-store');

    res.clearCookie('syntra_session', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api'
    });

    return res.json({
      ok: true,
      message: 'Conta e conversas excluídas.'
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return next(error);
  } finally {
    client.release();
  }
});

export default router;