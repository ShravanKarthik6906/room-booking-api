jest.mock('../config/supabaseClient', () => require('./helpers/mockSupabase'));
const request = require('supertest');
const app = require('../server');
const mock = require('./helpers/mockSupabase');
const { USER, TOKEN, AUTH, ROOM_ID, START, END } = require('./helpers/fixtures');

const valid = { room_id: ROOM_ID, start_time: START, end_time: END };

function book(body) {
  return request(app).post('/api/book').set(AUTH).send(body);
}

beforeEach(() => {
  mock.reset();
  mock.setUser(TOKEN, USER);
});

describe('POST /api/book', () => {
  test('201 creates a booking for the logged-in user', async () => {
    const created = { id: 1, room_id: ROOM_ID, user_id: USER.id, start_time: START, end_time: END, status: 'confirmed' };
    mock.queue('rooms', { data: { id: ROOM_ID } });
    mock.queue('bookings', { data: [] }); // pre-check: no conflicts
    mock.queue('bookings', { data: created }); // insert

    const res = await book(valid);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    const insert = mock.state.calls[2].ops.find((op) => op[0] === 'insert');
    expect(insert[1]).toEqual({
      room_id: ROOM_ID,
      user_id: USER.id, // taken from the token, never from the request body
      start_time: '2099-07-10T14:00:00.000Z',
      end_time: '2099-07-10T15:00:00.000Z',
    });
  });

  test('pre-check looks for confirmed bookings that overlap', async () => {
    mock.queue('rooms', { data: { id: ROOM_ID } });
    mock.queue('bookings', { data: [] });
    mock.queue('bookings', { data: { id: 1 } });

    await book(valid);

    const ops = mock.state.calls[1].ops;
    expect(ops).toContainEqual(['eq', 'room_id', ROOM_ID]);
    expect(ops).toContainEqual(['eq', 'status', 'confirmed']);
    expect(ops).toContainEqual(['lt', 'start_time', '2099-07-10T15:00:00.000Z']);
    expect(ops).toContainEqual(['gt', 'end_time', '2099-07-10T14:00:00.000Z']);
  });

  test('409 when the pre-check finds an overlapping booking', async () => {
    mock.queue('rooms', { data: { id: ROOM_ID } });
    mock.queue('bookings', { data: [{ id: 9, start_time: START, end_time: END }] });

    const res = await book(valid);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already booked/);
  });

  test('409 when the database exclusion constraint fires (23P01 race)', async () => {
    mock.queue('rooms', { data: { id: ROOM_ID } });
    mock.queue('bookings', { data: [] }); // pre-check saw nothing...
    mock.queue('bookings', { error: { code: '23P01', message: 'conflicting key value violates exclusion constraint' } });

    const res = await book(valid);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Room is already booked for an overlapping time' });
  });

  test('401 without a token', async () => {
    const res = await request(app).post('/api/book').send(valid);
    expect(res.status).toBe(401);
  });

  test('404 when the room does not exist', async () => {
    mock.queue('rooms', { data: null });
    const res = await book(valid);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Room not found' });
  });

  test.each([
    ['missing room_id', { start_time: START, end_time: END }, /required/],
    ['missing start_time', { room_id: ROOM_ID, end_time: END }, /required/],
    ['missing end_time', { room_id: ROOM_ID, start_time: START }, /required/],
    ['empty body', {}, /required/],
    ['invalid UUID', { ...valid, room_id: 'room-1' }, /UUID/],
    ['UUID as a number', { ...valid, room_id: 12345 }, /UUID/],
    ['non-ISO start', { ...valid, start_time: 'tomorrow at 2' }, /ISO 8601/],
    ['impossible date', { ...valid, start_time: '2099-02-30T10:00:00Z' }, /ISO 8601/],
    ['no timezone', { ...valid, start_time: '2099-07-10T14:00:00' }, /ISO 8601/],
    ['end equals start', { ...valid, end_time: START }, /after start_time/],
    ['end before start', { ...valid, start_time: END, end_time: START }, /after start_time/],
    ['in the past', { ...valid, start_time: '2020-01-01T10:00:00Z', end_time: '2020-01-01T11:00:00Z' }, /past/],
  ])('400 for %s', async (_label, body, message) => {
    const res = await book(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
    expect(mock.state.calls).toHaveLength(0); // never reached the database
  });

  test('400 when the body is a JSON array', async () => {
    const res = await book([1, 2]);
    expect(res.status).toBe(400);
  });

  test('500 on another database error during insert', async () => {
    mock.queue('rooms', { data: { id: ROOM_ID } });
    mock.queue('bookings', { data: [] });
    mock.queue('bookings', { error: { code: '42501', message: 'permission denied' } });

    const res = await book(valid);
    expect(res.status).toBe(500);
  });
});
