// netlify/functions/profileUpsertCORS.js
import cors from "./cors.js";
import { createClient } from "@supabase/supabase-js";

// You MUST set these in Netlify env vars (Site settings -> Environment variables):
// SUPABASE_URL                = https://zrlfkdxpqkhfusjktrey.supabase.co
// SUPABASE_SERVICE_ROLE_KEY   = <your service_role key from Supabase>

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Server-side Supabase client (admin privileges, not exposed to browser)
const adminSb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function coreHandler(event) {
  // Allow only POST (OPTIONS is handled by cors.js automatically)
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  // ----- 1. Check Authorization bearer token -----
  const authHeader =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing bearer token" })
    };
  }

  // Validate token with Supabase Admin client
  const { data: userData, error: userErr } = await adminSb.auth.getUser(token);
  if (userErr || !userData?.user) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid or expired token" })
    };
  }

  const authedUser = userData.user; // { id, email, ... }

  // ----- 2. Parse body from client -----
  let parsed;
  try {
    parsed = JSON.parse(event.body || "{}");
  } catch (err) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Bad JSON" })
    };
  }

  // Expected from frontend:
  // {
  //   user_id,
  //   email,
  //   profile: { full_name, first_name, dob, gender, country, region },
  //   picks,
  //   answers
  // }
  const {
    user_id,
    email,
    profile = {},
    picks = [],
    answers = {}
  } = parsed;

  const finalUserId = user_id || authedUser.id;
  const finalEmail  = email    || authedUser.email;

  const {
    full_name,
    first_name,
    dob,
    gender,
    country,
    region
  } = profile;

  // ----- 3. Upsert profile into "profiles" table -----
  // Make sure these column names match your DB schema.
  const { error: profileErr } = await adminSb
    .from("profiles")
    .upsert(
      {
        id: finalUserId,
        email: finalEmail,
        full_name:  full_name  || null,
        first_name: first_name || null,
        dob:        dob        || null,
        gender:     gender     || null,
        country:    country    || null,
        region:     region     || null
      },
      { onConflict: "id" } // adjust if your PK/unique key is different
    );

  if (profileErr) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to upsert profile",
        detail: profileErr.message
      })
    };
  }

  // ----- 4. Insert quiz result into "results" table -----
  // Make sure table + columns match.
  const { error: resultErr } = await adminSb
    .from("results")
    .insert({
      user_id: finalUserId,
      top3: picks,
      answers
    });

  if (resultErr) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to save results",
        detail: resultErr.message
      })
    };
  }

  // ----- 5. Success -----
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: true,
      user_id: finalUserId,
      email: finalEmail
    })
  };
}

// FINAL EXPORT: wrap with your cors()
export const handler = cors(coreHandler);
