const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ quiet: true });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const options = {
  auth: { persistSession: false, autoRefreshToken: false },
};

// Builds a Supabase client using the anon key.
// If a user's access token is passed in, every query is sent "as" that user,
// so Row Level Security policies see auth.uid() = that user's id.
function getSupabase(token) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env');
  }

  const clientOptions = { ...options };
  if (token) {
    clientOptions.global = { headers: { Authorization: `Bearer ${token}` } };
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
}

module.exports = { getSupabase };
