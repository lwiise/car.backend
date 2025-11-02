// netlify/functions/adminListCORS.js
import {
  getAdminClient,
  parseJSON,
  requireAdmin,
  jsonResponse,
  preflightResponse
} from "./_supabaseAdmin.js";

export const handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse();
  }

  // admin gate
  const auth = await requireAdmin(event);
  if (!auth.ok) {
    return jsonResponse(auth.statusCode, auth.payload);
  }

  // body input from frontend
  const body = parseJSON(event.body);
  const page = Number(body.page) || 1;
  const pageSize = Number(body.pageSize) || 20;
  const searchRaw = (body.search || "").trim().toLowerCase();
  const type = (body.type || "user").toLowerCase(); // "user" | "guest" | "all"
  // body.resultsOnly is ignored for now

  // Right now we don't persist true "guests" (people who never signed up).
  // So Guests tab = empty. We just return [] so UI won't crash.
  if (type === "guest") {
    return jsonResponse(200, { items: [], hasMore: false });
  }

  const supa = getAdminClient();

  // 1. grab a bunch of recent results, newest first
  //    we'll dedupe by user_id so we only keep each user's *latest* quiz.
  const { data: resRows, error: resErr } = await supa
    .from("results")
    .select("user_id, created_at, top3, answers")
    .not("user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(5000); // plenty for now

  if (resErr) {
    console.error("results query error", resErr);
    return jsonResponse(500, {
      error: "db_list_failed",
      detail: resErr.message || String(resErr)
    });
  }

  // 2. keep only the latest row per user_id
  //    first time we see a user_id is already the newest because of DESC order.
  const latestMap = {};
  for (const row of resRows || []) {
    if (!row.user_id) continue;
    if (!latestMap[row.user_id]) {
      latestMap[row.user_id] = row;
    }
  }

  // turn into array
  let latestArr = Object.entries(latestMap).map(([user_id, r]) => ({
    user_id,
    created_at: r.created_at,
    top3: Array.isArray(r.top3) ? r.top3 : [],
    answers: r.answers || {}
  }));

  // 3. fetch all matching profiles in one go
  const allIds = latestArr.map(r => r.user_id);
  let profMap = {};
  if (allIds.length) {
    const { data: profRows, error: profErr } = await supa
      .from("profiles")
      .select("id,email,name,nickname,updated_at,country,state,gender,dob")
      .in("id", allIds);

    if (profErr) {
      console.error("profiles query error", profErr);
      return jsonResponse(500, {
        error: "db_list_failed",
        detail: profErr.message || String(profErr)
      });
    }

    for (const p of profRows || []) {
      profMap[p.id] = p;
    }
  }

  // 4. merge + derive display fields your table needs (#1 PICK, TOP-3, etc.)
  latestArr = latestArr.map(r => {
    const prof = profMap[r.user_id] || {};
    const top3 = r.top3 || [];

    // first car
    const first = top3[0] || {};
    const first_pick = [first.brand || "", first.model || ""]
      .join(" ")
      .trim() || "—";

    // compressed summary "Brand Model • Brand Model • Brand Model"
    const top_summary =
      top3
        .slice(0, 3)
        .map(car =>
          `${car.brand || ""} ${car.model || ""}`.trim()
        )
        .filter(Boolean)
        .join(" • ") || "—";

    return {
      id: r.user_id,
      email: prof.email || null,
      name: prof.name || prof.nickname || null,
      created_at: r.created_at,
      first_pick,
      top_summary,
      top3,
      type: "User"
    };
  });

  // 5. search filter (email / name / cars / etc.)
  let filtered = latestArr;
  if (searchRaw) {
    filtered = latestArr.filter(it => {
      const haystack = [
        it.email || "",
        it.name || "",
        it.first_pick || "",
        it.top_summary || "",
        JSON.stringify(it.top3 || [])
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchRaw);
    });
  }

  // 6. newest first
  filtered.sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  // 7. pagination
  const offset = (page - 1) * pageSize;
  const pageSlice = filtered.slice(offset, offset + pageSize);
  const hasMore = offset + pageSize < filtered.length;

  return jsonResponse(200, {
    items: pageSlice,
    hasMore
  });
};
