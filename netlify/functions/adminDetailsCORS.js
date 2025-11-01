// netlify/functions/adminDetailsCORS.js
import cors, { json } from "./cors.js";
import {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
  isAllowedAdmin
} from "./_supabase.js";

function grabSummary(row) {
  return (
    row.top_summary ??
    row.top3 ??
    row.top_3 ??
    row.summary ??
    ""
  );
}

// Build the "picks" section for the modal
function buildPicks(row) {
  const primary = row.first_pick || "—";
  const blurb   = grabSummary(row) || "";
  return [{
    brand: primary,  // we don't have clean brand/model split, so we stuff in brand
    model: "",
    reason: blurb
  }];
}

export const handler = cors(async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  // admin check
  const { user } = await getUserFromAuth(event);
  if (!isAllowedAdmin(user)) {
    return json(403, { error: "forbidden" });
  }

  const { id } = parseJSON(event.body) || {};
  if (!id) {
    return json(400, { error: "missing_id" });
  }

  const supa = getAdminClient();

  // 1. pull the quiz_results row
  const { data: baseRows, error: baseErr } = await supa
    .from("quiz_results")
    .select("*")
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

  // 2. If user_id exists, fetch profile + count all their results
  if (main.user_id) {
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

    // count all quiz_results for this user_id
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

  // 3. Guest path
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
