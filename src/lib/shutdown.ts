import type { Server } from 'node:http';

const DEFAULT_TIMEOUT_MS = 10_000;

export type ShutdownOptions = {
  timeoutMs?: number;
  onClose?: () => Promise<void> | void;
  log?: (message: string) => void;
};

export async function closeServer(
  server: Server,
  { timeoutMs = DEFAULT_TIMEOUT_MS, onClose, log = () => {} }: ShutdownOptions = {},
): Promise<void> {
  const forceTimer = setTimeout(() => {
    log('graceful shutdown timed out; forcing close');
    server.closeAllConnections();
  }, timeoutMs);
  forceTimer.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await onClose?.();
    log('http server closed');
  } finally {
    clearTimeout(forceTimer);
  }
}