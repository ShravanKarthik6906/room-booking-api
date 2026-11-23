const express = require('express');
const { getSupabase } = require('../config/supabaseClient');

const router = express.Router();

// GET /api/health
// Reports whether the server is up and whether Supabase answers a tiny query.
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabase();
    // "head: true" asks only for a row count, no actual data.
    const { error } = await supabase.from('rooms').select('id', { count: 'exact', head: true });

    if (error) {
      return res.status(500).json({ status: 'error', supabase: 'unreachable', error: error.message });
    }

    res.json({ status: 'ok', supabase: 'reachable', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', supabase: 'unreachable', error: err.message });
  }
});

module.exports = router;
