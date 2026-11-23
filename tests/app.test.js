jest.mock('../config/supabaseClient', () => require('./helpers/mockSupabase'));
const request = require('supertest');
const app = require('../server');

describe('app-level handlers', () => {
  test('unknown route returns JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Route not found/);
  });

  test('malformed JSON body returns 400', async () => {
    const res = await request(app)
      .post('/api/book')
      .set('Content-Type', 'application/json')
      .send('{"room_id": ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Malformed JSON in request body' });
  });
});
