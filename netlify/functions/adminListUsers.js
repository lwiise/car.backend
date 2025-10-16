// netlify/functions/adminListUsers.js
const { createClient } = require("@supabase/supabase-js");

const CORS = {
  "Access-Control-Allow-Origin": "*", // tighten later to your Webflow domain
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Email",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// optional allow-list: comma-separated emails in env ADMIN_EMAILS
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "ok" };
  }

  try {
    // --- “login by email only”: allow-all for now (no hard block)
    // If you want to enforce, uncomment the 4 lines below.
    const adminEmail = (event.headers["x-admin-email"] || "").toLowerCase();
    // if (ADMIN_EMAILS.length && !ADMIN_EMAILS.includes(adminEmail)) {
    //   return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: "unauthorized" }) };
    // }

    const limit = Math.max(1, Math.min(100, Number(event.queryStringParameters?.limit || 20)));
    const offset = Math.max(0, Number(event.queryStringParameters?.offset || 0));

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // 1) page through profiles
    const { data: profiles, error: pErr } = await sb
      .from("profiles")
      .select(
        "id, email, name, nickname, dob, gender, country, state, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (pErr) throw pErr;

    const ids = profiles.map((p) => p.id);
    let latestMap = new Map();

    if (ids.length) {
      // 2) get latest result per user (single batch, then reduce)
      const { data: results, error: rErr } = await sb
        .from("results")
        .select("id, user_id, created_at, top3, answers")
        .in("user_id", ids)
        .order("created_at", { ascending: false });

      if (rErr) throw rErr;

      for (const row of results) {
        if (!latestMap.has(row.user_id)) latestMap.set(row.user_id, row);
      }
    }

    const items = profiles.map((p) => ({
      ...p,
      latest_result: latestMap.get(p.id) || null,
    }));

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ items }) };
  } catch (err) {
    console.error("adminListUsers error:", err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: String(err.message || err) }),
    };
  }
};
