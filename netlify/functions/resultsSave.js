// netlify/functions/resultsSave.js
const { createClient } = require("@supabase/supabase-js");

const CORS = {
  "Access-Control-Allow-Origin": "*", // TODO: restrict later
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "ok" };
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE) throw new Error("Supabase env not configured");
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const authHeader = event.headers.authorization || event.headers.Authorization || "";
    if (!authHeader.startsWith("Bearer ")) throw new Error("Missing bearer token");
    const userToken = authHeader.slice("Bearer ".length).trim();

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // Validate session & get user id
    const { data: userData, error: userErr } = await admin.auth.getUser(userToken);
    if (userErr || !userData?.user) throw new Error("Invalid user session");
    const userId = userData.user.id;

    let payload = {};
    try { payload = JSON.parse(event.body || "{}"); }
    catch (e) { throw new Error("Invalid JSON body"); }

    const { answers, top3 } = payload;
    if (!answers || !top3) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing answers or top3" }) };
    }

    const { error: insErr } = await admin
      .from("results")
      .insert([{ user_id: userId, answers, top3 }]);

    if (insErr) {
      console.error("results insert error", insErr);
      throw insErr;
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("resultsSave error:", err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
