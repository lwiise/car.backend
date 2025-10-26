// netlify/functions/_supabase.js
const { createClient } = require("@supabase/supabase-js");

function sbAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function parseBody(event) {
  try { return JSON.parse(event.body || "{}"); } catch { return {}; }
}

function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }

async function getUserFromToken(supabase, event) {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const token = (auth.startsWith("Bearer ") ? auth.slice(7) : auth).trim();
  if (!token) throw new Error("Missing Authorization");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw new Error("Unauthorized");
  return data.user;
}

module.exports = { sbAdmin, parseBody, startOfDay, getUserFromToken };
