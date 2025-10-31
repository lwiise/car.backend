// netlify/functions/profileUpsertCORS.js
import cors from "./cors.js";
import { createClient } from "@supabase/supabase-js";

// You MUST have these set in Netlify environment vars:
//   SUPABASE_URL = https://zrlfkdxpqkhfusjktrey.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = <service_role key from Supabase>
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Server-side Supabase client (service role = full DB access)
// DO NOT expose SERVICE_KEY to the browser.
const adminSb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// core handler (will be wrapped with cors())
async function coreHandler(event) {
  // only allow POST (OPTIONS handled by cors.js automatically)
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  // ---- 1. Read/validate bearer token from Authorization header ----
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

  // Ask Supabase who this token belongs to
  const { data: userData, error: userErr } = await adminSb.auth.getUser(token);
  if (userErr || !userData?.user) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid or expired token" })
    };
  }

  const authedUser = userData.user; // { id, email, ... }

  // ---- 2. Parse request JSON ----
  // Frontend should send:
  // {
  //   email,
  //   name,
  //   nickname,
  //   dob,
  //   gender,
  //   country,
  //   state,
  //   answers,
  //   top3
  // }
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Bad JSON" })
    };
  }

  const {
    email,
    name,
    nickname,
    dob,
    gender,
    country,
    state,
    answers = {},
    top3 = []
  } = payload;

  const finalUserId = authedUser.id;
  const finalEmail  = email || authedUser.email;

  // ---- 3. Upsert into profiles table ----
  // This matches columns we THINK you actually have:
  //   id (PK, uuid)
  //   email
  //   full_name
  //   nickname
  //   dob
  //   gender
  //   country
  //   state
  //
  // If your column names are slightly different (e.g. "name" instead of "full_name"),
  // change them here to match exactly what's in Supabase.
  const profileRow = {
    id: finalUserId,
    email: finalEmail || null,
    full_name: name || null,
    nickname: nickname || null,
    dob: dob || null,
    gender: gender || null,
    country: country || null,
    state: state || null
  };

  const { error: profileErr } = await adminSb
    .from("profiles")
    .upsert(profileRow, { onConflict: "id" });

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

  // ---- 4. Insert quiz result into results table ----
  // results table should have:
  //   user_id
  //   top3 (JSON)
  //   answers (JSON)
  const resultRow = {
    user_id: finalUserId,
    top3: top3,
    answers: answers
  };

  const { error: resultErr } = await adminSb
    .from("results")
    .insert(resultRow);

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

  // ---- 5. Done ----
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

// Netlify entrypoint WITH CORS wrapper
export const handler = cors(coreHandler);
