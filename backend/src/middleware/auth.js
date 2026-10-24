import jwt from 'jsonwebtoken';

function removeTrailingSlashes(value) {
  let result = value.trim();

  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }

  return result;
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const separator = part.indexOf('=');

    if (separator < 0) continue;

    if (part.slice(0, separator).trim() !== name) {
      continue;
    }

    const value = part.slice(separator + 1).trim();

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, bearerToken] = header.split(' ');
  const isBearer = scheme === 'Bearer' && Boolean(bearerToken);

  const token = isBearer
    ? bearerToken
    : readCookie(req, 'syntra_session');

  if (!token) {
    return res.status(401).json({
      error: 'Faça login para continuar.'
    });
  }

  if (!isBearer && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const allowedOrigins = (
      process.env.CORS_ORIGIN ||
      'http://localhost:5173,http://127.0.0.1:5173'
    )
      .split(',')
      .map(value => value.trim().replace(/\/+$/, ''))
      .filter(Boolean);

    const origin = String(req.get('Origin') || '')
      .replace(/\/+$/, '');

    if (
      !origin ||
      !allowedOrigins.includes(origin) ||
      req.get('X-Syntra-CSRF') !== '1'
    ) {
      return res.status(403).json({
        error: 'Requisição bloqueada pela proteção CSRF.'
      });
    }
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'syntra',
      audience: 'syntra-client'
    });

    req.user = {
      id: String(payload.sub),
      email: payload.email,
      authMethod: isBearer ? 'bearer' : 'cookie'
    };

    return next();
  } catch {
    return res.status(401).json({
      error: 'Sessão inválida ou expirada. Entre novamente.'
    });
  }
}