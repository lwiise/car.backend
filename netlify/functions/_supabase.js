// netlify/functions/_supabase.js
const { createClient } = require("@supabase/supabase-js");

// Expect env vars set in Netlify dashboard
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_URL_PUBLIC;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET;

function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const missing = [];
    if (!SUPABASE_URL) missing.push("SUPABASE_URL");
    if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    const err = new Error(`MISSING_SUPABASE_CREDS: ${missing.join(", ")}`);
    err.code = "CONFIG";
    throw err;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

module.exports = { getAdminClient };
