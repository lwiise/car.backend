// netlify/functions/adminUsersStats.js
const { createClient } = require("@supabase/supabase-js");

const CORS = {
  "Access-Control-Allow-Origin": "*",                // ← use "*" while testing
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-admin-email, X-Admin-Email",
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }
  const headers = { ...CORS, "content-type": "application/json" };

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing env SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    const qs = event.queryStringParameters || {};
    const range = (qs.range || "day").toLowerCase();     // day|week|month
    const days  = Number(qs.days  || 30);
    if (!["day","week","month"].includes(range)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error:"bad_range" }) };
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // total users
    const { count: total, error: tErr } = await sb
      .from("profiles")
      .select("*", { head: true, count: "exact" });
    if (tErr) throw tErr;

    if (days <= 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ total, range, days, buckets: [] }) };
    }

    const now   = new Date();
    const since = new Date(now.getTime() - days*24*60*60*1000);

    // Count rows inside window (for paging)
    const { count: windowCount, error: wErr } = await sb
      .from("profiles")
      .select("created_at", { head: true, count: "exact" })
      .gte("created_at", since.toISOString());
    if (wErr) throw wErr;

    const keyFor = (iso) => {
      const d = new Date(iso);
      if (range === "day")   return d.toISOString().slice(0, 10);               // YYYY-MM-DD
      if (range === "week") {                                                   // week start (Mon)
        const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        const dow = u.getUTCDay() || 7;
        u.setUTCDate(u.getUTCDate() - (dow - 1));
        return u.toISOString().slice(0, 10);
      }
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`; // YYYY-MM
    };

    const pageSize = 2000;
    const pages = Math.ceil((windowCount || 0) / pageSize);
    const bucket = new Map();

    for (let p = 0; p < pages; p++) {
      const from = p * pageSize;
      const to   = from + pageSize - 1;
      const { data, error } = await sb
        .from("profiles")
        .select("created_at")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw error;

      (data || []).forEach(r => {
        const k = keyFor(r.created_at);
        bucket.set(k, (bucket.get(k) || 0) + 1);
      });
    }

    const buckets = Array.from(bucket.entries())
      .sort((a,b) => a[0] < b[0] ? -1 : 1)
      .map(([key,count]) => ({ key, count }));

    return { statusCode: 200, headers, body: JSON.stringify({ total, range, days, buckets }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e?.message || e) }) };
  }
};
