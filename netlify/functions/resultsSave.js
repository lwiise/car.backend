// netlify/functions/resultsSave.js
import { createClient } from "@supabase/supabase-js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // lock to your domains in prod
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "ok" };
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE) throw new Error("Supabase env not configured");

    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Missing bearer token");
    const userToken = authHeader.slice("Bearer ".length);

    const body = event.body ? JSON.parse(event.body) : {};
    const { answers, top3 } = body;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
      global: { headers: { Authorization: `Bearer ${userToken}` } }
    });

    const { data: userData, error: userErr } = await admin.auth.getUser(userToken);
    if (userErr || !userData?.user) throw new Error("Invalid user session");
    const user = userData.user;

    // Insert into results table (create if not exists)
    const { error: insErr } = await admin
      .from("results")
      .insert({
        user_id: user.id,
        answers: answers || {},
        top3: top3 || [],
        created_at: new Date().toISOString()
      });

    if (insErr) throw insErr;

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("resultsSave error:", err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: String(err.message || err) }) };
  }
}
