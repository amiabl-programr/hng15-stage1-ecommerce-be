import { classifyCreateOrderError } from '../../../src/models/order.model.ts';
import {
  InsufficientStockError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '../../../src/lib/errors.ts';

/**
 * The `create_order` RPC reports failures only as RAISE EXCEPTION strings. These
 * tests pin the classification so a client can tell "fix your cart" apart from
 * "this row does not exist" apart from "our fault".
 */
describe('classifyCreateOrderError', () => {
  it('maps a missing product to NOT_FOUND rather than a 400 validation error', () => {
    const error = classifyCreateOrderError({
      message: 'Product with id 4c89c859-32e4-445b-800d-090fa80b8271 not found or inactive',
    });

    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).status).toBe(404);
    expect((error as NotFoundError).code).toBe('NOT_FOUND');
    expect(error.message).toContain('4c89c859-32e4-445b-800d-090fa80b8271');
  });

  it('maps a missing variant to NOT_FOUND', () => {
    const error = classifyCreateOrderError({
      message: 'Variant with id 085d30a3-42b6-4f8b-9f3e-56505dab5127 not found or inactive',
    });

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).toContain('085d30a3-42b6-4f8b-9f3e-56505dab5127');
  });

  it('maps the stock raise to InsufficientStockError', () => {
    const error = classifyCreateOrderError({
      message: 'INSUFFICIENT_STOCK: Only 2 items left in stock for 0.55mm / Charcoal',
    });

    expect(error).toBeInstanceOf(InsufficientStockError);
    expect((error as InsufficientStockError).status).toBe(409);
    expect((error as InsufficientStockError).code).toBe('INSUFFICIENT_STOCK');
  });

  it('maps a minimum order quantity breach to ValidationError', () => {
    const error = classifyCreateOrderError({
      message: 'Quantity less than minimum order quantity min_order_quantity for Product',
    });

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).status).toBe(400);
  });

  it('does not leak an unrecognised driver message to the client', () => {
    const error = classifyCreateOrderError({
      message: 'relation "public.prods" does not exist at character 15',
    });

    expect(error).toBeInstanceOf(InternalError);
    expect((error as InternalError).status).toBe(500);
    expect(error.message).not.toContain('public.prods');
  });

  it('treats an empty message as an internal fault', () => {
    expect(classifyCreateOrderError({ message: '' })).toBeInstanceOf(InternalError);
    expect(classifyCreateOrderError({})).toBeInstanceOf(InternalError);
  });

  it('preserves the original error as the cause of an internal fault', () => {
    const cause = { message: 'connection terminated unexpectedly' };
    const error = classifyCreateOrderError(cause) as InternalError;

    expect(error.cause).toBe(cause);
  });
});