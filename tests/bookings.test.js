jest.mock('../config/supabaseClient', () => require('./helpers/mockSupabase'));
const request = require('supertest');
const app = require('../server');
const mock = require('./helpers/mockSupabase');
const { USER, OTHER_USER, TOKEN, AUTH, ROOM_ID } = require('./helpers/fixtures');

beforeEach(() => {
  mock.reset();
  mock.setUser(TOKEN, USER);
});

describe('GET /api/bookings/me', () => {
  test('200 returns only my bookings, upcoming first then past (newest first)', async () => {
    const room = { name: 'Room 120', building: 'Busch Student Center' };
    // The database returns them sorted by start_time ascending
    const rows = [
      { id: 1, start_time: '2020-01-01T10:00:00Z', end_time: '2020-01-01T11:00:00Z', status: 'confirmed', room },
      { id: 2, start_time: '2021-01-01T10:00:00Z', end_time: '2021-01-01T11:00:00Z', status: 'cancelled', room },
      { id: 3, start_time: '2099-01-01T10:00:00Z', end_time: '2099-01-01T11:00:00Z', status: 'confirmed', room },
      { id: 4, start_time: '2099-06-01T10:00:00Z', end_time: '2099-06-01T11:00:00Z', status: 'confirmed', room },
    ];
    mock.queue('bookings', { data: rows });

    const res = await request(app).get('/api/bookings/me').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.map((b) => b.id)).toEqual([3, 4, 2, 1]);
    expect(mock.state.calls[0].ops).toContainEqual(['eq', 'user_id', USER.id]);
  });

  test('401 without a token', async () => {
    const res = await request(app).get('/api/bookings/me');
    expect(res.status).toBe(401);
  });

  test('500 on a database error', async () => {
    mock.queue('bookings', { error: { message: 'db down' } });
    const res = await request(app).get('/api/bookings/me').set(AUTH);
    expect(res.status).toBe(500);
  });
});

describe('PATCH /api/bookings/:id/cancel', () => {
  const cancel = (id) => request(app).patch(`/api/bookings/${id}/cancel`).set(AUTH);

  test('200 cancels my own booking', async () => {
    mock.queue('bookings', { data: { id: 7, user_id: USER.id, status: 'confirmed' } });
    mock.queue('bookings', { data: { id: 7, room_id: ROOM_ID, user_id: USER.id, status: 'cancelled' } });

    const res = await cancel(7);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(mock.state.calls[1].ops).toContainEqual(['update', { status: 'cancelled' }]);
  });

  test("403 when cancelling someone else's booking", async () => {
    mock.queue('bookings', { data: { id: 7, user_id: OTHER_USER.id, status: 'confirmed' } });

    const res = await cancel(7);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'You can only cancel your own bookings' });
    expect(mock.state.calls).toHaveLength(1); // no update was attempted
  });

  test('404 when the booking does not exist', async () => {
    mock.queue('bookings', { data: null });
    const res = await cancel(999);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Booking not found' });
  });

  test('400 when the booking is already cancelled', async () => {
    mock.queue('bookings', { data: { id: 7, user_id: USER.id, status: 'cancelled' } });
    const res = await cancel(7);
    expect(res.status).toBe(400);
  });

  test.each(['abc', '-1', '1.5', '99999999999999999999'])('400 for id %p', async (id) => {
    const res = await cancel(id);
    expect(res.status).toBe(400);
  });

  test('401 without a token', async () => {
    const res = await request(app).patch('/api/bookings/7/cancel');
    expect(res.status).toBe(401);
  });
});
