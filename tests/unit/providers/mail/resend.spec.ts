import { jest } from '@jest/globals';
import { _setEnvForTesting } from '../../../../src/config/env.ts';
import { sendMailViaResend, resendClient } from '../../../../src/providers/mail/resend.ts';

describe('Resend mail provider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    _setEnvForTesting({
      resendApiKey: 're_valid_api_key_123456789',
      resendFrom: 'Roofing Shop <orders@roofingco.com>',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    _setEnvForTesting(undefined);
    jest.restoreAllMocks();
  });

  it('returns early failure if RESEND_API_KEY is not configured', async () => {
    _setEnvForTesting({
      resendApiKey: undefined,
    });

    const result = await sendMailViaResend({
      to: 'buyer@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('RESEND_API_KEY is not configured');
  });

  it('sends email successfully via Resend API', async () => {
    const mockFetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({ id: 'resend-msg-123' }),
      } as unknown as Response),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const result = await sendMailViaResend({
      to: 'buyer@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('resend-msg-123');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('handles API error response from Resend gracefully without throwing', async () => {
    const mockFetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        text: () => Promise.resolve('Domain not verified'),
      } as unknown as Response),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const result = await resendClient.sendMailViaResend({
      to: 'buyer@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Resend HTTP 422: Domain not verified');
  });

  it('catches network exception and returns structured failure', async () => {
    const mockFetch = jest.fn().mockImplementation(() =>
      Promise.reject(new Error('Network error')),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const result = await sendMailViaResend({
      to: 'buyer@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network error');
  });
});
