const express = require('express');
const { getSupabase } = require('../config/supabaseClient');
const requireAuth = require('../middleware/auth');
const { isUuid, isIsoDate } = require('../utils/validate');
const { CAMPUS_TIMEZONE, startOfCampusDay, nextDate } = require('../utils/time');

const router = express.Router();

// GET /api/spaces?name=library&mincapacity=6
router.get('/', async (req, res) => {
  const { name, mincapacity } = req.query;

  let query = getSupabase()
    .from('rooms')
    .select('id, name, building, capacity')
    .order('building')
    .order('name');

  // ?name= : case-insensitive partial match on the room name OR building
  if (name !== undefined && name !== '') {
    // Treat the search text literally: escape LIKE wildcards (% _) and wrap
    // the value in double quotes so commas/brackets can't break the filter.
    const likeSafe = String(name).replace(/[\\%_]/g, (c) => `\\${c}`);
    const quoted = `"%${likeSafe.replace(/["\\]/g, (c) => `\\${c}`)}%"`;
    query = query.or(`name.ilike.${quoted},building.ilike.${quoted}`);
  }

  // ?mincapacity= : must be a whole number; only rooms with capacity >= n
  if (mincapacity !== undefined) {
    if (!/^\d+$/.test(String(mincapacity)) || Number(mincapacity) > 2147483647) {
      return res.status(400).json({ error: 'mincapacity must be a whole number (e.g. 4)' });
    }
    query = query.gte('capacity', Number(mincapacity));
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});

// GET /api/spaces/:id/availability?date=YYYY-MM-DD
// Lists the confirmed booked slots for one room on one campus (Eastern) day.
// Requires login because RLS only lets authenticated users read bookings.
router.get('/:id/availability', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { date } = req.query;

  if (!isUuid(id)) return res.status(400).json({ error: 'Room id must be a valid UUID' });
  if (!isIsoDate(date)) {
    return res.status(400).json({ error: 'date query parameter is required, format YYYY-MM-DD' });
  }

  const db = req.supabase;

  const { data: room, error: roomError } = await db
    .from('rooms')
    .select('id, name, building')
    .eq('id', id)
    .maybeSingle();

  if (roomError) return res.status(500).json({ error: roomError.message });
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const dayStart = startOfCampusDay(date);
  const dayEnd = startOfCampusDay(nextDate(date));

  // Any booking that overlaps the day at all (including ones crossing midnight)
  const { data: bookings, error } = await db
    .from('bookings')
    .select('start_time, end_time')
    .eq('room_id', id)
    .eq('status', 'confirmed')
    .lt('start_time', dayEnd.toISOString())
    .gt('end_time', dayStart.toISOString())
    .order('start_time');

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    room,
    date,
    timezone: CAMPUS_TIMEZONE,
    booked: bookings,
  });
});

module.exports = router;
