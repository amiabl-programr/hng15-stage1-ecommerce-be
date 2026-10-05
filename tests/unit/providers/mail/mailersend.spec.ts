import { jest } from '@jest/globals';
import { _setEnvForTesting } from '../../../../src/config/env.ts';
import { sendMailViaMailerSend, mailerSendClient, parseEmailAddress } from '../../../../src/providers/mail/mailersend.ts';

describe('MailerSend mail provider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    _setEnvForTesting({
      mailerSendKey: 'ms_valid_api_key_123456789',
      mailerSendFrom: 'Roofing Shop <orders@roofingco.com>',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    _setEnvForTesting(undefined);
    jest.restoreAllMocks();
  });

  describe('parseEmailAddress', () => {
    it('parses email with display name', () => {
      expect(parseEmailAddress('Roofing Construction Shop <orders@roofingco.com>')).toEqual({
        name: 'Roofing Construction Shop',
        email: 'orders@roofingco.com',
      });
    });

    it('parses plain email address', () => {
      expect(parseEmailAddress('orders@roofingco.com')).toEqual({
        email: 'orders@roofingco.com',
      });
    });

    it('formats bare domain without username by prepending info@', () => {
      expect(parseEmailAddress('test-pzkmgq7e65yl059v.mlsender.net', 'Roofing Construction Shop')).toEqual({
        name: 'Roofing Construction Shop',
        email: 'info@test-pzkmgq7e65yl059v.mlsender.net',
      });
    });

    it('formats bare domain inside angle brackets', () => {
      expect(parseEmailAddress('Roofing Construction Shop <test-pzkmgq7e65yl059v.mlsender.net>')).toEqual({
        name: 'Roofing Construction Shop',
        email: 'info@test-pzkmgq7e65yl059v.mlsender.net',
      });
    });
  });

  it('returns early failure if MAILER_SEND_KEY is not configured', async () => {
    _setEnvForTesting({
      mailerSendKey: undefined,
    });

    const result = await sendMailViaMailerSend({
      to: 'buyer@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('MAILER_SEND_KEY is not configured');
  });

  it('sends email successfully via MailerSend API with 202 Accepted', async () => {
    const mockHeaders = new Headers();
    mockHeaders.set('x-message-id', 'mailersend-msg-999');

    const mockFetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 202,
        statusText: 'Accepted',
        headers: mockHeaders,
      } as unknown as Response),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const result = await sendMailViaMailerSend({
      to: 'buyer@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('mailersend-msg-999');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('handles API error response from MailerSend gracefully without throwing', async () => {
    const mockFetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        text: () => Promise.resolve('Sender domain unverified'),
      } as unknown as Response),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const result = await mailerSendClient.sendMailViaMailerSend({
      to: 'buyer@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('MailerSend HTTP 422: Sender domain unverified');
  });

  it('catches network exception and returns structured failure', async () => {
    const mockFetch = jest.fn().mockImplementation(() =>
      Promise.reject(new Error('Connection reset')),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const result = await sendMailViaMailerSend({
      to: 'buyer@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Connection reset');
  });
});
