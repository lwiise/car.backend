// netlify/functions/adminDetailsCORS.js
import cors, { json } from "./cors.js";
import {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
  isAllowedAdmin
} from "./_supabase.js";

export const handler = cors(async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  // auth
  const { user } = await getUserFromAuth(event);
  if (!isAllowedAdmin(user)) {
    return json(403, { error: "forbidden" });
  }

  // body
  const { id, type = "user" } = parseJSON(event.body) || {};
  if (!id) {
    return json(400, { error: "missing_id" });
  }

  const supa = getAdminClient();

  // get that quiz_results row (only columns we know exist)
  const { data: baseRows, error: baseErr } = await supa
    .from("quiz_results")
    .select("id,created_at,user_id")
    .eq("id", id)
    .limit(1);

  if (baseErr) {
    console.error("[adminDetailsCORS] baseErr:", baseErr);
    return json(500, {
      error: "db_failed",
      detail: baseErr.message
    });
  }

  const main = baseRows?.[0];
  if (!main) {
    return json(404, { error: "not_found", detail: "row not found" });
  }

  // If it's a signed user (has user_id)
  if (main.user_id) {
    // get profile
    const { data: profRows, error: profErr } = await supa
      .from("profiles")
      .select(
        "id,email,name,nickname,gender,dob,country,state,created_at,updated_at"
      )
      .eq("id", main.user_id)
      .limit(1);

    if (profErr) {
      console.error("[adminDetailsCORS] profErr:", profErr);
      return json(500, {
        error: "db_profile_failed",
        detail: profErr.message
      });
    }

    const profile = profRows?.[0] || null;
    if (!profile) {
      return json(404, { error: "not_found", detail: "profile not found" });
    }

    // get ALL quiz_results rows for that user
    const { data: resRows, error: resErr } = await supa
      .from("quiz_results")
      .select("id,created_at,user_id")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false });

    if (resErr) {
      console.error("[adminDetailsCORS] resErr:", resErr);
      return json(500, {
        error: "db_results_failed",
        detail: resErr.message
      });
    }

    // we don't have top3 / answers anymore;
    // we'll send empty picks / answers to avoid crashing UI
    const picks   = [];        // placeholder until we know column names
    const answers = {};        // same

    const latest = resRows?.[0] || null;

    const meta = {
      type: "User",
      top3_count: resRows?.length ?? 0, // keep same field name for UI
      user_id: profile.id,
      created_at: latest?.created_at || profile.created_at
    };

    return json(200, {
      profile,
      meta,
      picks,
      answers
    });
  }

  // Guest (no user_id)
  // we ONLY have this quiz_results row. We'll return placeholders.
  const picks   = [];
  const answers = {};

  const profile = {
    email: "—",
    name: "—",
    nickname: null,
    gender: null,
    dob: null,
    country: null,
    state: null,
    created_at: main.created_at,
    updated_at: main.created_at,
    user_id: null
  };

  const meta = {
    type: "Guest",
    top3_count: 1,
    user_id: null,
    created_at: main.created_at
  };

  return json(200, {
    profile,
    meta,
    picks,
    answers
  });
});
