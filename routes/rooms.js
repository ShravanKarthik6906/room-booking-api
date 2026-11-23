const express = require('express');
const { getSupabase } = require('../config/supabaseClient');

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

module.exports = router;
