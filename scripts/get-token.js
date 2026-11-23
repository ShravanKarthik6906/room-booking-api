// Signs in the test user from .env and prints their access token (JWT).
// Usage: npm run token
// Then:  curl -H "Authorization: Bearer <token>" http://localhost:3000/api/auth/me
const { getSupabase } = require('../config/supabaseClient');

async function main() {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    console.error('Set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env first.');
    process.exit(1);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error(`Sign-in failed: ${error.message}`);
    process.exit(1);
  }

  console.log(data.session.access_token);
}

main();
