import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

async function getOwnedConversation(id, userId) {
  return pool.query('SELECT id, model FROM conversations WHERE id = $1 AND user_id = $2', [id, userId]);
}

async function ollamaChat(model, messages) {
  const base = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const response = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: 'Você é Syntra, um assistente de IA útil e claro. Responda em português brasileiro por padrão. Se não souber algo, seja transparente. Ao gerar código, use blocos Markdown.' },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ],
      options: { temperature: 0.7 }
    }),
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama retornou ${response.status}: ${body.slice(0, 300)}`);
  }
  const data = await response.json();
  return data.message?.content || '';
}

router.get('/models', async (_req, res, next) => {
  try {
    const base = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const response = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Não foi possível consultar o Ollama.');
    const data = await response.json();
    res.json({
      models: (data.models || []).map(m => ({ name: m.name, size: m.size })),
      defaultModel: process.env.OLLAMA_DEFAULT_MODEL || 'qwen3:4b'
    });
  } catch {
    res.status(503).json({ error: 'O Ollama não respondeu. Verifique se está instalado e em execução.', models: [], defaultModel: process.env.OLLAMA_DEFAULT_MODEL || 'qwen3:4b' });
  }
});

router.post('/', async (req, res, next) => {
  const message = String(req.body.message || '').trim();
  const conversationId = String(req.body.conversationId || '');
  const model = String(req.body.model || process.env.OLLAMA_DEFAULT_MODEL || 'qwen3:4b').slice(0, 120);
  const maxChars = Number(process.env.MAX_MESSAGE_CHARS || 12000);
  if (!conversationId || !/^\d+$/.test(conversationId)) return res.status(400).json({ error: 'Conversa inválida.' });
  if (!message) return res.status(400).json({ error: 'Digite uma mensagem.' });
  if (message.length > maxChars) return res.status(413).json({ error: `A mensagem excede o limite de ${maxChars} caracteres.` });

  try {
    const own = await getOwnedConversation(conversationId, req.user.id);
    if (!own.rowCount) return res.status(404).json({ error: 'Conversa não encontrada.' });

    await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)', [conversationId, 'user', message]);
    const history = await pool.query(
      'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT 30',
      [conversationId]
    );
    const orderedHistory = history.rows.reverse();
    let answer;
    try {
      answer = await ollamaChat(model, orderedHistory);
    } catch (err) {
      await pool.query('DELETE FROM messages WHERE id = (SELECT id FROM messages WHERE conversation_id = $1 AND role = $2 ORDER BY id DESC LIMIT 1)', [conversationId, 'user']);
      return res.status(502).json({ error: `Não consegui acessar o modelo local. Verifique o Ollama e o modelo "${model}".`, details: process.env.NODE_ENV === 'development' ? err.message : undefined });
    }
    await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)', [conversationId, 'assistant', answer]);
    await pool.query('UPDATE conversations SET model = $1, updated_at = NOW(), title = CASE WHEN title = $2 THEN LEFT($3, 60) ELSE title END WHERE id = $4 AND user_id = $5',
      [model, 'Nova conversa', message, conversationId, req.user.id]);
    res.json({ message: { role: 'assistant', content: answer }, model });
  } catch (err) { next(err); }
});

router.post('/conversations/:id/regenerate', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const own = await getOwnedConversation(id, req.user.id);
    if (!own.rowCount) return res.status(404).json({ error: 'Conversa não encontrada.' });
    const last = await pool.query('SELECT id, role FROM messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT 1', [id]);
    if (!last.rowCount || last.rows[0].role !== 'assistant') return res.status(400).json({ error: 'Não há resposta para regenerar.' });
    await pool.query('DELETE FROM messages WHERE id = $1', [last.rows[0].id]);
    const history = await pool.query('SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT 30', [id]);
    const answer = await ollamaChat(own.rows[0].model, history.rows.reverse());
    await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)', [id, 'assistant', answer]);
    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [id]);
    res.json({ message: { role: 'assistant', content: answer }, model: own.rows[0].model });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return res.status(504).json({ error: 'O modelo demorou demais para responder.' });
    next(err);
  }
});

export default router;
