jest.mock('../config/supabaseClient', () => require('./helpers/mockSupabase'));
const request = require('supertest');
const app = require('../server');
const mock = require('./helpers/mockSupabase');
const { USER, TOKEN, AUTH } = require('./helpers/fixtures');

beforeEach(() => {
  mock.reset();
  mock.setUser(TOKEN, USER);
});

describe('auth middleware (via GET /api/auth/me)', () => {
  test('401 with no Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Authorization header/);
  });

  test('401 when the scheme is not Bearer', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Token ${TOKEN}`);
    expect(res.status).toBe(401);
  });

  test('401 with an invalid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
  });

  test('uses a per-request client carrying the user token (so RLS applies)', async () => {
    mock.queue('profiles', { data: { id: USER.id } });
    await request(app).get('/api/auth/me').set(AUTH);
    expect(mock.state.tokens).toContain(TOKEN);
  });
});

describe('GET /api/auth/me', () => {
  test('200 with the profile row', async () => {
    const profile = { id: USER.id, full_name: 'Scarlet Knight', email: USER.email, created_at: '2026-11-01T00:00:00Z' };
    mock.queue('profiles', { data: profile });

    const res = await request(app).get('/api/auth/me').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(profile);
    expect(mock.state.calls[0].ops).toContainEqual(['eq', 'id', USER.id]);
  });

  test('404 when the profile row is missing', async () => {
    mock.queue('profiles', { data: null });
    const res = await request(app).get('/api/auth/me').set(AUTH);
    expect(res.status).toBe(404);
  });

  test('500 on a database error', async () => {
    mock.queue('profiles', { error: { message: 'db down' } });
    const res = await request(app).get('/api/auth/me').set(AUTH);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'db down' });
  });
});
