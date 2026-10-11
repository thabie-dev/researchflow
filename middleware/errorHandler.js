module.exports = function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error('[error]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
};
