import {
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  getGoogleUserInfo,
} from '../../../src/lib/google.ts';
import { UnauthorizedError } from '../../../src/lib/errors.ts';

describe('google OAuth lib', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('buildGoogleAuthUrl', () => {
    it('constructs a valid Google OAuth authorization URL with required scopes', () => {
      const state = 'test-state-nonce';
      const url = buildGoogleAuthUrl(state);

      const parsed = new URL(url);
      expect(parsed.origin).toBe('https://accounts.google.com');
      expect(parsed.pathname).toBe('/o/oauth2/v2/auth');
      expect(parsed.searchParams.get('response_type')).toBe('code');
      expect(parsed.searchParams.get('scope')).toBe('openid email profile');
      expect(parsed.searchParams.get('state')).toBe(state);
      expect(parsed.searchParams.get('access_type')).toBe('offline');
      expect(parsed.searchParams.get('prompt')).toBe('consent');
      expect(parsed.searchParams.get('redirect_uri')).toBeDefined();
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('exchanges authorization code for access token', async () => {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            access_token: 'mock-access-token',
            id_token: 'mock-id-token',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );

      const tokens = await exchangeCodeForTokens('valid-code');
      expect(tokens.accessToken).toBe('mock-access-token');
      expect(tokens.idToken).toBe('mock-id-token');
    });

    it('throws UnauthorizedError when exchange fails', async () => {
      global.fetch = async () =>
        new Response('invalid_grant', { status: 400 });

      await expect(exchangeCodeForTokens('bad-code')).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it('throws UnauthorizedError when access token is missing in response', async () => {
      global.fetch = async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      await expect(exchangeCodeForTokens('code-without-token')).rejects.toThrow(
        UnauthorizedError,
      );
    });
  });

  describe('getGoogleUserInfo', () => {
    it('retrieves user profile info from Google', async () => {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            id: 'google-12345',
            email: 'user@example.com',
            name: 'Jane Doe',
            picture: 'https://lh3.googleusercontent.com/avatar',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );

      const userInfo = await getGoogleUserInfo('mock-token');
      expect(userInfo.id).toBe('google-12345');
      expect(userInfo.email).toBe('user@example.com');
      expect(userInfo.name).toBe('Jane Doe');
      expect(userInfo.picture).toBe('https://lh3.googleusercontent.com/avatar');
    });

    it('throws UnauthorizedError when userinfo request fails', async () => {
      global.fetch = async () => new Response('Unauthorized', { status: 401 });

      await expect(getGoogleUserInfo('bad-token')).rejects.toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError when required id or email fields are missing', async () => {
      global.fetch = async () =>
        new Response(JSON.stringify({ name: 'Jane' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      await expect(getGoogleUserInfo('token-missing-fields')).rejects.toThrow(
        UnauthorizedError,
      );
    });
  });
});
