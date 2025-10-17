// netlify/functions/adminUserDetails.js
import { createClient } from "@supabase/supabase-js";

// --- CORS ---
const ORIGINS = [
  "https://scopeonride.webflow.io",
  "https://carbackendd.netlify.app",
  "http://localhost:8888",
  "http://localhost:3000",
];
const ALLOW_HEADERS = "content-type,x-admin-email";
function cors(req) {
  const origin = req.headers.get("origin") || "";
  const allow = ORIGINS.find(o => origin.startsWith(o)) || "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
  };
}

// --- Admin allowlist (same emails you’ve been using) ---
const ADMINS = new Set([
  "anaskaroti@gmail.com",
  "anas@grizzlyn.com",
  "anas@scopeonride.com",
  "anaskarotii@gmail.com",
]);

// --- Supabase client (use your env vars in Netlify) ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE; // service key is required for server-side reads across users
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

export async function handler(event) {
  const headers = cors(new Request("", { headers: event.headers }));
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  try {
    const adminEmail = event.headers["x-admin-email"] || event.headers["X-Admin-Email"];
    if (!adminEmail || !ADMINS.has(String(adminEmail).toLowerCase())) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Unauthorized admin" }),
      };
    }

    const id = (event.queryStringParameters?.id || "").trim();
    if (!id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing id" }) };
    }

    // Profile
    const { data: profile, error: pErr } = await sb
      .from("profiles")
      .select("id,email,name,nickname,dob,gender,country,state,updated_at")
      .eq("id", id)
      .single();

    if (pErr && pErr.code !== "PGRST116") throw pErr; // PGRST116 = No rows

    // Results (latest first)
    const { data: results, error: rErr } = await sb
      .from("results")
      .select("id,created_at,answers,top3")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (rErr) throw rErr;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        profile: profile || null,
        results: results || [],
        latest: (results && results[0]) || null,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message || String(e) }),
    };
  }
}
