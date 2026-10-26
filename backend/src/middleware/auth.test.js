import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { requireAuth } from './auth.js';

const secret = 'test-secret-with-at-least-thirty-two-characters';
process.env.JWT_SECRET = secret;

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; }
  };
}

function makeToken(sub = '42') {
  return jwt.sign({ email: 'tester@example.com' }, secret, {
    subject: sub, expiresIn: '5m', issuer: 'syntra', audience: 'syntra-client'
  });
}

test('requires authentication when no session token is present', () => {
  const req = { headers: {}, method: 'GET', get: () => null };
  const res = responseRecorder();
  let called = false;
  requireAuth(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
});

test('accepts a valid Bearer token and exposes only the authenticated subject', () => {
  const req = {
    headers: { authorization: `Bearer ${makeToken()}` },
    method: 'GET',
    get: () => null
  };
  const res = responseRecorder();
  let called = false;
  requireAuth(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user.id, '42');
  assert.equal(req.user.authMethod, 'bearer');
});

test('rejects malformed or expired bearer tokens', () => {
  const req = { headers: { authorization: 'Bearer not-a-jwt' }, method: 'GET', get: () => null };
  const res = responseRecorder();
  requireAuth(req, res, () => assert.fail('next must not run'));
  assert.equal(res.statusCode, 401);
});

test('blocks cookie-authenticated mutations without CSRF protection', () => {
  const token = makeToken();
  const req = {
    headers: { cookie: `syntra_session=${token}` },
    method: 'POST',
    get: (name) => name === 'Origin' ? 'http://localhost:5173' : null
  };
  const res = responseRecorder();
  requireAuth(req, res, () => assert.fail('next must not run'));
  assert.equal(res.statusCode, 403);
});
