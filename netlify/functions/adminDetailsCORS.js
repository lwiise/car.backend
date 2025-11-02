// netlify/functions/adminDetailsCORS.js
import {
  getAdminClient,
  parseJSON,
  requireAdmin,
  jsonResponse,
  preflightResponse
} from "./_supabaseAdmin.js";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse();
  }

  const auth = await requireAdmin(event);
  if (!auth.ok) {
    return jsonResponse(auth.statusCode, auth.payload);
  }

  const body = parseJSON(event.body);
  const email = (body.email || "").trim();
  const type = (body.type || "user").toLowerCase();

  if (!email) {
    return jsonResponse(400, {
      error: "bad_request",
      detail: "email required"
    });
  }

  const supa = getAdminClient();

  // 1. get profile
  const { data: prof, error: profErr } = await supa
    .from("profiles")
    .select(
      "id,email,name,nickname,dob,gender,country,state,updated_at"
    )
    .eq("email", email)
    .maybeSingle();

  if (profErr) {
    console.error("profile fetch error", profErr);
    return jsonResponse(500, {
      error: "db_detail_failed",
      detail: profErr.message || String(profErr)
    });
  }

  if (!prof) {
    return jsonResponse(404, {
      error: "not_found",
      detail: "profile not found"
    });
  }

  // 2. latest result for that user
  const { data: latestResArr, error: resErr } = await supa
    .from("results")
    .select("id,created_at,top3,answers")
    .eq("user_id", prof.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (resErr) {
    console.error("latest result error", resErr);
    return jsonResponse(500, {
      error: "db_detail_failed",
      detail: resErr.message || String(resErr)
    });
  }

  const latestRes =
    latestResArr && latestResArr[0] ? latestResArr[0] : null;

  // 3. how many total results this user has ever made
  const { count: resCount, error: cntErr } = await supa
    .from("results")
    .select("id", { count: "exact", head: true })
    .eq("user_id", prof.id);

  if (cntErr) {
    console.error("results count error", cntErr);
  }

  // shape the response exactly how your frontend expects it:
  const outProfile = {
    user_id: prof.id,
    email: prof.email || "",
    name: prof.name || "",
    nickname: prof.nickname || "",
    gender: prof.gender || "",
    dob: prof.dob || null,
    country: prof.country || "",
    state: prof.state || "",
    created_at: latestRes ? latestRes.created_at : null,
    updated_at: prof.updated_at || null
  };

  const meta = {
    type: type === "guest" ? "Guest" : "User",
    user_id: prof.id,
    top3_count: Array.isArray(latestRes?.top3)
      ? latestRes.top3.length
      : 0,
    results_count:
      typeof resCount === "number" ? resCount : null
  };

  return jsonResponse(200, {
    profile: outProfile,
    meta,
    picks: Array.isArray(latestRes?.top3) ? latestRes.top3 : [],
    answers: latestRes?.answers || {}
  });
};
