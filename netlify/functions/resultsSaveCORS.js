// netlify/functions/resultsSaveCORS.js
import cors, { json } from "./cors.js";
import { supaAdmin } from "./supabaseClient.js";
import { getUserIdFromAuthHeader } from "./authUtils.js";

export const handler = cors(async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  // who is this user?
  const userId = getUserIdFromAuthHeader(event.headers || {});
  if (!userId) {
    return json(401, { error: "no_auth", detail: "Missing or invalid bearer token" });
  }

  // parse body
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "bad_json" });
  }

  const { answers, top3 } = body || {};

  // sanity checks
  if (!answers || !Array.isArray(top3) || !top3.length) {
    return json(400, { error: "missing_data", detail: "answers/top3 required" });
  }

  // insert row into Supabase "results"
  // results table columns assumed:
  //   id (uuid or serial)
  //   user_id (text/uuid)
  //   created_at (timestamptz default now())
  //   top3 (jsonb)
  //   answers (jsonb)
  const { data, error } = await supaAdmin
    .from("results")
    .insert([{
      user_id: userId,
      top3,
      answers
    }])
    .select("id, created_at, top3, answers")
    .single();

  if (error) {
    console.error("resultsSave insert error:", error);
    return json(500, {
      error: "db_insert_failed",
      detail: error.message || String(error)
    });
  }

  // success
  return json(200, {
    ok: true,
    item: data
  });
});
