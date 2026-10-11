const express = require('express');
const cors = require('cors');
const config = require('./config');
const scheduler = require('./services/scheduler');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/ai-tools', require('./routes/aiTools'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/ethics', require('./routes/ethics'));
app.use('/api/journals', require('./routes/journals'));
app.use('/api/assistant', require('./routes/assistant'));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[server] ResearchFlow backend listening on :${config.port}`);
  scheduler.start();
});
