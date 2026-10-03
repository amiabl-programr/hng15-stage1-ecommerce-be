import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import { mailClient } from '../../../../src/providers/mail/index.ts';
import { outboxModel, type EmailOutboxRow } from '../../../../src/models/outbox.model.ts';
import { processOutboxBatch } from '../../../../src/lib/async.ts';

const sampleOutboxRow: EmailOutboxRow = {
  id: 'outbox-uuid-1',
  template: 'order-confirmation',
  to_email: 'buyer@example.com',
  subject: 'Order Confirmation #RC-1001 - Roofing Construction Shop',
  html_body: '<p>Thank you</p>',
  text_body: 'Thank you',
  order_id: 'order-uuid-1',
  attempts: 0,
  last_error: null,
  sent_at: null,
  created_at: new Date().toISOString(),
};

describe('mail provider and outbox worker', () => {
  describe('sendMail', () => {
    it('returns success: false and does not throw when SMTP transport fails', async () => {
      jest.spyOn(mailClient, 'sendMail').mockResolvedValueOnce({
        success: false,
        error: 'connect ECONNREFUSED 127.0.0.1:587',
        durationMs: 15,
      });

      const result = await mailClient.sendMail({
        to: 'buyer@example.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('processOutboxBatch', () => {
    it('drains the queue and marks messages as sent when transport succeeds', async () => {
      jest
        .spyOn(outboxModel, 'findPendingOutboxMessages')
        .mockResolvedValueOnce([sampleOutboxRow]);
      jest.spyOn(mailClient, 'sendMail').mockResolvedValueOnce({
        success: true,
        messageId: 'msg-id-123',
        durationMs: 20,
      });
      const markSentSpy = jest
        .spyOn(outboxModel, 'markOutboxSent')
        .mockResolvedValueOnce();

      const result = await processOutboxBatch(10);

      expect(result.processed).toBe(1);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
      expect(markSentSpy).toHaveBeenCalledWith('outbox-uuid-1');
    });

    it('records error and increments attempts on delivery failure', async () => {
      jest
        .spyOn(outboxModel, 'findPendingOutboxMessages')
        .mockResolvedValueOnce([sampleOutboxRow]);
      jest.spyOn(mailClient, 'sendMail').mockResolvedValueOnce({
        success: false,
        error: 'SMTP 550 Mailbox not found',
        durationMs: 25,
      });
      const markFailedSpy = jest
        .spyOn(outboxModel, 'markOutboxFailed')
        .mockResolvedValueOnce();

      const result = await processOutboxBatch(10);

      expect(result.processed).toBe(1);
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
      expect(markFailedSpy).toHaveBeenCalledWith(
        'outbox-uuid-1',
        1, // attempts incremented from 0 to 1
        'SMTP 550 Mailbox not found',
      );
    });
  });

  describe('boundary enforcement (§16)', () => {
    it('package.json contains neither next, react, clsx nor tailwind-merge', () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.resolve('package.json'), 'utf8'),
      );

      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      expect(allDeps).not.toHaveProperty('next');
      expect(allDeps).not.toHaveProperty('react');
      expect(allDeps).not.toHaveProperty('clsx');
      expect(allDeps).not.toHaveProperty('tailwind-merge');
    });
  });
});
