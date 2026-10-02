import {
  AppError,
  ConflictError,
  ERROR_CODES,
  ForbiddenError,
  InsufficientStockError,
  InternalError,
  InvalidStateError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  UnsupportedMediaTypeError,
  ValidationError,
  isAppError,
} from '../../../src/lib/errors.ts';

describe('AppError', () => {
  it('carries its code, status and fields', () => {
    const error = new AppError('CONFLICT', 'already exists', 409, [
      { path: 'sku', message: 'taken' },
    ]);

    expect(error.code).toBe('CONFLICT');
    expect(error.status).toBe(409);
    expect(error.fields).toEqual([{ path: 'sku', message: 'taken' }]);
    expect(error.name).toBe('AppError');
    expect(error).toBeInstanceOf(Error);
  });

  it('defaults fields to an empty list', () => {
    expect(new AppError('NOT_FOUND', 'nope', 404).fields).toEqual([]);
  });

  it('names each subclass after itself', () => {
    expect(new NotFoundError().name).toBe('NotFoundError');
    expect(new InternalError(new Error('x')).name).toBe('InternalError');
  });
});

describe('subclass statuses', () => {
  const cases = [
    [new ValidationError('bad'), 400, 'VALIDATION_ERROR'],
    [new UnauthorizedError(), 401, 'UNAUTHORIZED'],
    [new ForbiddenError(), 403, 'FORBIDDEN'],
    [new NotFoundError(), 404, 'NOT_FOUND'],
    [new ConflictError('dup'), 409, 'CONFLICT'],
    [new InsufficientStockError(), 409, 'INSUFFICIENT_STOCK'],
    [new InvalidStateError('bad state'), 422, 'INVALID_STATE'],
    [new UnsupportedMediaTypeError(), 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [new RateLimitedError(), 429, 'RATE_LIMITED'],
    [new InternalError(new Error('boom')), 500, 'INTERNAL_ERROR'],
  ] as const;

  it.each(cases)('%s maps to %i / %s', (error, status, code) => {
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(isAppError(error)).toBe(true);
  });

  it('covers every declared code', () => {
    const covered = new Set(cases.map(([error]) => error.code));

    expect([...covered].sort()).toEqual([...ERROR_CODES].sort());
  });
});

describe('isAppError', () => {
  it('rejects errors the API did not author', () => {
    expect(isAppError(new Error('plain'))).toBe(false);
    expect(isAppError('string')).toBe(false);
    expect(isAppError(undefined)).toBe(false);
    expect(isAppError({ code: 'NOT_FOUND', status: 404 })).toBe(false);
  });
});

describe('InternalError', () => {
  it('keeps the cause for logging but defaults the message', () => {
    const cause = new Error('supabase postgrest error: permission denied');
    const error = new InternalError(cause);

    expect(error.cause).toBe(cause);
    expect(error.message).toBe('Internal server error');
  });
});

describe('ValidationError', () => {
  it('carries field issues through', () => {
    const error = new ValidationError('invalid', [{ path: 'items[1].quantity', message: 'too low' }]);

    expect(error.fields).toHaveLength(1);
    expect(error.fields[0]?.path).toBe('items[1].quantity');
  });
});