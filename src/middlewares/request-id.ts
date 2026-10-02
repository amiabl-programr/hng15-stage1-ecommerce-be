import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get(REQUEST_ID_HEADER);
  const id = incoming !== undefined && incoming.length > 0 ? incoming : randomUUID();

  req.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}