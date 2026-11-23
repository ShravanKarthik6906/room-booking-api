const express = require('express');
const requireAuth = require('../middleware/auth');
const { isUuid, parseIsoTimestamp } = require('../utils/validate');

const router = express.Router();

// Postgres error code raised by the "no overlapping bookings" exclusion constraint
const EXCLUSION_VIOLATION = '23P01';

// POST /api/book — body { room_id, start_time, end_time }
router.post('/book', requireAuth, async (req, res) => {
  const { room_id, start_time, end_time } = req.body || {};

  // ---- 1. Validate input ----
  if (!room_id || !start_time || !end_time) {
    return res.status(400).json({ error: 'room_id, start_time and end_time are required' });
  }
  if (!isUuid(room_id)) {
    return res.status(400).json({ error: 'room_id must be a valid UUID' });
  }

  const start = parseIsoTimestamp(start_time);
  const end = parseIsoTimestamp(end_time);
  if (!start || !end) {
    return res.status(400).json({
      error: 'start_time and end_time must be ISO 8601 timestamps with a timezone, e.g. 2026-12-01T14:00:00Z',
    });
  }
  if (end <= start) {
    return res.status(400).json({ error: 'end_time must be after start_time' });
  }
  if (start < new Date()) {
    return res.status(400).json({ error: 'Cannot book a time slot in the past' });
  }

  const db = req.supabase;

  // ---- 2. Make sure the room exists ----
  const { data: room, error: roomError } = await db
    .from('rooms')
    .select('id')
    .eq('id', room_id)
    .maybeSingle();

  if (roomError) return res.status(500).json({ error: roomError.message });
  if (!room) return res.status(404).json({ error: 'Room not found' });

  // ---- 3. Friendly pre-check for overlaps ----
  // Two ranges overlap when: existing.start < new.end AND existing.end > new.start
  const { data: conflicts, error: conflictError } = await db
    .from('bookings')
    .select('id, start_time, end_time')
    .eq('room_id', room_id)
    .eq('status', 'confirmed')
    .lt('start_time', end.toISOString())
    .gt('end_time', start.toISOString())
    .limit(1);

  if (conflictError) return res.status(500).json({ error: conflictError.message });
  if (conflicts.length > 0) {
    const c = conflicts[0];
    return res.status(409).json({
      error: `Room is already booked from ${c.start_time} to ${c.end_time}`,
    });
  }

  // ---- 4. Insert. The database constraint is the final safety net ----
  const { data: booking, error: insertError } = await db
    .from('bookings')
    .insert({
      room_id,
      user_id: req.user.id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    // Someone else grabbed the slot between our pre-check and insert
    if (insertError.code === EXCLUSION_VIOLATION) {
      return res.status(409).json({ error: 'Room is already booked for an overlapping time' });
    }
    return res.status(500).json({ error: insertError.message });
  }

  res.status(201).json(booking);
});

module.exports = router;
