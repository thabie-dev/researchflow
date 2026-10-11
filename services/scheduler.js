const cron = require('node-cron');
const config = require('../config');
const discovery = require('./discovery');

let task = null;

function start() {
  if (!config.discoveryEnabled) {
    console.log('[scheduler] Discovery disabled (DISCOVERY_ENABLED=false). Serving seed catalog only.');
    return;
  }

  if (!cron.validate(config.cronSchedule)) {
    console.error(`[scheduler] Invalid CRON_SCHEDULE "${config.cronSchedule}" — scheduler not started.`);
    return;
  }

  task = cron.schedule(config.cronSchedule, async () => {
    console.log('[scheduler] Running scheduled AI-tools discovery...');
    try {
      const summary = await discovery.runDiscoveryForAllStages();
      console.log('[scheduler] Discovery complete:', summary);
    } catch (err) {
      console.error('[scheduler] Discovery run failed:', err);
    }
  });

  console.log(`[scheduler] AI-tools discovery scheduled: "${config.cronSchedule}"`);
}

function stop() {
  if (task) task.stop();
}

module.exports = { start, stop };
