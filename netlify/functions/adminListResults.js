// netlify/functions/adminListResults.js
const { createClient } = require("@supabase/supabase-js");

const CORS = {
  "Access-Control-Allow-Origin": "*", // tighten later
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Email",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "ok" };
  }

  try {
    const adminEmail = (event.headers["x-admin-email"] || "").toLowerCase();
    // if (ADMIN_EMAILS.length && !ADMIN_EMAILS.includes(adminEmail)) {
    //   return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: "unauthorized" }) };
    // }

    const limit = Math.max(1, Math.min(100, Number(event.queryStringParameters?.limit || 20)));
    const offset = Math.max(0, Number(event.queryStringParameters?.offset || 0));

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // 1) page results
    const { data: results, error: rErr } = await sb
      .from("results")
      .select("id, user_id, created_at, top3, answers")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (rErr) throw rErr;

    // 2) attach user emails
    const userIds = Array.from(new Set(results.map((r) => r.user_id)));
    let emailMap = new Map();
    if (userIds.length) {
      const { data: profs, error: pErr } = await sb
        .from("profiles")
        .select("id, email")
        .in("id", userIds);
      if (pErr) throw pErr;
      for (const p of profs) emailMap.set(p.id, p.email);
    }

    const items = results.map((r) => ({
      ...r,
      email: emailMap.get(r.user_id) || null,
    }));

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ items }) };
  } catch (err) {
    console.error("adminListResults error:", err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: String(err.message || err) }),
    };
  }
};
