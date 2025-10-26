// netlify/functions/adminListResults.js
const { withCors } = require("./cors");
const { sbAdmin, parseBody } = require("./_supabase");

exports.handler = withCors(async (event) => {
  const supabase = sbAdmin();
  const {
    search = "",            // free-text
    type = "all",           // "all" | "users" | "guests"
    lastDays = null,        // 7|30|90|365|null
    page = 1,
    pageSize = 25,
    order = "desc"          // "asc" | "desc"
  } = parseBody(event);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("results")
    .select("id, created_at, user_id, guest_id, top3, answers", { count: "exact" })
    .order("created_at", { ascending: order === "asc" })
    .range(from, to);

  if (type === "users")   query = query.is("guest_id", null);
  if (type === "guests")  query = query.not("guest_id", "is", null);

  if (lastDays && Number(lastDays) > 0) {
    const since = new Date(Date.now() - Number(lastDays) * 86400000).toISOString();
    query = query.gte("created_at", since);
  }

  const { data: resRows, error: resErr, count } = await query;
  if (resErr) return { statusCode: 500, body: { error: resErr.message } };

  // hydrate profiles for registered users
  const userIds = [...new Set((resRows || []).map(r => r.user_id).filter(Boolean))];
  let profilesById = {};
  if (userIds.length) {
    const { data: profs, error: pErr } = await supabase
      .from("profiles")
      .select("id, email, name, nickname, gender, dob, country, state")
      .in("id", userIds);
    if (pErr) return { statusCode: 500, body: { error: pErr.message } };
    profilesById = (profs || []).reduce((a, p) => (a[p.id] = p, a), {});
  }

  // client-side search across profile + picks + answers
  const s = String(search || "").trim().toLowerCase();
  const filtered = !s ? resRows : resRows.filter(r => {
    const prof = r.user_id ? profilesById[r.user_id] : null;
    const hay = [
      prof?.name, prof?.email, prof?.country, prof?.state,
      JSON.stringify(r.top3 || ""),
      JSON.stringify(r.answers || "")
    ].join(" ").toLowerCase();
    return hay.includes(s);
  });

  const rows = filtered.map(r => {
    const prof = r.user_id ? profilesById[r.user_id] : null;
    const pick1 = Array.isArray(r.top3) && r.top3[0] ? `${r.top3[0].brand || ""} ${r.top3[0].model || ""}`.trim() : "";
    const top3Summary = (Array.isArray(r.top3) ? r.top3.slice(0,3) : [])
      .map(it => `${it.brand || ""} ${it.model || ""}`.trim()).filter(Boolean).join(" • ");
    return {
      id: r.id,
      date: r.created_at,
      type: r.user_id ? "User" : "Guest",
      user_id: r.user_id || null,
      guest_id: r.guest_id || null,
      name: prof?.name || (r.guest_id ? `Guest ${String(r.guest_id).slice(0,6)}` : ""),
      email: prof?.email || "",
      country: prof?.country || "",
      state: prof?.state || "",
      pick1,
      top3Summary
    };
  });

  return { statusCode: 200, body: { page, pageSize, total: count ?? rows.length, rows } };
});
