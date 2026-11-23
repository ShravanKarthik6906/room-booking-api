const { getSupabase } = require('../config/supabaseClient');

// Protects a route: only lets the request through if it carries a valid
// Supabase access token in the header "Authorization: Bearer <token>".
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header (expected "Bearer <token>")' });
  }

  try {
    // Ask Supabase Auth who this token belongs to. It checks the signature
    // and expiry for us, so a fake or expired token gets an error back.
    const { data, error } = await getSupabase().auth.getUser(token);

    if (error && error.name === 'AuthRetryableFetchError') {
      // Network problem reaching Supabase, not the user's fault.
      return res.status(500).json({ error: 'Could not reach auth service' });
    }
    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = data.user;
    // A Supabase client that acts as this user, so RLS policies apply.
    req.supabase = getSupabase(token);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireAuth;
