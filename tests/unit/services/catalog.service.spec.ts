import {
  decodeCursor,
  encodeCursor,
  getSuggestedAlt,
  resolveImageUrl,
} from '../../../src/services/catalog.service.ts';
import { ValidationError } from '../../../src/lib/errors.ts';

describe('catalog service unit tests', () => {
  describe('resolveImageUrl', () => {
    it('constructs absolute storage URL from storage path', () => {
      const url = resolveImageUrl('products/prod-123/image-456.webp');
      expect(url).toMatch(/^https?:\/\//);
      expect(url).toContain('/storage/v1/object/public/products/products/prod-123/image-456.webp');
    });

    it('returns empty string if path is empty', () => {
      expect(resolveImageUrl('')).toBe('');
    });

    it('returns existing URL if path is already absolute', () => {
      expect(resolveImageUrl('https://cdn.example.com/pic.jpg')).toBe(
        'https://cdn.example.com/pic.jpg',
      );
    });
  });

  describe('getSuggestedAlt', () => {
    it('produces cross-section sentence for profile role', () => {
      const alt = getSuggestedAlt('profile', 'Longspan Aluminium Sheet', 'longspan');
      expect(alt).toBe('Cross-section diagram of the longspan rib profile');
    });

    it('produces photograph sentence for other roles', () => {
      const alt = getSuggestedAlt('main', 'Longspan Aluminium Sheet', 'longspan');
      expect(alt).toBe('Photograph of Longspan Aluminium Sheet');
    });
  });

  describe('keyset cursor encoding and decoding', () => {
    it('round-trips valid cursor object', () => {
      const cursor = {
        createdAt: '2026-10-01T12:00:00.000Z',
        id: '11111111-1111-4111-8111-111111111111',
      };
      const encoded = encodeCursor(cursor);
      const decoded = decodeCursor(encoded);

      expect(decoded).toEqual(cursor);
    });

    it('throws ValidationError with field issue on invalid or malformed cursor', () => {
      expect(() => decodeCursor('not-base-64-json-invalid')).toThrow(ValidationError);

      const invalidPayload = Buffer.from(JSON.stringify({ bad: 'data' })).toString('base64url');
      expect(() => decodeCursor(invalidPayload)).toThrow(ValidationError);
    });
  });
});
