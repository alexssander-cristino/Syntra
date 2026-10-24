
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
// CONFIGURAÇÕES
// =====================================================

// =====================================================
// APLICAÇÃO EXPRESS
// =====================================================

const app = express();

app.disable('x-powered-by');

const isVercel = Boolean(process.env.VERCEL);
const jwtSecret = process.env.JWT_SECRET;

if (
  typeof jwtSecret !== 'string' ||
  jwtSecret.length < 32 ||
  jwtSecret.includes('CHANGE_THIS')
) {
  throw new Error(
    'Configure JWT_SECRET com pelo menos 32 caracteres aleatórios.'
  );
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    'Configure DATABASE_URL com a conexão do PostgreSQL.'
  );
}

// =====================================================
// NORMALIZAÇÃO DE ORIGENS
// =====================================================

function removeTrailingSlashes(value) {
  let result = value.trim();

  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }

  return result;
}

// =====================================================
// SEGURANÇA HTTP
// =====================================================

app.use(helmet());

// =====================================================
// CORS
// =====================================================

const allowedOrigins = (
  process.env.CORS_ORIGIN ||
  'http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map(removeTrailingSlashes)
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Permite requisições sem Origin, como chamadas entre servidores.
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = removeTrailingSlashes(origin);

      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      return callback(
        new Error('Origem não permitida pelo CORS.')
      );
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    optionsSuccessStatus: 204,
  })
);

// =====================================================
// MIDDLEWARES
// =====================================================

app.use(
  express.json({
    limit: '256kb',
    strict: true,
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: '32kb',
  })
);

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
// ROTA INICIAL
// =====================================================

app.get('/', (_req, res) => {
  return res.status(200).json({
    name: 'Syntra API',
    status: 'online',
    message: 'A API do Syntra está funcionando.',
    health: '/health',
  });
});

// =====================================================
// HEALTH CHECK
// =====================================================

// =====================================================
// HEALTH CHECK
// =====================================================

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');

    return res.status(200).json({
      ok: true,
      database: 'connected',
      service: 'syntra-api',
    });
  } catch (error) {
    console.error(
      'Health check: falha na conexão com o banco de dados.',
      error
    );

    return res.status(503).json({
      ok: false,
      database: 'disconnected',
      service: 'syntra-api',
    });
  }
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

app.use((req, res) => {
  return res.status(404).json({
    error: 'Rota não encontrada.',
    path: req.path,
  });
});

// =====================================================
// TRATAMENTO GLOBAL DE ERROS
// =====================================================

app.use((err, _req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  if (err.message === 'Origem não permitida pelo CORS.') {
    return res.status(403).json({
      error: 'Origem não permitida pelo CORS.',
    });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'O corpo da requisição excede o tamanho permitido.',
    });
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: 'O JSON enviado é inválido.',
    });
  }

  console.error('Erro interno da API:', err);

  return res.status(500).json({
    error: 'Erro interno do servidor.',
  });
});

// =====================================================
// EXPORTAÇÃO PARA O VERCEL
// =====================================================

export default app;

// =====================================================
// EXECUÇÃO LOCAL
// =====================================================

if (!isVercel) {
  const port = Number(process.env.PORT || 3000);

  const server = app.listen(port, () => {
    console.log(`Syntra API rodando na porta ${port}`);
  });

  let shuttingDown = false;

  async function shutdown() {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    console.log('Encerrando Syntra API...');

    server.close(async (serverError) => {
      try {
        await pool.end();

        if (serverError) {
          console.error(
            'Erro ao encerrar o servidor:',
            serverError
          );

          process.exitCode = 1;
          return;
        }

        console.log('Servidor e conexões encerrados.');
      } catch (error) {
        console.error(
          'Erro ao encerrar conexões com o banco:',
          error
        );

        process.exitCode = 1;
      }
    });
  }

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
