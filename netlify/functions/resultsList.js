// netlify/functions/resultsList.js
const { createClient } = require("@supabase/supabase-js");

const CORS = {
  "Access-Control-Allow-Origin": "*", // tighten to your Webflow domain(s) later
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

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

    // Validate session & user
    const { data: userData, error: userErr } = await admin.auth.getUser(userToken);
    if (userErr || !userData?.user) throw new Error("Invalid user session");
    const userId = userData.user.id;

    // Pagination
    const qp = event.queryStringParameters || {};
    const limit = Math.max(1, Math.min(parseInt(qp.limit || "10", 10), 50));
    const offset = Math.max(0, parseInt(qp.offset || "0", 10));

    // Range: inclusive indexes in Supabase
    const from = offset;
    const to = offset + (limit - 1);

    const { data, error } = await admin
      .from("results")
      .select("id, created_at, top3, answers")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ items: data || [], limit, offset })
    };
  } catch (err) {
    console.error("resultsList error:", err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
