// netlify/functions/profileUpsertCORS.js
import {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
  jsonResponse,
  preflightResponse
} from "./_supabaseAdmin.js";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(event);
  }

  // this one is NOT admin-only.
  // any logged-in user can hit it (because they're saving their own data).
  const { user } = await getUserFromAuth(event);
  if (!user) {
    return jsonResponse(401, { error: "unauthorized" }, event);
  }

  const body = parseJSON(event.body || "{}");

  const {
    email,
    name,
    nickname,
    dob,
    gender,
    country,
    state,
    answers,
    top3
  } = body;

  const supa = getAdminClient();

  // 1. upsert profile info for this Supabase user.id
  const profileRow = {
    id: user.id,
    email: user.email || email || null,
    name: name || null,
    nickname: nickname || null,
    dob: dob || null,
    gender: gender || null,
    country: country || null,
    state: state || null,
    updated_at: new Date().toISOString()
  };

  const { error: upErr } = await supa
    .from("profiles")
    .upsert(profileRow, { onConflict: "id" });

  if (upErr) {
    console.error("profile upsert error", upErr);
    return jsonResponse(500, {
      error: "profile_upsert_failed",
      detail: upErr.message || String(upErr)
    }, event);
  }

  // 2. insert quiz result linked to that same user.id
  const { error: insErr } = await supa.from("results").insert({
    user_id: user.id,
    answers: answers || {},
    top3: Array.isArray(top3) ? top3 : []
  });

  if (insErr) {
    console.error("results insert error", insErr);
    return jsonResponse(500, {
      error: "results_insert_failed",
      detail: insErr.message || String(insErr)
    }, event);
  }

  return jsonResponse(200, { ok: true }, event);
};
