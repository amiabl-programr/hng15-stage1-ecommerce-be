import { jest } from '@jest/globals';
import express, { type Request, type Response } from 'express';
import request from 'supertest';

import { requestId } from '../../../src/middlewares/request-id.ts';
import { requestLogger } from '../../../src/middlewares/request-logger.ts';

function createAppWithLogger() {
  const app = express();
  app.use(requestId);
  app.use(requestLogger);

  app.get('/test-route', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  app.get('/test-user', (req: Request, res: Response) => {
    req.user = {
      id: 'usr_12345',
      email: 'builder@example.com',
      fullName: 'Chief Builder',
      avatarUrl: null,
      role: 'customer',
      createdAt: new Date().toISOString(),
    };
    res.status(200).json({ ok: true });
  });

  app.post('/test-submit', (_req: Request, res: Response) => {
    res.status(201).json({ created: true });
  });

  return app;
}

describe('requestLogger middleware', () => {
  it('logs completed HTTP requests with method, path, status, and duration', async () => {
    const logs: string[] = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logs.push(String(line));
    });

    try {
      const app = createAppWithLogger();
      const res = await request(app)
        .get('/test-route?ref=search&utm_source=test')
        .set('x-request-id', 'req-custom-99')
        .set('User-Agent', 'TestClient/1.0');

      expect(res.status).toBe(200);
      expect(logs.length).toBe(1);

      const parsed = JSON.parse(logs[0] ?? '{}') as Record<string, unknown>;
      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('request completed');
      expect(parsed.requestId).toBe('req-custom-99');
      expect(parsed.method).toBe('GET');
      expect(parsed.path).toBe('/test-route');
      expect(parsed.status).toBe(200);
      expect(typeof parsed.durationMs).toBe('number');
      expect(parsed.userAgent).toBe('TestClient/1.0');
    } finally {
      spy.mockRestore();
    }
  });

  it('includes authenticated user id when present on request', async () => {
    const logs: string[] = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logs.push(String(line));
    });

    try {
      const app = createAppWithLogger();
      await request(app).get('/test-user');

      expect(logs.length).toBe(1);
      const parsed = JSON.parse(logs[0] ?? '{}') as Record<string, unknown>;
      expect(parsed.userId).toBe('usr_12345');
      expect(parsed.path).toBe('/test-user');
    } finally {
      spy.mockRestore();
    }
  });

  it('omits query parameters from logged path for data privacy', async () => {
    const logs: string[] = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logs.push(String(line));
    });

    try {
      const app = createAppWithLogger();
      await request(app).post('/test-submit?token=sensitive_query_param');

      expect(logs.length).toBe(1);
      const parsed = JSON.parse(logs[0] ?? '{}') as Record<string, unknown>;
      expect(parsed.path).toBe('/test-submit');
      expect(JSON.stringify(parsed)).not.toContain('sensitive_query_param');
    } finally {
      spy.mockRestore();
    }
  });
});
