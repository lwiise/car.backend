// netlify/functions/profileUpsertCORS.js
import cors, { json } from "./cors.js";
import {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
} from "./_supabase.js";

function firstPickFromTop3(top3) {
  if (!Array.isArray(top3) || top3.length === 0) return null;
  const c0 = top3[0] || {};
  const label = [c0.brand, c0.model].filter(Boolean).join(" ").trim();
  return label || null;
}

function summaryFromTop3(top3) {
  if (!Array.isArray(top3)) return null;
  return top3
    .slice(0, 3)
    .map(c =>
      [c.brand, c.model].filter(Boolean).join(" ").trim()
    )
    .filter(Boolean)
    .join(" • ");
}

export const handler = cors(async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  // who's calling?
  const { user } = await getUserFromAuth(event);
  if (!user) {
    return json(401, { error: "unauthorized" });
  }
  const userId = user.id;

  // body from the browser
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
  } = parseJSON(event.body);

  const supa = getAdminClient();

  // 1. upsert profile
  // profiles table is assumed:
  // id (uuid, PK = auth user id)
  // email text
  // name text
  // nickname text
  // gender text
  // dob date
  // country text
  // state text
  // created_at timestamptz default now()
  // updated_at timestamptz
  const { error: upErr } = await supa
    .from("profiles")
    .upsert([{
      id: userId,
      email,
      name,
      nickname,
      gender,
      dob,
      country,
      state,
      updated_at: new Date().toISOString()
    }], { onConflict: "id" });

  if (upErr) {
    console.error("[profileUpsert] profile upsert error:", upErr);
    return json(500, {
      error: "profile_upsert_failed",
      detail: upErr.message
    });
  }

  // 2. insert quiz_results row
  // quiz_results table is assumed:
  // id serial/bigint/uuid
  // created_at timestamptz default now()
  // user_id uuid (nullable)
  // first_pick text
  // top_summary text
  // answers jsonb
  const { error: insErr } = await supa
    .from("quiz_results")
    .insert([{
      user_id: userId,
      first_pick: firstPickFromTop3(top3),
      top_summary: summaryFromTop3(top3),
      answers: answers || {}
    }]);

  if (insErr) {
    console.error("[profileUpsert] quiz_results insert error:", insErr);
    return json(500, {
      error: "quiz_insert_failed",
      detail: insErr.message
    });
  }

  return json(200, { ok: true });
});
