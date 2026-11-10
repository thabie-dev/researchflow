require('dotenv').config();
const path = require('path');

module.exports = {
  port: process.env.PORT || 4000,
  corsOrigin: process.env.CORS_ORIGIN || '*',

  dataDir: path.resolve(process.env.DATA_DIR || './data'),

  discoveryEnabled: (process.env.DISCOVERY_ENABLED || 'true') === 'true',
  cronSchedule: process.env.CRON_SCHEDULE || '0 3 * * 1',

  searchProvider: (process.env.SEARCH_PROVIDER || 'none').toLowerCase(),
  serpApiKey: process.env.SERPAPI_KEY || '',
  bingApiKey: process.env.BING_API_KEY || '',

  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 4000}`,
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
};
