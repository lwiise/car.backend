// netlify/functions/adminListCORS.js
import cors, { json } from "./cors.js";
import { getAdminClient, parseJSON } from "./_supabase.js";

export default cors(async (event) => {
  const supa = getAdminClient();
  const body = parseJSON(event.body || "{}");

  const page      = Math.max(1, Number(body.page) || 1);
  const pageSize  = Math.min(Number(body.pageSize) || 20, 200);
  const offset    = (page - 1) * pageSize;
  const to        = offset + pageSize - 1;

  const type      = body.type || null;      // "user" | "guest" | null ("all")
  const rawSearch = (body.search || "").trim().toLowerCase();
  // resultsOnly is coming from the frontend but we don't really need it now
  // const resultsOnly = !!body.resultsOnly;

  // 1. base query: pull recent quiz results
  // we always read from `results`
  // columns we need for display
  let q = supa
    .from("results")
    .select("id, created_at, top3, answers, user_id")
    .order("created_at", { ascending: false })
    .range(offset, to);

  // Filter by user/guest
  if (type === "user") {
    // signed-in people => user_id is NOT NULL
    q = q.not("user_id", "is", null);
  } else if (type === "guest") {
    // anonymous => user_id IS NULL
    q = q.is("user_id", null);
  }

  const { data: rows, error } = await q;
  if (error) {
    console.error("adminListCORS: results query failed:", error);
    return json(500, { error: "db_error", detail: String(error.message || error) });
  }

  // 2. collect user_ids so we can join profile + email
  const userIds = [...new Set(rows.filter(r => r.user_id).map(r => r.user_id))];

  let profilesById = {};
  let usersById = {};

  if (userIds.length) {
    // profiles table (your custom table with optional user info)
    const { data: profs, error: pErr } = await supa
      .from("profiles")
      .select("id, full_name, nickname, country, state, gender, dob, created_at, updated_at")
      .in("id", userIds);

    if (pErr) console.warn("adminListCORS: profiles fetch err", pErr);
    (profs || []).forEach(p => { profilesById[p.id] = p; });

    // auth.users table (Supabase internal) for emails
    const { data: authUsers, error: uErr } = await supa
      .from("auth.users")
      .select("id, email")
      .in("id", userIds);

    if (uErr) console.warn("adminListCORS: auth.users fetch err", uErr);
    (authUsers || []).forEach(u => { usersById[u.id] = u; });
  }

  // 3. decorate rows
  let items = rows.map(r => {
    const prof = profilesById[r.user_id] || {};
    const au   = usersById[r.user_id]   || {};

    const top3 = Array.isArray(r.top3) ? r.top3 : [];
    const firstPick = top3[0]
      ? `${top3[0].brand || ""} ${top3[0].model || ""}`.trim()
      : "—";

    // “name” we’ll try in priority order
    const displayName =
      prof.full_name ||
      prof.nickname ||
      au.email ||
      "—";

    const email = au.email || "—";

    return {
      id: r.id,
      user_id: r.user_id || null,
      name: displayName,
      email,
      created_at: r.created_at,
      top3,
      first_pick: firstPick,
      type: r.user_id ? "User" : "Guest",
    };
  });

  // 4. apply search (client sends >=2 chars)
  if (rawSearch && rawSearch.length >= 2) {
    const s = rawSearch;
    items = items.filter(it => {
      // search in name, email, first pick, and top3 car names / reasons
      const inName   = (it.name   || "").toLowerCase().includes(s);
      const inEmail  = (it.email  || "").toLowerCase().includes(s);
      const inPick   = (it.first_pick || "").toLowerCase().includes(s);
      const inCars   = Array.isArray(it.top3) && it.top3.some(c => {
        const carName = `${c.brand || ""} ${c.model || ""}`.toLowerCase();
        const carWhy  = (c.reason || "").toLowerCase();
        return carName.includes(s) || carWhy.includes(s);
      });
      return inName || inEmail || inPick || inCars;
    });
  }

  // 5. reply
  // hasMore here is naive (local page window). Good enough for now.
  return json(200, {
    items,
    hasMore: items.length === pageSize,
  });
});
