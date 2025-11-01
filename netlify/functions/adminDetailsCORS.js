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

  const { email, type = "user" } = parseJSON(event.body) || {};
  if (!email) {
    return json(400, { error: "missing_email" });
  }

  const supa = getAdminClient();

  // USER FLOW
  if (type === "user") {
    // 1. find the profile by email
    const { data: profRows, error: profErr } = await supa
      .from("profiles")
      .select(
        "id,email,name,nickname,gender,dob,country,state,created_at,updated_at"
      )
      .eq("email", email)
      .limit(1);

    if (profErr) {
      console.error("[adminDetailsCORS] profErr:", profErr);
      return json(500, { error: "db_profile_failed", detail: profErr.message });
    }
    const profile = profRows?.[0];
    if (!profile) {
      return json(404, { error: "not_found", detail: "profile not found" });
    }

    // 2. get ALL quiz_results rows for that user_id
    const { data: resRows, error: resErr } = await supa
      .from("quiz_results")
      .select("id,created_at,top3,answers,user_id")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false });

    if (resErr) {
      console.error("[adminDetailsCORS] resErr:", resErr);
      return json(500, { error: "db_results_failed", detail: resErr.message });
    }

    const latest = resRows?.[0] || null;
    const picks = Array.isArray(latest?.top3) ? latest.top3.slice(0,3) : [];
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

  // GUEST FLOW
  // Guest = quiz_results where user_id IS NULL but they still left an email
  const { data: guestRows, error: guestErr } = await supa
    .from("quiz_results")
    .select("id,created_at,top3,answers,user_id,email,name")
    .is("user_id", null)
    .eq("email", email)
    .order("created_at", { ascending: false });

  if (guestErr) {
    console.error("[adminDetailsCORS] guestErr:", guestErr);
    return json(500, { error: "db_guest_failed", detail: guestErr.message });
  }
  const latest = guestRows?.[0] || null;
  if (!latest) {
    return json(404, { error: "not_found", detail: "guest result not found" });
  }

  const profile = {
    email: latest.email || "—",
    name: latest.name || "—",
    nickname: null,
    gender: null,
    dob: null,
    country: null,
    state: null,
    created_at: latest.created_at,
    updated_at: latest.created_at,
    user_id: null
  };

  const picks = Array.isArray(latest.top3) ? latest.top3.slice(0,3) : [];
  const answers = latest.answers || {};

  const meta = {
    type: "Guest",
    top3_count: guestRows?.length ?? 0,
    user_id: null,
    created_at: latest.created_at
  };

  return json(200, {
    profile,
    meta,
    picks,
    answers
  });
});
