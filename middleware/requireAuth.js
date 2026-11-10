const store = require('../services/store');
const auth = require('../services/auth');

module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const userId = header.startsWith('Bearer ') ? auth.readToken(header.slice(7)) : null;
  const user = userId && store.read('users', []).find((u) => u.id === userId);
  if (!user) return res.status(401).json({ error: 'Please sign in to continue' });
  req.user = { id: user.id, name: user.name, email: user.email };
  next();
};
