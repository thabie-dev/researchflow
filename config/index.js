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

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
};
