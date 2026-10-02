import { jest } from '@jest/globals';
import { Router } from 'express';
import request from 'supertest';

import { createApp } from '../../src/app.ts';
import { AppError } from '../../src/lib/errors.ts';
import { createOriginAllowlist } from '../../src/lib/origin-allowlist.ts';

const allowedOrigins = ['http://localhost:3000', 'https://roofingco.com'];

function app() {
  return createApp({ corsOrigins: allowedOrigins });
}

describe('createOriginAllowlist', () => {
  it('trims entries and drops blanks', () => {
    const allowlist = createOriginAllowlist(' http://a.test , ,https://b.test ,');

    expect(allowlist.has('http://a.test')).toBe(true);
    expect(allowlist.has('https://b.test')).toBe(true);
    expect(allowlist.size).toBe(2);
  });

  it('matches exactly, never by suffix', () => {
    const allowlist = createOriginAllowlist('https://roofingco.com');

    expect(allowlist.has('https://evil-roofingco.com')).toBe(false);
    expect(allowlist.has('https://roofingco.com.evil.test')).toBe(false);
  });
});

describe('app assembly', () => {
  it('answers the health probe', async () => {
    const response = await request(app()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, status: 'ok' });
  });

  it('sets hardening headers', async () => {
    const response = await request(app()).get('/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('request ids', () => {
  it('echoes a caller-supplied id', async () => {
    const response = await request(app()).get('/health').set('x-request-id', 'req-4711');

    expect(response.headers['x-request-id']).toBe('req-4711');
  });

  it('generates an id when the caller supplies none', async () => {
    const response = await request(app()).get('/health');

    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe('cors allowlist', () => {
  it('reflects an allowed origin', async () => {
    const response = await request(app()).get('/health').set('Origin', 'https://roofingco.com');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://roofingco.com');
  });

  it('allows credentials so the session cookie survives a cross-origin call', async () => {
    const response = await request(app()).get('/health').set('Origin', 'https://roofingco.com');

    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('rejects an origin that is not on the list', async () => {
    const response = await request(app()).get('/health').set('Origin', 'https://evil.test');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows same-origin and server-to-server calls that send no Origin', async () => {
    const response = await request(app()).get('/health');

    expect(response.status).toBe(200);
  });
});

describe('unmatched routes', () => {
  it('returns a NOT_FOUND envelope', async () => {
    const response = await request(app()).get('/nope');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'No route for GET /nope',
        fields: [],
      },
    });
  });
});

describe('error handler', () => {
  function appThrowing(error: unknown) {
    const router = Router();
    router.get('/boom', () => {
      throw error;
    });
    return createApp({ corsOrigins: allowedOrigins, routers: [router] });
  }

  it('passes an AppError through with its own status and code', async () => {
    const response = await request(appThrowing(new AppError('INVALID_STATE', 'order is paid', 422)))
      .get('/boom')
      .set('x-request-id', 'req-9001');

    expect(response.status).toBe(422);
    expect(response.body.error).toEqual({
      code: 'INVALID_STATE',
      message: 'order is paid',
      fields: [],
    });
  });

  it('replaces an unrecognised error with a 500 and does not leak its message', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const response = await request(
        appThrowing(new Error('connect ECONNREFUSED 127.0.0.1:54322')),
      ).get('/boom');

      expect(response.status).toBe(500);
      expect(response.body.error).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        fields: [],
      });
      expect(JSON.stringify(response.body)).not.toContain('54322');
    } finally {
      spy.mockRestore();
    }
  });

  it('correlates the 500 log line with the request id', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await request(appThrowing(new Error('boom'))).get('/boom').set('x-request-id', 'req-9002');

      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0]?.[0])).toContain('req-9002');
    } finally {
      spy.mockRestore();
    }
  });

  it('reports a malformed json body as a validation failure, not a server fault', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const response = await request(app())
        .post('/health')
        .set('Content-Type', 'application/json')
        .send('{"broken":');

      expect(response.status).toBe(400);
      expect(response.body.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Request body is not valid JSON',
        fields: [],
      });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('does not log a 4xx, which is not a server fault', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await request(appThrowing(new AppError('CONFLICT', 'duplicate', 409))).get('/boom');

      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});