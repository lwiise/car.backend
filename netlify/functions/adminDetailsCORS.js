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

  const { user } = await getUserFromAuth(event);
  if (!isAllowedAdmin(user)) {
    return json(403, { error: "forbidden" });
  }

  const { id, type = "user" } = parseJSON(event.body) || {};
  if (!id) {
    return json(400, { error: "missing_id" });
  }

  const supa = getAdminClient();

  // get that specific quiz_results row
  const { data: baseRows, error: baseErr } = await supa
    .from("quiz_results")
    .select("id,created_at,user_id,top3,answers")
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

  // if this row belongs to a signed user (has user_id)
  if (main.user_id) {
    // fetch profile
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
      // weird edge case but ok
      return json(404, { error: "not_found", detail: "profile not found" });
    }

    // get ALL quiz_results rows for that user_id to build history
    const { data: resRows, error: resErr } = await supa
      .from("quiz_results")
      .select("id,created_at,top3,answers,user_id")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false });

    if (resErr) {
      console.error("[adminDetailsCORS] resErr:", resErr);
      return json(500, {
        error: "db_results_failed",
        detail: resErr.message
      });
    }

    const latest = resRows?.[0] || null;
    const picks   = Array.isArray(latest?.top3) ? latest.top3.slice(0,3) : [];
    const answers = latest?.answers || {};

    const meta = {
      type: "User",
      top3_count: resRows?.length ?? 0,
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

  // otherwise: guest (user_id is null)
  // we only have this single quiz row basically
  const picks   = Array.isArray(main.top3) ? main.top3.slice(0,3) : [];
  const answers = main.answers || {};

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
