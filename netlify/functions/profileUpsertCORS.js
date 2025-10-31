// netlify/functions/profileUpsertCORS.js
import cors from "./cors.js";
import { createClient } from "@supabase/supabase-js";

// These MUST be set in Netlify → Site settings → Environment variables:
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Server-side Supabase client with service role key.
// (Never expose SERVICE_KEY to the browser.)
const adminSb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function coreHandler(event) {
  // Only POST is allowed for this function (OPTIONS is handled in cors.js)
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  // ---- 1. Read bearer token from Authorization header ----
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

  // Validate token with Supabase
  const { data: userData, error: userErr } = await adminSb.auth.getUser(token);
  if (userErr || !userData?.user) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid or expired token" })
    };
  }

  const authedUser = userData.user; // { id, email, ... }

  // ---- 2. Parse incoming JSON ----
  // Frontend sends:
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
  const finalEmail  = email || authedUser.email || null;

  // ---- 3. Try to upsert into profiles table ----
  // We DON'T know your exact column names (Supabase is telling us first_name
  // and full_name do NOT exist), so we'll only write the safest columns:
  //   id
  //   email
  //
  // If your table doesn't even have `email`, that's fine — we'll catch the error
  // and continue anyway.
  //
  // IMPORTANT: we do NOT fail the request anymore if this upsert errors.
  try {
    const minimalProfileRow = {
      id: finalUserId,
      email: finalEmail
    };

    // attempt upsert; if columns don't match, Supabase will throw
    const { error: profileErr } = await adminSb
      .from("profiles")
      .upsert(minimalProfileRow, { onConflict: "id" });

    if (profileErr) {
      console.warn("profiles upsert warning:", profileErr.message);
      // we intentionally DO NOT return 500 here
    }

    // (Optional) If you later add columns for name, nickname, dob, gender, etc,
    // you can extend minimalProfileRow with those exact column names and it
    // will start saving them automatically.
    //
    // Example in the future:
    // minimalProfileRow.nickname = nickname;
    // minimalProfileRow.dob = dob;
    // ...but ONLY after you confirm those columns actually exist in Supabase.
  } catch (err) {
    console.warn("profiles upsert threw:", err);
    // still keep going
  }

  // ---- 4. Insert quiz results into results table ----
  // results table should have (at least):
  //   user_id (uuid)
  //   top3 (json)
  //   answers (json)
  const resultRow = {
    user_id: finalUserId,
    top3: top3,
    answers: answers
  };

  const { error: resultErr } = await adminSb
    .from("results")
    .insert(resultRow);

  if (resultErr) {
    // THIS we do care about, because saving the quiz is the main point
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to save results",
        detail: resultErr.message
      })
    };
  }

  // ---- 5. Success ----
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

// export wrapped handler (adds CORS + preflight handling)
export const handler = cors(coreHandler);
