jest.mock('../config/supabaseClient', () => require('./helpers/mockSupabase'));
const request = require('supertest');
const app = require('../server');
const mock = require('./helpers/mockSupabase');
const { USER, TOKEN, AUTH, ROOM_ID } = require('./helpers/fixtures');

const ROOMS = [
  { id: ROOM_ID, name: 'Group Study Room 401', building: 'Alexander Library', capacity: 6 },
  { id: '0734814f-3b6f-4716-a9b1-2a9c1b4e0f11', name: 'Room 120', building: 'Busch Student Center', capacity: 30 },
];

beforeEach(() => {
  mock.reset();
  mock.setUser(TOKEN, USER);
});

describe('GET /api/spaces', () => {
  test('200 lists all rooms with no filters', async () => {
    mock.queue('rooms', { data: ROOMS });
    const res = await request(app).get('/api/spaces');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(ROOMS);
  });

  test('?name= does a case-insensitive partial match', async () => {
    mock.queue('rooms', { data: [ROOMS[0]] });
    const res = await request(app).get('/api/spaces?name=Library');
    expect(res.status).toBe(200);
    const orFilter = mock.state.calls[0].ops.find((op) => op[0] === 'or');
    expect(orFilter[1]).toBe('name.ilike."%Library%",building.ilike."%Library%"');
  });

  test('?name= treats % and quotes literally', async () => {
    mock.queue('rooms', { data: [] });
    await request(app).get('/api/spaces').query({ name: '50%"x' });
    const orFilter = mock.state.calls[0].ops.find((op) => op[0] === 'or');
    expect(orFilter[1]).toContain('"%50\\\\%\\"x%"');
  });

  test('?mincapacity= filters capacity >= n', async () => {
    mock.queue('rooms', { data: [ROOMS[1]] });
    const res = await request(app).get('/api/spaces?mincapacity=10');
    expect(res.status).toBe(200);
    expect(mock.state.calls[0].ops).toContainEqual(['gte', 'capacity', 10]);
  });

  test.each(['abc', '-5', '2.5', '', '99999999999'])('400 when mincapacity is %p', async (value) => {
    const res = await request(app).get('/api/spaces').query({ mincapacity: value });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/whole number/);
  });

  test('500 on a database error', async () => {
    mock.queue('rooms', { error: { message: 'db down' } });
    const res = await request(app).get('/api/spaces');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/spaces/:id/availability', () => {
  const url = `/api/spaces/${ROOM_ID}/availability`;

  test('200 returns booked slots for that Eastern-time day', async () => {
    const slots = [{ start_time: '2099-07-10T14:00:00+00:00', end_time: '2099-07-10T15:00:00+00:00' }];
    mock.queue('rooms', { data: ROOMS[0] });
    mock.queue('bookings', { data: slots });

    const res = await request(app).get(`${url}?date=2099-07-10`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ date: '2099-07-10', timezone: 'America/New_York', booked: slots });
    const ops = mock.state.calls[1].ops;
    expect(ops).toContainEqual(['eq', 'status', 'confirmed']);
    // Midnight Eastern (UTC-4 in summer) to the next midnight
    expect(ops).toContainEqual(['gt', 'end_time', '2099-07-10T04:00:00.000Z']);
    expect(ops).toContainEqual(['lt', 'start_time', '2099-07-11T04:00:00.000Z']);
  });

  test('401 without a token', async () => {
    const res = await request(app).get(`${url}?date=2099-07-10`);
    expect(res.status).toBe(401);
  });

  test.each(['', '2099-13-01', '2099-02-30', '03/10/2099'])('400 when date is %p', async (date) => {
    const res = await request(app).get(url).query({ date }).set(AUTH);
    expect(res.status).toBe(400);
  });

  test('400 when date is missing', async () => {
    const res = await request(app).get(url).set(AUTH);
    expect(res.status).toBe(400);
  });

  test('400 for an invalid room UUID', async () => {
    const res = await request(app).get('/api/spaces/not-a-uuid/availability?date=2099-07-10').set(AUTH);
    expect(res.status).toBe(400);
  });

  test('404 for an unknown room', async () => {
    mock.queue('rooms', { data: null });
    const res = await request(app).get(`${url}?date=2099-07-10`).set(AUTH);
    expect(res.status).toBe(404);
  });
});
