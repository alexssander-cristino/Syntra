
import 'dotenv/config';

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import conversationRoutes from './routes/conversations.js';
import chatRoutes from './routes/chat.js';
import { pool } from './db.js';

// =====================================================
// CONFIGURAÇÕES OBRIGATÓRIAS
// =====================================================

if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32 ||
  process.env.JWT_SECRET.includes('CHANGE_THIS')
) {
  console.error(
    'Configure JWT_SECRET com pelo menos 32 caracteres aleatórios.'
  );

  process.exit(1);
}

// =====================================================
// APLICAÇÃO EXPRESS
// =====================================================

const app = express();

app.disable('x-powered-by');

app.use(helmet());

// =====================================================
// CORS
// =====================================================

const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Permite chamadas sem Origin, como health checks
      // e requisições feitas por ferramentas de backend.
      if (!origin || origins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error('Origem não permitida pelo CORS.')
      );
    },
  })
);

// =====================================================
// MIDDLEWARES
// =====================================================

app.use(express.json({ limit: '256kb' }));

// =====================================================
// HEALTH CHECK
// =====================================================

app.get('/', (_req, res) => {
  res.status(200).json({
    name: 'Syntra API',
    status: 'online',
    message: 'A API do Syntra está funcionando.',
    health: '/health',
  });
});

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');

    return res.status(200).json({
      ok: true,
      database: 'connected',
      service: 'syntra-api',
    });
  } catch (error) {
    console.error('Health check: falha na conexão com o banco.');

    return res.status(503).json({
      ok: false,
      database: 'disconnected',
      service: 'syntra-api',
    });
  }
});

// =====================================================
// RATE LIMITING
// =====================================================

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Muitas tentativas. Aguarde e tente novamente.',
  },
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Muitas mensagens em pouco tempo. Aguarde um minuto.',
  },
});

// =====================================================
// ROTAS DA API
// =====================================================

app.use('/api/auth', authLimiter, authRoutes);

app.use('/api/conversations', conversationRoutes);

app.use('/api/chat', chatLimiter, chatRoutes);

// =====================================================
// ROTA NÃO ENCONTRADA
// =====================================================

app.use((req, res, next) => {
  if (res.headersSent) {
    return next();
  }

  return res.status(404).json({
    error: 'Rota não encontrada.',
    path: req.path,
  });
});

// =====================================================
// TRATAMENTO GLOBAL DE ERROS
// =====================================================

app.use((err, _req, res, _next) => {
  if (err.message === 'Origem não permitida pelo CORS.') {
    return res.status(403).json({
      error: err.message,
    });
  }

  console.error('Erro interno da API:', err);

  if (res.headersSent) {
    return;
  }

  return res.status(500).json({
    error: 'Erro interno do servidor.',
  });
});

// =====================================================
// EXPORTAÇÃO PARA O VERCEL
// =====================================================

// O Vercel importa a aplicação Express como ponto de entrada.
export default app;

// =====================================================
// EXECUÇÃO LOCAL
// =====================================================

// No Vercel, a plataforma gerencia a execução da aplicação.
// Localmente, iniciamos o servidor normalmente.
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT || 3000);

  const server = app.listen(port, () => {
    console.log(`Syntra API rodando na porta ${port}`);
  });

  let shuttingDown = false;

  async function shutdown() {
    if (shuttingDown) return;

    shuttingDown = true;

    console.log('Encerrando Syntra API...');

    server.close(async () => {
      try {
        await pool.end();
        process.exit(0);
      } catch (error) {
        console.error('Erro ao encerrar conexões:', error);
        process.exit(1);
      }
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
