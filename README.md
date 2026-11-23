# On-Campus Room Booking System

A REST API where Rutgers students browse campus study rooms and book them for a time slot, with **no double-booking**. Final project for the RUMAD Backend Accelerator (Fall 2026).

Backend only, with no frontend. Built with **Node.js + Express** and **Supabase** (Postgres + Supabase Auth). Tested with **Jest + Supertest**.

---

## Features

- Browse rooms, search by name or building, and filter by minimum capacity
- Sign in with Supabase Auth; protected routes check the JWT
- Book a room for a time slot, with overlapping bookings rejected (409)
- See your bookings (upcoming first), cancel your own, and check a room's booked slots for a day
- Consistent JSON everywhere: errors are always `{ "error": "..." }`

## Project structure

```
server.js                 Express app: routes, JSON 404, bad-JSON + global error handlers
config/supabaseClient.js  getSupabase(token?): creates a Supabase client (per request)
middleware/auth.js        requireAuth: verifies "Authorization: Bearer <token>"
routes/health.js          GET /api/health
routes/auth.js            GET /api/auth/me
routes/rooms.js           GET /api/spaces, GET /api/spaces/:id/availability
routes/bookings.js        POST /api/book, GET /api/bookings/me, PATCH /api/bookings/:id/cancel
utils/validate.js         UUID / ISO timestamp / date validation
utils/time.js             Campus (Eastern time) day boundaries
scripts/get-token.js      Signs in the test user and prints an access token
supabase/schema.sql       Tables, constraints, trigger, RLS policies, seed rooms
tests/                    Jest + Supertest tests (Supabase is mocked)
```

---

## Setup

### 1. Install

```bash
git clone <your-repo-url> room-booking-api
cd room-booking-api
npm install
```

### 2. Create the database

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. Open **SQL Editor → New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
   This creates the tables, the no-overlap constraint, the profile trigger, the RLS policies and 8 seeded Rutgers rooms. It is safe to run again.

### 3. Configure `.env`

```bash
cp .env.example .env
```

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Dashboard → **Connect** (or Project Settings → Data API), e.g. `https://abcd1234.supabase.co` |
| `SUPABASE_ANON_KEY` | Project Settings → **API Keys** → the **publishable** key (`sb_publishable_...`) or legacy anon key. **Never** the secret key. |
| `PORT` | Optional, defaults to `3000` |
| `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` | The test user you create in step 4 |

No quotes and no spaces around `=`.

### 4. Create a test user and get a token

1. Dashboard → **Authentication → Users → Add user → Create new user**. Enter an email and password and leave **Auto Confirm User** checked.
2. Put the same email and password in `.env`.
3. Get an access token:

```bash
npm run -s token
# eyJhbGciOiJIUzI1NiIsImtpZCI6...
```

For the curl examples below:

```bash
export TOKEN=$(npm run -s token)
```

Tokens expire after about 1 hour. Run the command again to get a new one.

### 5. Run

```bash
npm start      # production-style
npm run dev    # auto-restarts on file changes (nodemon)
npm test       # 62 tests, offline, no .env needed
```

> **Note:** the npm scripts run Node with `--use-bundled-ca`, which tells Node to use its own built-in list of trusted HTTPS certificates. This works around Mac setups where Homebrew's OpenSSL certificate file is missing (symptom: `fetch failed` / `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`). Certificate verification stays fully on.

---

## API reference

Base URL: `http://localhost:3000`. 🔒 = requires `Authorization: Bearer <token>`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | | Server + Supabase status |
| GET | `/api/auth/me` | 🔒 | My profile |
| GET | `/api/spaces` | | List rooms (`?name=`, `?mincapacity=`) |
| GET | `/api/spaces/:id/availability?date=YYYY-MM-DD` | 🔒 | A room's booked slots that day |
| POST | `/api/book` | 🔒 | Book a room |
| GET | `/api/bookings/me` | 🔒 | My bookings, upcoming first |
| PATCH | `/api/bookings/:id/cancel` | 🔒 | Cancel my booking |

### Status codes

| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Booking created |
| 400 | Bad input (missing field, invalid UUID/timestamp/date, end before start, time in the past, malformed JSON) |
| 401 | Missing, malformed, invalid or expired token |
| 403 | Not allowed (cancelling someone else's booking) |
| 404 | Unknown room, booking or route |
| 409 | Time conflict with an existing confirmed booking |
| 500 | Server or database error |

### Timestamps

`start_time` and `end_time` must be **ISO 8601 with a timezone**, for example `2026-12-01T14:00:00Z` (UTC) or `2026-12-01T09:00:00-05:00` (Eastern). A time without a timezone is rejected so nobody books the wrong hour by accident. Responses are in UTC.

---

### `GET /api/health`

```bash
curl http://localhost:3000/api/health
```

```json
{ "status": "ok", "supabase": "reachable", "timestamp": "2026-11-23T05:19:58.976Z" }
```

If Supabase can't be reached, it returns **500**:

```json
{ "status": "error", "supabase": "unreachable", "error": "TypeError: fetch failed" }
```

### `GET /api/auth/me` 🔒

Returns your row from the `profiles` table.

```bash
curl http://localhost:3000/api/auth/me -H "Authorization: Bearer $TOKEN"
```

```json
{
  "id": "0b70d1ce-45cd-410d-952b-0412c09e86cd",
  "full_name": "Test User",
  "email": "testuser@example.com",
  "created_at": "2026-11-23T05:23:12.352311+00:00"
}
```

Without a token, it returns **401**:

```json
{ "error": "Missing or malformed Authorization header (expected \"Bearer <token>\")" }
```

### `GET /api/spaces`

| Query | Description |
|---|---|
| `name` | Case-insensitive partial match on room **name or building** |
| `mincapacity` | Whole number; only rooms with `capacity >= n`. Anything else returns 400 |

```bash
curl "http://localhost:3000/api/spaces?name=library&mincapacity=6"
```

```json
[
  { "id": "73812353-cca6-466e-9a58-88d87c2a4ec6", "name": "Group Study Room 401", "building": "Alexander Library", "capacity": 6 },
  { "id": "2462d532-0d06-4352-b1ba-befc838b06dc", "name": "Collaboration Room 2", "building": "Library of Science and Medicine", "capacity": 8 }
]
```

```bash
curl "http://localhost:3000/api/spaces?mincapacity=abc"
```

```json
{ "error": "mincapacity must be a whole number (e.g. 4)" }
```

### `POST /api/book` 🔒

Body: `{ "room_id": "<uuid>", "start_time": "<ISO>", "end_time": "<ISO>" }`. The `user_id` always comes from your token, never from the body.

```bash
curl -X POST http://localhost:3000/api/book \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"room_id":"941556d1-ba5d-4be8-a8ca-a9a163a33859","start_time":"2027-01-15T10:00:00Z","end_time":"2027-01-15T11:00:00Z"}'
```

**201 Created**

```json
{
  "id": 1,
  "room_id": "941556d1-ba5d-4be8-a8ca-a9a163a33859",
  "user_id": "0b70d1ce-45cd-410d-952b-0412c09e86cd",
  "start_time": "2027-01-15T10:00:00+00:00",
  "end_time": "2027-01-15T11:00:00+00:00",
  "status": "confirmed",
  "created_at": "2026-11-23T05:26:35.976683+00:00"
}
```

Booking an overlapping time (for example 10:30 to 11:30) returns **409 Conflict**:

```json
{ "error": "Room is already booked from 2027-01-15T10:00:00+00:00 to 2027-01-15T11:00:00+00:00" }
```

Other errors:

| Case | Status | Response |
|---|---|---|
| Missing field | 400 | `{ "error": "room_id, start_time and end_time are required" }` |
| Bad UUID | 400 | `{ "error": "room_id must be a valid UUID" }` |
| Bad timestamp | 400 | `{ "error": "start_time and end_time must be ISO 8601 timestamps with a timezone, ..." }` |
| End ≤ start | 400 | `{ "error": "end_time must be after start_time" }` |
| In the past | 400 | `{ "error": "Cannot book a time slot in the past" }` |
| Unknown room | 404 | `{ "error": "Room not found" }` |

Back-to-back bookings are allowed. One ending at 11:00 and another starting at 11:00 do not conflict.

### `GET /api/bookings/me` 🔒

Your bookings, including cancelled ones. **Upcoming** bookings come first (soonest at the top), then **past** ones (most recent first). Each includes the room's name and building.

```bash
curl http://localhost:3000/api/bookings/me -H "Authorization: Bearer $TOKEN"
```

```json
[
  {
    "id": 1,
    "room_id": "941556d1-ba5d-4be8-a8ca-a9a163a33859",
    "start_time": "2027-01-15T10:00:00+00:00",
    "end_time": "2027-01-15T11:00:00+00:00",
    "status": "confirmed",
    "created_at": "2026-11-23T05:26:35.976683+00:00",
    "room": { "name": "Room 2050", "building": "Academic Building East Wing" }
  }
]
```

### `PATCH /api/bookings/:id/cancel` 🔒

Sets the booking's status to `cancelled`, which frees the time slot. Only the person who made the booking can cancel it.

```bash
curl -X PATCH http://localhost:3000/api/bookings/2/cancel -H "Authorization: Bearer $TOKEN"
```

```json
{
  "id": 2,
  "room_id": "941556d1-ba5d-4be8-a8ca-a9a163a33859",
  "user_id": "0b70d1ce-45cd-410d-952b-0412c09e86cd",
  "start_time": "2027-01-15T11:00:00+00:00",
  "end_time": "2027-01-15T12:00:00+00:00",
  "status": "cancelled",
  "created_at": "2026-11-23T05:26:36.754165+00:00"
}
```

| Case | Status | Response |
|---|---|---|
| Not your booking | 403 | `{ "error": "You can only cancel your own bookings" }` |
| No such booking | 404 | `{ "error": "Booking not found" }` |
| Already cancelled | 400 | `{ "error": "Booking is already cancelled" }` |
| Id not a whole number | 400 | `{ "error": "Booking id must be a positive whole number" }` |

### `GET /api/spaces/:id/availability?date=YYYY-MM-DD` 🔒

The confirmed booked slots for one room on one day. "A day" means a **Rutgers day in Eastern time** (midnight to midnight in New Jersey, with daylight saving handled), so a 7 pm booking appears on the date you expect. Any booking that overlaps the day is included. Every time not listed is free.

This route requires login because the database only lets signed-in users read bookings. It returns only times, never who booked them.

```bash
curl "http://localhost:3000/api/spaces/941556d1-ba5d-4be8-a8ca-a9a163a33859/availability?date=2027-01-15" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "room": { "id": "941556d1-ba5d-4be8-a8ca-a9a163a33859", "name": "Room 2050", "building": "Academic Building East Wing" },
  "date": "2027-01-15",
  "timezone": "America/New_York",
  "booked": [
    { "start_time": "2027-01-15T10:00:00+00:00", "end_time": "2027-01-15T11:00:00+00:00" },
    { "start_time": "2027-01-15T16:00:00+00:00", "end_time": "2027-01-15T17:00:00+00:00" }
  ]
}
```

| Case | Status |
|---|---|
| Missing or invalid `date` | 400 |
| Invalid room UUID | 400 |
| Unknown room | 404 |

### Unknown routes and bad JSON

```bash
curl http://localhost:3000/api/nope
# 404 {"error":"Route not found: GET /api/nope"}

curl -X POST http://localhost:3000/api/book -H "Content-Type: application/json" -d '{"room_id": '
# 400 {"error":"Malformed JSON in request body"}
```

---

## How double-booking is prevented

Two bookings for the same room **overlap** when one starts before the other ends:

```
existing.start < new.end   AND   existing.end > new.start
```

The API checks this at **two layers**:

### Layer 1: the API pre-check (friendly message)

Before inserting, `POST /api/book` asks the database whether any **confirmed** booking for that room overlaps the requested time. If one does, the API returns **409** and says which slot is taken. This handles the normal case and gives a helpful error.

### Layer 2: a database constraint (the real guarantee)

The pre-check alone has a gap. If two students click "book" at the same moment, both checks can run *before* either insert, both see "free", and both insert. This is a **race condition**.

So the database enforces the rule itself, in [`supabase/schema.sql`](supabase/schema.sql):

```sql
create extension if not exists btree_gist;

constraint bookings_no_overlap exclude using gist (
  room_id with =,
  tstzrange(start_time, end_time) with &&
) where (status = 'confirmed')
```

In plain English: *no two rows may have the same `room_id` (`=`) **and** overlapping time ranges (`&&`), counting only confirmed bookings.*

- `tstzrange(start, end)` turns the two columns into one time range. Ranges include the start and exclude the end (`[start, end)`), so 10:00–11:00 and 11:00–12:00 do **not** conflict.
- `where (status = 'confirmed')` means cancelled bookings are ignored, so cancelling frees the slot.
- `btree_gist` is the extension that lets a single GiST index compare a UUID with `=` alongside a range with `&&`.

Postgres checks this atomically on every insert. If two inserts race, one wins and the other fails with error code **`23P01`** (exclusion violation). The API turns that into the same **409**:

```json
{ "error": "Room is already booked for an overlapping time" }
```

**Tested for real:** sending 6 identical booking requests at the same moment produced exactly **1** booking. 4 requests were stopped by the pre-check, and 1 slipped past it and was stopped by the database constraint.

A separate `check (end_time > start_time)` constraint also stops zero-length or backwards bookings at the database level.

---

## How auth works

1. A student signs in with Supabase Auth and gets an **access token** (a JWT).
2. They send it on protected requests: `Authorization: Bearer <token>`.
3. [`middleware/auth.js`](middleware/auth.js) reads the header and calls `supabase.auth.getUser(token)`. Supabase checks the token's signature and expiry.
   - Header missing or not `Bearer` → **401**
   - Token fake, tampered with or expired → **401**
   - Valid → the user is attached as `req.user`, and the request continues
4. The middleware also creates `req.supabase`, a Supabase client **carrying that user's token**. Every query the route makes then runs *as that user*, so Postgres's **Row Level Security** policies apply:

| Table | Policy |
|---|---|
| `rooms` | Anyone can read |
| `profiles` | You can read only your own row |
| `bookings` | Signed-in users can read; you can insert only rows where `user_id` is you; you can update only your own |

So even if the API code had a bug, the database would refuse to let one user create or change another user's booking.

New sign-ups get a `profiles` row automatically, from a trigger on `auth.users` (`handle_new_user`).

---

## Testing

```bash
npm test
```

62 tests in [`tests/`](tests/) cover every route and every error case (400, 401, 403, 404, 409, 500), including the `23P01` race. Supabase is replaced by a small in-memory fake ([`tests/helpers/mockSupabase.js`](tests/helpers/mockSupabase.js)), so the tests run in about a second, offline, with no keys, and never touch real data.

GitHub Actions ([`.github/workflows/test.yml`](.github/workflows/test.yml)) runs the tests on every push and pull request.
