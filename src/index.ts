// Must be first: ES modules evaluate in import order, and config/supabase.ts reads
// process.env at module load. Loading dotenv anywhere later would arrive after the
// boot-time env validation it exists to feed.
import './config/load-env-file.ts';

import { createApp } from './app.ts';
import { env } from './config/env.ts';
import './config/supabase.ts';
import { logger } from './lib/logger.ts';
import { closeServer } from './lib/shutdown.ts';

const { port, nodeEnv } = env();

const server = createApp().listen(port, '0.0.0.0', () => {
  logger.info('api listening', { port, host: '0.0.0.0', env: nodeEnv });
});

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

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info('shutdown signal received', { signal });
    void closeServer(server, { log: logger.info }).then(() => {
      process.exit(0);
    });
  });
}