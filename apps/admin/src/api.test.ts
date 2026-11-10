import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, setCsrf } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('admin API client', () => {
  it('sends credentials on every call and the CSRF token only on writes', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    setCsrf('token-123');
    await api('/reports/summary');
    await api('/content/drafts', { method: 'POST', body: { a: 1 } });
    expect(calls[0]!.init.credentials).toBe('include');
    expect((calls[0]!.init.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined();
    expect((calls[1]!.init.headers as Record<string, string>)['X-CSRF-Token']).toBe('token-123');
    expect(calls[1]!.url).toMatch(/\/admin\/v1\/content\/drafts$/);
  });

  it('turns error responses into ApiError with the server code and message', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'totp_required', message: 'Two-factor authentication is required.' }), { status: 403 }));
    await expect(api('/users')).rejects.toMatchObject({ status: 403, code: 'totp_required' });
    await expect(api('/users')).rejects.toBeInstanceOf(ApiError);
  });
});
