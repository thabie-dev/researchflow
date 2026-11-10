const net = require('net');
const express = require('express');
// Slow networks fail outbound HTTPS under Node's default 250ms per-address attempt.
if (net.setDefaultAutoSelectFamilyAttemptTimeout) net.setDefaultAutoSelectFamilyAttemptTimeout(3000);
const cors = require('cors');
const config = require('./config');
const scheduler = require('./services/scheduler');
const errorHandler = require('./middleware/errorHandler');
const requireAuth = require('./middleware/requireAuth');

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/ai-tools', require('./routes/aiTools'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', requireAuth, require('./routes/projects'));
app.use('/api/templates', requireAuth, require('./routes/templates'));
app.use('/api/export', requireAuth, require('./routes/exports'));
app.use('/api/tasks', requireAuth, require('./routes/tasks'));
app.use('/api/literature', requireAuth, require('./routes/literature'));
app.use('/api/ethics', requireAuth, require('./routes/ethics'));
app.use('/api/journals', require('./routes/journals'));
app.use('/api/news', require('./routes/news'));
app.use('/api/conferences', require('./routes/conferences'));
app.use('/api/assistant', requireAuth, require('./routes/assistant'));

const frontendDir = require('path').join(__dirname, 'frontend');
app.use(express.static(frontendDir));
app.get('/', (req, res) => res.sendFile(require('path').join(frontendDir, 'researchflow-app-connected.html')));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[server] ResearchFlow backend listening on :${config.port}`);
  scheduler.start();
});
