// Must be first: ES modules evaluate in import order, and config/supabase.ts reads
// process.env at module load. Loading dotenv anywhere later would arrive after the
// boot-time env validation it exists to feed.
import './config/load-env-file.ts';

import { createApp } from './app.ts';
import { env } from './config/env.ts';
import './config/supabase.ts';
import { logger } from './lib/logger.ts';
import { closeServer } from './lib/shutdown.ts';
import { outboxWorker } from './lib/async.ts';

const { port, nodeEnv } = env();

const server = createApp().listen(port, '0.0.0.0', () => {
  logger.info('api listening', { port, host: '0.0.0.0', env: nodeEnv });
});

// Start background email outbox worker
const worker = outboxWorker.startOutboxWorker();

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled promise rejection', {
    reason: reason instanceof Error ? reason.stack || reason.message : String(reason),
  });
});

process.on('uncaughtException', (error) => {
  logger.error('uncaught exception', {
    error: error.stack || error.message,
  });
});

let shuttingDown = false;

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    worker.stop();
    logger.info('shutdown signal received', { signal });
    void closeServer(server, { log: logger.info })
      .catch((err) => {
        logger.error('error during shutdown', { error: String(err) });
      })
      .finally(() => {
        process.exit(0);
      });
  });
}