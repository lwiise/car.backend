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

  // must be admin
  const { user } = await getUserFromAuth(event);
  if (!isAllowedAdmin(user)) {
    return json(403, { error: "forbidden" });
  }

  const { id, type = "all" } = parseJSON(event.body) || {};
  if (!id) {
    return json(400, { error: "missing_id" });
  }

  const supa = getAdminClient();

  // main quiz_results row
  const { data: baseRows, error: baseErr } = await supa
    .from("quiz_results")
    .select("id,created_at,user_id,first_pick,top_summary,answers")
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

  // We'll build this so the modal stays happy.
  function buildPicks(row) {
    // We only stored first_pick (string like "MG ZS EV")
    // and top_summary (string like "MG ZS EV • Geely Coolray • ...")
    // We'll wrap that into a simple "picks" array.
    const primary = row.first_pick || "—";
    const blurb   = row.top_summary || "";

    return [{
      brand: primary,   // we don't have brand/model split anymore
      model: "",
      reason: blurb
    }];
  }

  // Signed-in user?
  if (main.user_id) {
    // profile data
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

    // ALL quiz_results rows for that same user (so we can count how many)
    const { data: resRows, error: resErr } = await supa
      .from("quiz_results")
      .select("id")
      .eq("user_id", profile.id);

    if (resErr) {
      console.error("[adminDetailsCORS] resErr:", resErr);
      return json(500, {
        error: "db_results_failed",
        detail: resErr.message
      });
    }

    const picks = buildPicks(main);

    const meta = {
      type: "User",
      top3_count: resRows?.length ?? 0,
      user_id: profile.id,
      created_at: main.created_at
    };

    return json(200, {
      profile: {
        email: profile.email || "—",
        name: profile.name || "—",
        nickname: profile.nickname || "—",
        gender: profile.gender || "—",
        dob: profile.dob || null,
        country: profile.country || "—",
        state: profile.state || "—",
        created_at: profile.created_at || main.created_at,
        updated_at: profile.updated_at || profile.created_at,
        user_id: profile.id
      },
      meta,
      picks,
      answers: main.answers || {}
    });
  }

  // Guest path: user_id is null
  const picks = buildPicks(main);

  return json(200, {
    profile: {
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
    },
    meta: {
      type: "Guest",
      top3_count: 1,
      user_id: null,
      created_at: main.created_at
    },
    picks,
    answers: main.answers || {}
  });
});
