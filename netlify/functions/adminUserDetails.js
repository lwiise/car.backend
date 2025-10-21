// netlify/functions/adminUserDetails.js
const { createClient } = require("@supabase/supabase-js");

const CORS = {
  "Access-Control-Allow-Origin": "https://scopeonride.webflow.io", // use "*" while testing if needed
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-admin-email",
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event) => {
  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  try {
    const headers = { ...CORS, "content-type": "application/json" };

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    const qs = event.queryStringParameters || {};
    const id = (qs.id || "").trim();
    const email = (qs.email || "").trim();

    if (!id && !email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing id or email" }),
      };
    }

    // --- Fetch profile (ALL columns) ---
    let profile = null;
    if (id) {
      const { data, error } = await sb.from("profiles").select("*").eq("id", id).single();
      if (error) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "profile not found", detail: error.message }) };
      }
      profile = data;
    } else {
      const { data, error } = await sb.from("profiles").select("*").eq("email", email).single();
      if (error) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "profile not found", detail: error.message }) };
      }
      profile = data;
    }

    // --- Fetch all results for that user ---
    const { data: results, error: rErr } = await sb
      .from("results")
      .select("id,created_at,top3,answers")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false });

    if (rErr) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "db error (results)", detail: rErr.message }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        profile,                 // <-- all profile columns
        results: results || [],  // all user results
        latest: (results && results[0]) || null,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: String(e?.message || e) }),
    };
  }
};
