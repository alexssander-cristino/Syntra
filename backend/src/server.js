import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import conversationRoutes from './routes/conversations.js';
import chatRoutes from './routes/chat.js';
import { pool } from './db.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.includes('CHANGE_THIS')) {
  console.error('Configure JWT_SECRET no .env com pelo menos 32 caracteres aleatórios.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(helmet());
const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(v => v.trim());
app.use(cors({ origin(origin, callback) {
  if (!origin || origins.includes(origin)) return callback(null, true);
  return callback(new Error('Origem não permitida pelo CORS.'));
}}));
app.use(express.json({ limit: '256kb' }));

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected', service: 'syntra-api' });
  } catch {
    res.status(503).json({ ok: false, database: 'disconnected' });
  }
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Muitas tentativas. Aguarde e tente novamente.' } });
const chatLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Muitas mensagens em pouco tempo. Aguarde um minuto.' } });
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/chat', chatLimiter, chatRoutes);

app.use((err, _req, res, _next) => {
  if (err.message === 'Origem não permitida pelo CORS.') return res.status(403).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => console.log(`Syntra API rodando em http://localhost:${port}`));
async function shutdown() {
  server.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
