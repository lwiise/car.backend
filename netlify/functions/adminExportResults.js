// netlify/functions/adminExportResults.js
const { withCors, corsHeaders } = require("./cors");
const { sbAdmin, parseBody } = require("./_supabase");

function csvEscape(v) {
  const s = (v ?? "").toString();
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

exports.handler = withCors(async (event) => {
  const supabase = sbAdmin();
  const { search = "", type = "all", lastDays = null, order = "desc", limit = 5000 } = parseBody(event);

  let query = supabase
    .from("results")
    .select("id, created_at, user_id, guest_id, top3, answers", { count: "exact" })
    .order("created_at", { ascending: order === "asc" })
    .limit(limit);

  if (type === "users")   query = query.is("guest_id", null);
  if (type === "guests")  query = query.not("guest_id", "is", null);

  if (lastDays && Number(lastDays) > 0) {
    const since = new Date(Date.now() - Number(lastDays) * 86400000).toISOString();
    query = query.gte("created_at", since);
  }

  const { data: resRows, error: resErr } = await query;
  if (resErr) return { statusCode: 500, body: { error: resErr.message } };

  const userIds = [...new Set((resRows || []).map(r => r.user_id).filter(Boolean))];
  let profilesById = {};
  if (userIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, email, name, country, state")
      .in("id", userIds);
    profilesById = (profs || []).reduce((a, p) => (a[p.id] = p, a), {});
  }

  const s = String(search || "").trim().toLowerCase();
  const filtered = !s ? resRows : resRows.filter(r => {
    const prof = r.user_id ? profilesById[r.user_id] : null;
    const hay = [prof?.name, prof?.email, prof?.country, prof?.state, JSON.stringify(r.top3||""), JSON.stringify(r.answers||"")].join(" ").toLowerCase();
    return hay.includes(s);
  });

  const header = ["Date", "Type", "Name", "Email", "Country", "State", "Pick #1", "Top-3", "Result ID"];
  const rows = filtered.map(r => {
    const prof = r.user_id ? profilesById[r.user_id] : null;
    const pick1 = Array.isArray(r.top3) && r.top3[0] ? `${r.top3[0].brand || ""} ${r.top3[0].model || ""}`.trim() : "";
    const top3 = (Array.isArray(r.top3) ? r.top3.slice(0,3) : []).map(x => `${x.brand||""} ${x.model||""}`.trim()).join(" | ");
    return [
      r.created_at,
      r.user_id ? "User" : "Guest",
      prof?.name || "",
      prof?.email || "",
      prof?.country || "",
      prof?.state || "",
      pick1,
      top3,
      r.id
    ];
  });

  const csv = [header, ...rows].map(r => r.map(csvEscape).join(",")).join("\n");
  return {
    statusCode: 200,
    headers: {
      ...corsHeaders(event),
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="results_export_${Date.now()}.csv"`
    },
    body: csv
  };
});
