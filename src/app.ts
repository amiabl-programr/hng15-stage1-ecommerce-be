import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type Router } from 'express';
import helmet from 'helmet';

import { env } from './config/env.ts';
import { ForbiddenError } from './lib/errors.ts';
import { createOriginAllowlist } from './lib/origin-allowlist.ts';
import { errorHandler, notFoundHandler } from './middlewares/error.ts';
import { requestId } from './middlewares/request-id.ts';
import { requestLogger } from './middlewares/request-logger.ts';
import { accountRouter } from './routes/account.routes.ts';
import { adminRouter } from './routes/admin.routes.ts';
import { authRouter } from './routes/auth.routes.ts';
import { cartRouter } from './routes/cart.routes.ts';
import { catalogRouter } from './routes/catalog.routes.ts';
import { checkoutRouter } from './routes/checkout.routes.ts';
import { fabricationRouter } from './routes/fabrication.routes.ts';
import { healthRouter } from './routes/health.routes.ts';
import { mediaRouter } from './routes/media.routes.ts';

const JSON_BODY_LIMIT = '1mb';

export type AppOptions = {
  readonly corsOrigins?: readonly string[];
  readonly routers?: readonly Router[];
};

function createCorsMiddleware(allowed: ReadonlySet<string>): ReturnType<typeof cors> {
  return cors({
    credentials: true,
    origin(origin, callback) {
      // A missing Origin means a same-origin, curl, or server-to-server request.
      // Reflecting the header instead would make the allowlist decorative.
      if (origin === undefined || allowed.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new ForbiddenError('Origin not allowed'));
    },
  });
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const allowlist = createOriginAllowlist(
    (options.corsOrigins ?? env().corsOrigins).join(','),
  );

  app.use(requestId);
  app.use(requestLogger);
  app.use(helmet());
  app.use(createCorsMiddleware(allowlist));
  app.use(cookieParser());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use(healthRouter);
  app.use(authRouter);
  app.use(accountRouter);
  app.use(cartRouter);
  app.use(catalogRouter);
  app.use(mediaRouter);
  app.use(checkoutRouter);
  app.use(fabricationRouter);
  app.use(adminRouter);

  for (const router of options.routers ?? []) {
    app.use(router);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}