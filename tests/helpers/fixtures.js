// Shared test data
const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'student@rutgers.edu' };
const OTHER_USER = { id: '22222222-2222-4222-8222-222222222222', email: 'other@rutgers.edu' };
const ROOM_ID = '941556d1-ba5d-4be8-a8ca-a9a163a33859';
const TOKEN = 'valid-token';
const AUTH = { Authorization: `Bearer ${TOKEN}` };

// Far-future times so "no bookings in the past" never trips these tests
const START = '2099-07-10T14:00:00Z';
const END = '2099-07-10T15:00:00Z';

module.exports = { USER, OTHER_USER, ROOM_ID, TOKEN, AUTH, START, END };
