// netlify/functions/adminExportResults.js
const { withCors } = require("./cors");
const { getAdminClient } = require("./_supabase");

function esc(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

exports.handler = withCors(async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const adminEmail = event.headers["x-admin-email"] || event.headers["X-Admin-Email"] || "";
  if (!adminEmail) console.warn("[adminExportResults] Missing X-Admin-Email");

  const sb = getAdminClient();

  const { data: rows, error } = await sb
    .from("results")
    .select("id,created_at,top3,answers,user_id,guest_id")
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    console.error("[adminExportResults] DB error", error);
    return { statusCode: 500, body: JSON.stringify({ error: "EXPORT_DB" }) };
  }

  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  let profiles = [];
  if (userIds.length) {
    const { data: profs } = await sb
      .from("profiles")
      .select("id,email,name,nickname,country,state")
      .in("id", userIds);
    profiles = profs || [];
  }
  const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));

  const header = ["ResultID", "CreatedAt", "Email", "Name", "Country", "State", "#Top3"];
  const csvRows = [header.join(",")];

  for (const r of rows) {
    const p = r.user_id ? byId[r.user_id] || {} : {};
    const topCount = Array.isArray(r.top3) ? r.top3.length : 0;
    csvRows.push([
      esc(r.id),
      esc(r.created_at),
      esc(p.email || ""),
      esc(p.name || p.nickname || ""),
      esc(p.country || ""),
      esc(p.state || ""),
      esc(topCount),
    ].join(","));
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="results_export.csv"`,
    },
    body: csvRows.join("\n"),
  };
});
