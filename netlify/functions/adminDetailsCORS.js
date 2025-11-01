// netlify/functions/adminDetailsCORS.js
import cors, { json } from "./cors.js";
import {
  getAdminClient,
  getUserFromAuth,
  parseJSON,
  ADMIN_EMAILS
} from "./_supabaseAdmin.js";

export const handler = cors(async function (event, context) {
  const { user } = await getUserFromAuth(event);
  if (!user) return json(401, { error: "unauthorized" });
  if (!ADMIN_EMAILS.includes(user.email)) {
    return json(403, { error: "forbidden" });
  }

  const body = parseJSON(event.body);
  const email = body.email || "";
  // body.type can be "user"/"guest", but we'll infer from data anyway

  const supa = getAdminClient();

  // 1. find profile by email
  let profile = null;
  if (email) {
    const { data: profRow, error: profErr } = await supa
      .from("profiles")
      .select(
        "user_id, full_name, first_name, nickname, name, email, gender, dob, country, state, created_at, updated_at"
      )
      .eq("email", email)
      .maybeSingle();

    if (profErr) {
      console.warn("adminDetailsCORS profile err:", profErr);
    }
    profile = profRow || null;
  }

  let userIdForResults = profile?.user_id || null;

  // 2. find latest result row for that user (or fallback to any latest result)
  let resultRow = null;

  if (userIdForResults) {
    const { data: resRows, error: resErr } = await supa
      .from("results")
      .select("id, created_at, top3, answers, user_id")
      .eq("user_id", userIdForResults)
      .order("created_at", { ascending: false })
      .limit(1);

    if (resErr) console.warn("adminDetailsCORS result err:", resErr);
    resultRow = Array.isArray(resRows) && resRows[0] ? resRows[0] : null;
  } else {
    const { data: resRowsGuest, error: resErr2 } = await supa
      .from("results")
      .select("id, created_at, top3, answers, user_id")
      .order("created_at", { ascending: false })
      .limit(1);

    if (resErr2) console.warn("adminDetailsCORS guest result err:", resErr2);
    resultRow =
      Array.isArray(resRowsGuest) && resRowsGuest[0]
        ? resRowsGuest[0]
        : null;

    if (!userIdForResults) {
      userIdForResults = resultRow?.user_id || null;
    }
  }

  const picks = Array.isArray(resultRow?.top3) ? resultRow.top3 : [];
  const answers = resultRow?.answers || {};

  const meta = {
    user_id: userIdForResults || null,
    type: resultRow?.user_id ? "User" : "Guest",
    top3_count: picks.length,
    created_at:
      resultRow?.created_at ||
      profile?.created_at ||
      null
  };

  return json(200, {
    profile: profile || {},
    meta,
    picks,
    answers
  });
});
