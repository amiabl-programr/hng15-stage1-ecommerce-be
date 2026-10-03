import type { NextFunction, Request, Response } from 'express';

import { logger } from '../lib/logger.ts';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedNs = process.hrtime.bigint() - startTime;
    const durationMs = Math.round(Number(elapsedNs) / 1_000_000);
    const path = req.originalUrl ? (req.originalUrl.split('?')[0] ?? req.path) : req.path;

    logger.info('request completed', {
      requestId: req.requestId,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs,
      userId: req.user?.id,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
  });

  next();
}
