// netlify/functions/resultsLatest.js
const { createClient } = require("@supabase/supabase-js");

const CORS = {
  "Access-Control-Allow-Origin": "*", // TODO: restrict later
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "ok" };
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE) throw new Error("Supabase env not configured");
    if (event.httpMethod !== "GET") {
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

    // Most recent result
    const { data, error } = await admin
      .from("results")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(); // ok if no rows

    if (error) throw error;

    const top3_json = data?.top3 || [];
    const created_at = data?.created_at || null;

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ top3_json, created_at }) };
  } catch (err) {
    console.error("resultsLatest error:", err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
