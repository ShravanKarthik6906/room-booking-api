jest.mock('../config/supabaseClient', () => require('./helpers/mockSupabase'));
const request = require('supertest');
const app = require('../server');
const mock = require('./helpers/mockSupabase');

beforeEach(() => mock.reset());

describe('GET /api/health', () => {
  test('200 when Supabase answers', async () => {
    mock.queue('rooms', { data: null, error: null });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', supabase: 'reachable' });
  });

  test('500 when Supabase returns an error', async () => {
    mock.queue('rooms', { error: { message: 'fetch failed' } });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ status: 'error', supabase: 'unreachable' });
    expect(res.body.error).toBe('fetch failed');
  });
});
