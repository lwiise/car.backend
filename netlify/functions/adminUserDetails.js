// netlify/functions/adminUserDetails.js
const { withCors } = require("./cors");
const { sbAdmin, parseBody } = require("./_supabase");

/*
  Request body (choose one):
  { "resultId": "<results.id>" }  // preferred: shows profile (if any), top3 and answers for that result
  OR
  { "userId": "<profiles.id>" }   // will show profile + latest result (if one exists)
*/
exports.handler = withCors(async (event) => {
  const supabase = sbAdmin();
  const { resultId = null, userId = null } = parseBody(event);

  if (!resultId && !userId) {
    return { statusCode: 400, body: { error: "Provide resultId or userId" } };
  }

  let resultRow = null;
  let profile = null;

  if (resultId) {
    const { data: r, error } = await supabase
      .from("results")
      .select("id, created_at, user_id, guest_id, top3, answers")
      .eq("id", resultId).single();
    if (error) return { statusCode: 404, body: { error: "Result not found" } };
    resultRow = r;
    if (r.user_id) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, email, name, nickname, gender, dob, country, state")
        .eq("id", r.user_id).single();
      profile = p || null;
    }
  } else if (userId) {
    const { data: p, error: pErr } = await supabase
      .from("profiles")
      .select("id, email, name, nickname, gender, dob, country, state")
      .eq("id", userId).single();
    if (pErr) return { statusCode: 404, body: { error: "User not found" } };
    profile = p;

    const { data: r } = await supabase
      .from("results")
      .select("id, created_at, user_id, guest_id, top3, answers")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    resultRow = (r && r[0]) || null;
  }

  const latestPicks = Array.isArray(resultRow?.top3) ? resultRow.top3.slice(0, 3) : [];
  const overview = {
    name: profile?.name || (resultRow?.guest_id ? `Guest ${String(resultRow.guest_id).slice(0,6)}` : ""),
    email: profile?.email || "",
    country: profile?.country || "",
    state: profile?.state || "",
    gender: profile?.gender || "",
    dob: profile?.dob || ""
  };
  const meta = {
    type: resultRow?.user_id ? "User" : "Guest",
    createdAt: resultRow?.created_at || null,
    userId: resultRow?.user_id || null,
    guestId: resultRow?.guest_id || null,
    top3Count: latestPicks.length
  };

  return {
    statusCode: 200,
    body: {
      overview,
      metadata: meta,
      latestPicks,
      answers: resultRow?.answers || {}
    }
  };
});
