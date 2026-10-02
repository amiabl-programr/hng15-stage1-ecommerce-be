import { ERROR_CODES, type ErrorCode } from '../contracts/schemas/common.ts';

export { ERROR_CODES, type ErrorCode };

export type FieldIssue = {
  readonly path: string;
  readonly message: string;
};

export class AppError extends Error {
  readonly isAppError = true;
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields: readonly FieldIssue[];

  constructor(
    code: ErrorCode,
    message: string,
    status: number,
    fields: readonly FieldIssue[] = [],
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fields: readonly FieldIssue[] = []) {
    super('VALIDATION_ERROR', message, 400, fields);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Not permitted') {
    super('FORBIDDEN', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}

export class InsufficientStockError extends AppError {
  constructor(message = 'Insufficient stock for one or more items') {
    super('INSUFFICIENT_STOCK', message, 409);
  }
}

export class InvalidStateError extends AppError {
  constructor(message: string) {
    super('INVALID_STATE', message, 422);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = 'Unsupported media type') {
    super('UNSUPPORTED_MEDIA_TYPE', message, 415);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests') {
    super('RATE_LIMITED', message, 429);
  }
}

/**
 * Wraps a cause the caller must never see. The cause is logged with the request id;
 * the client receives a fixed message. notes.md §6 is explicit that no error string
 * reaches the response, and that this is how a database driver message ended up in a
 * user-facing string in the current implementation.
 */
export class InternalError extends AppError {
  override readonly cause: unknown;

  constructor(cause: unknown, message = 'Internal server error') {
    super('INTERNAL_ERROR', message, 500);
    this.cause = cause;
  }
}

export function isAppError(value: unknown): value is AppError {
  return (
    value instanceof AppError ||
    (typeof value === 'object' &&
      value !== null &&
      'isAppError' in value &&
      (value as { isAppError: unknown }).isAppError === true)
  );
}