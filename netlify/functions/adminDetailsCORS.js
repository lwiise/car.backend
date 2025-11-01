// netlify/functions/adminDetailsCORS.js
import cors, { json } from "./cors.js";
import { getAdminClient, parseJSON } from "./_supabase.js";

export default cors(async (event) => {
  const supa = getAdminClient();
  const body = parseJSON(event.body || "{}");

  const emailRaw = (body.email || "").trim().toLowerCase();
  if (!emailRaw) {
    // guest without email OR bad click
    return json(200, {
      profile: {},
      meta: {},
      picks: [],
      answers: {},
    });
  }

  // 1. find auth user by email
  const { data: authUser, error: authErr } = await supa
    .from("auth.users")
    .select("id, email, created_at, updated_at")
    .ilike("email", emailRaw)
    .limit(1)
    .maybeSingle();

  if (authErr) {
    console.warn("adminDetailsCORS authErr", authErr);
  }

  if (!authUser || !authUser.id) {
    // no registered account that matches that email
    return json(200, {
      profile: {
        email: emailRaw,
      },
      meta: { type: "Guest" },
      picks: [],
      answers: {},
    });
  }

  const uid = authUser.id;

  // 2. profile row (optional extra info you might be storing)
  const { data: prof, error: profErr } = await supa
    .from("profiles")
    .select("id, full_name, nickname, country, state, gender, dob, created_at, updated_at")
    .eq("id", uid)
    .maybeSingle();

  if (profErr) {
    console.warn("adminDetailsCORS profErr", profErr);
  }

  // 3. latest quiz result for that user
  const { data: resultRow, error: resErr } = await supa
    .from("results")
    .select("id, created_at, top3, answers, user_id")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (resErr) {
    console.warn("adminDetailsCORS resErr", resErr);
  }

  const picks   = Array.isArray(resultRow?.top3) ? resultRow.top3 : [];
  const answers = resultRow?.answers || {};

  const profileObj = {
    name:     prof?.full_name || prof?.nickname || authUser.email || "—",
    email:    authUser.email || "—",
    nickname: prof?.nickname || "—",
    gender:   prof?.gender   || "—",
    dob:      prof?.dob      || "—",
    country:  prof?.country  || "—",
    state:    prof?.state    || "—",
    created_at: prof?.created_at || resultRow?.created_at || authUser.created_at || null,
    updated_at: prof?.updated_at || authUser.updated_at || null,
  };

  const metaObj = {
    type: "User",
    user_id: uid,
    created_at: resultRow?.created_at || null,
    top3_count: picks.length,
  };

  return json(200, {
    profile: profileObj,
    meta: metaObj,
    picks,
    answers,
  });
});
