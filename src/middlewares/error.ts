import { ZodError } from 'zod';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { AppError, InternalError, ValidationError, isAppError } from '../lib/errors.ts';
import { logger } from '../lib/logger.ts';

export type ErrorEnvelope = {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly fields: readonly { readonly path: string; readonly message: string }[];
  };
};

export function errorEnvelope(error: AppError): ErrorEnvelope {
  return {
    error: {
      code: error.code,
      message: error.message,
      fields: error.fields,
    },
  };
}

const BODY_PARSER_MESSAGES: Readonly<Record<string, string>> = {
  'entity.parse.failed': 'Request body is not valid JSON',
  'entity.too.large': 'Request body is too large',
};

function fromBodyParser(error: unknown): AppError | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const { type } = error as { readonly type?: unknown };
  if (typeof type !== 'string') {
    return undefined;
  }

  const message = BODY_PARSER_MESSAGES[type];
  return message === undefined ? undefined : new ValidationError(message);
}

function fromZodError(error: unknown): AppError | undefined {
  if (error instanceof ZodError || (typeof error === 'object' && error !== null && 'issues' in error)) {
    const zodError = error as ZodError;
    const fields = (zodError.issues || []).map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return new ValidationError('Validation failed', fields);
  }
  return undefined;
}

function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }
  return fromZodError(error) ?? fromBodyParser(error) ?? new InternalError(error);
}

function describeCause(cause: unknown): string | undefined {
  if (cause === undefined || cause === null) {
    return undefined;
  }
  if (cause instanceof Error) {
    return `${cause.name}: ${cause.message}`;
  }
  if (typeof cause === 'object') {
    try {
      return JSON.stringify(cause);
    } catch {
      return String(cause);
    }
  }
  return String(cause);
}

/**
 * The only place an error becomes a response. A cause the API did not author is
 * logged with the request id and replaced with a fixed message — notes.md §6 records
 * that the current implementation recovers auth failures by testing
 * `err.message.startsWith("Forbidden")`, which is how a driver error reached a
 * user-facing string.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const reported = toAppError(error);

  if (reported.status >= 500) {
    logger.error('request failed', {
      requestId: req.requestId,
      code: reported.code,
      status: reported.status,
      method: req.method,
      path: req.path,
      cause: describeCause(reported.cause),
    });
  }

  res.status(reported.status).json(errorEnvelope(reported));
}

export const notFoundHandler: RequestHandler = (req, res) => {
  const error = new AppError('NOT_FOUND', `No route for ${req.method} ${req.path}`, 404);
  res.status(error.status).json(errorEnvelope(error));
};