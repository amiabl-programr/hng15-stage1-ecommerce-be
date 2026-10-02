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

const server = createApp().listen(port, () => {
  logger.info('api listening', { port, env: nodeEnv });
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info('shutdown signal received', { signal });
    void closeServer(server, { log: logger.info }).then(() => {
      process.exit(0);
    });
  });
}