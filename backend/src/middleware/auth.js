import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Faça login para continuar.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: String(payload.sub), email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Entre novamente.' });
  }
}
