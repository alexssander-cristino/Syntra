import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const COOKIE_NAME = 'syntra_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function signToken(user) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET não configurado corretamente.');
  }

  return jwt.sign(
    { email: user.email },
    process.env.JWT_SECRET,
    {
      subject: String(user.id),
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: 'syntra',
      audience: 'syntra-client'
    }
  );
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api',
    maxAge: SESSION_MAX_AGE
  };
}

function sendSession(req, res, user, status = 200) {
  const safeUser = {
    id: String(user.id),
    name: user.name,
    email: user.email
  };

  const token = signToken(user);

  if (req.get('X-Syntra-Auth-Mode') === 'cookie') {
    res.cookie(COOKIE_NAME, token, cookieOptions());

    return res.status(status).json({
      user: safeUser,
      authMode: 'cookie'
    });
  }

  // Compatibilidade com Flutter e clientes Bearer.
  return res.status(status).json({
    token,
    user: safeUser
  });
}

router.post('/register', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({
        error: 'O nome deve ter entre 2 e 80 caracteres.'
      });
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254
    ) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }

    if (password.length < 12 || password.length > 128) {
      return res.status(400).json({
        error: 'A senha deve ter entre 12 e 128 caracteres.'
      });
    }

    const hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, hash]
    );

    return sendSession(req, res, result.rows[0], 201);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'Este e-mail já está cadastrado.'
      });
    }

    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (
      !email ||
      !password ||
      email.length > 254 ||
      password.length > 128
    ) {
      return res.status(401).json({
        error: 'E-mail ou senha incorretos.'
      });
    }

    const result = await pool.query(
      `SELECT id, name, email, password_hash
       FROM users
       WHERE email = $1`,
      [email]
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        error: 'E-mail ou senha incorretos.'
      });
    }

    return sendSession(req, res, user);
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api'
  });

  return res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: 'Conta não encontrada.'
      });
    }

    const user = result.rows[0];

    return res.json({
      user: {
        ...user,
        id: String(user.id)
      }
    });
  } catch (error) {
    return next(error);
  }
});

export default router;