const express = require('express');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// GET /api/auth/me — the logged-in user's profile row
router.get('/me', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase
    .from('profiles')
    .select('id, full_name, email, created_at')
    .eq('id', req.user.id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Profile not found' });

  res.json(data);
});

module.exports = router;
