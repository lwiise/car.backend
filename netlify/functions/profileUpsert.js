// netlify/functions/profileUpsert.js
const { createClient } = require("@supabase/supabase-js");

const CORS = {
  "Access-Control-Allow-Origin": "*", // TODO: tighten to your Webflow domain
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "ok" };
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE) {
      console.error("Missing env", { SUPABASE_URL: !!SUPABASE_URL, SUPABASE_SERVICE: !!SUPABASE_SERVICE });
      throw new Error("Supabase env not configured");
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    // Bearer token from Supabase client
    const authHeader = event.headers.authorization || event.headers.Authorization || "";
    if (!authHeader.startsWith("Bearer ")) throw new Error("Missing bearer token");
    const userToken = authHeader.slice("Bearer ".length).trim();

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // Validate session & get user
    const { data: userData, error: userErr } = await admin.auth.getUser(userToken);
    if (userErr || !userData?.user) {
      console.error("getUser error", userErr);
      throw new Error("Invalid user session");
    }
    const user = userData.user;

    // Parse body
    let payload = {};
    try { payload = JSON.parse(event.body || "{}"); }
    catch (e) { throw new Error("Invalid JSON body"); }

    const { email, name, nickname, dob, gender, country, state } = payload;
    if (!email || !name || !nickname || !dob || !gender || !country) {
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({ error: "Missing required profile fields" })
      };
    }

    // Upsert profile (by id)
    const { error: upErr } = await admin
      .from("profiles")
      .upsert({
        id: user.id,
        email,
        name,
        nickname,
        dob,
        gender,
        country,
        state,
        updated_at: new Date().toISOString()
      }, { onConflict: "id" });

    if (upErr) {
      console.error("profiles upsert error", upErr);
      throw upErr;
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("profileUpsert error:", err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
