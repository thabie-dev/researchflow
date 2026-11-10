const express = require('express');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const router = express.Router();
const store = require('../services/store');
const auth = require('../services/auth');
const requireAuth = require('../middleware/requireAuth');

const USERS = 'users';
const RESETS = 'passwordResets';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Until an email service is connected, the reset token is returned outside production.
const SHOW_RESET_TOKEN = process.env.NODE_ENV !== 'production';

// Small in-memory limiter against password guessing and reset spam.
const attempts = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    attempts.set(key, recent);
    return true;
  }
  recent.push(now);
  attempts.set(key, recent);
  return false;
}
const tooMany = (res) => res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });

const normalise = (email) => String(email || '').trim().toLowerCase();
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });
const session = (u) => ({ token: auth.createToken(u.id), user: publicUser(u) });

router.post('/signup', async (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  const email = normalise((req.body || {}).email);
  const password = (req.body || {}).password;

  if (!name || name.length > 80) return res.status(400).json({ error: 'Please enter your name' });
  if (!EMAIL_PATTERN.test(email) || email.length > 200) return res.status(400).json({ error: 'Please enter a valid email address' });
  const problem = auth.passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });

  const user = { id: uuid(), name, email, passwordHash: auth.hashPassword(password), createdAt: new Date().toISOString() };
  let created = false;
  let firstUser = false;
  await store.update(USERS, [], (all) => {
    if (all.some((u) => u.email === email)) return all;
    created = true;
    firstUser = all.length === 0;
    return [...all, user];
  });
  if (!created) return res.status(409).json({ error: 'An account with this email already exists. Try signing in.' });

  // Projects made before accounts existed belong to the first person who signs up.
  if (firstUser) {
    await store.update('projects', [], (all) => all.map((p) => (p.ownerId ? p : { ...p, ownerId: user.id })));
  }
  res.status(201).json(session(user));
});

router.post('/signin', (req, res) => {
  const email = normalise((req.body || {}).email);
  const password = (req.body || {}).password;
  if (limited(`signin:${req.ip}:${email}`, 8, 10 * 60 * 1000)) return tooMany(res);

  const user = store.read(USERS, []).find((u) => u.email === email);
  const ok = user && typeof password === 'string' && auth.verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password' });
  res.json(session(user));
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

router.post('/forgot-password', async (req, res) => {
  const email = normalise((req.body || {}).email);
  if (limited(`forgot:${req.ip}`, 5, 15 * 60 * 1000)) return tooMany(res);

  const generic = { message: 'If an account exists for that email, a password reset link has been prepared.' };
  const user = store.read(USERS, []).find((u) => u.email === email);
  if (!user) return res.json(generic);

  const token = crypto.randomBytes(32).toString('base64url');
  const record = { userId: user.id, tokenHash: auth.sha256(token), expiresAt: Date.now() + auth.RESET_TTL_MS };
  await store.update(RESETS, [], (all) => [...all.filter((r) => r.userId !== user.id && r.expiresAt > Date.now()), record]);

  if (SHOW_RESET_TOKEN) {
    console.log(`[auth] Password reset requested for ${user.email}. Token (valid 30 min): ${token}`);
    return res.json({ ...generic, resetToken: token });
  }
  res.json(generic);
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body || {};
  if (limited(`reset:${req.ip}`, 10, 15 * 60 * 1000)) return tooMany(res);
  if (typeof token !== 'string' || !token) return res.status(400).json({ error: 'This reset link is invalid or has expired' });
  const problem = auth.passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });

  const tokenHash = auth.sha256(token);
  const record = store.read(RESETS, []).find((r) => r.tokenHash === tokenHash && r.expiresAt > Date.now());
  if (!record) return res.status(400).json({ error: 'This reset link is invalid or has expired' });

  let found = null;
  await store.update(USERS, [], (all) => all.map((u) => {
    if (u.id !== record.userId) return u;
    found = { ...u, passwordHash: auth.hashPassword(password) };
    return found;
  }));
  await store.update(RESETS, [], (all) => all.filter((r) => r.tokenHash !== tokenHash));
  if (!found) return res.status(400).json({ error: 'This reset link is invalid or has expired' });
  res.json({ message: 'Password updated. You can now sign in.' });
});

module.exports = router;
