// netlify/functions/adminExportCORS.js
import cors from "./cors.js";
import supaHelpers from "./_supabase.js";
const { getAdminClient, parseJSON, getUserFromAuth } = supaHelpers;

const ADMIN_EMAILS = ["kkk1@gmail.com"];

function buildSnapshots(rawRows) {
  const groups = {};
  for (const row of rawRows) {
    const emailKey =
      (row.email && row.email.toLowerCase()) ||
      (`guest-${row.id}`);

    if (!groups[emailKey]) {
      groups[emailKey] = {
        all: [],
        latest: row,
        hasSignedUp: !row.is_guest,
      };
    }
    const g = groups[emailKey];
    g.all.push(row);
    if (!row.is_guest) {
      g.hasSignedUp = true;
    }
  }

  const snapshots = [];
  for (const key in groups) {
    const g = groups[key];
    const r = g.latest;
    const top3 = Array.isArray(r.top3) ? r.top3 : [];
    const firstPickObj = top3[0] || {};
    const firstPick =
      (firstPickObj.brand || firstPickObj.model)
        ? `${firstPickObj.brand || ""} ${firstPickObj.model || ""}`.trim()
        : (r.first_pick || "—");

    const topSummary =
      top3
        .slice(0, 3)
        .map(p => `${p.brand || ""} ${p.model || ""}`.trim())
        .filter(Boolean)
        .join(" • ")
      || r.top_summary
      || "—";

    snapshots.push({
      email: r.email || "—",
      name:
        r.name ||
        r.nickname ||
        r.full_name ||
        r.user_name ||
        r.email ||
        "—",
      created_at: r.created_at,
      first_pick: firstPick || "—",
      top_summary: topSummary,
      type: g.hasSignedUp ? "User" : "Guest",
    });
  }
  return snapshots;
}

function filterSnapshots(snapshots, { search, type }) {
  let out = snapshots.slice();

  if (type === "user") {
    out = out.filter(x => x.type === "User");
  } else if (type === "guest") {
    out = out.filter(x => x.type === "Guest");
  }

  if (search && search.trim().length >= 2) {
    const needle = search.trim().toLowerCase();
    out = out.filter(x => {
      return (
        (x.email || "").toLowerCase().includes(needle) ||
        (x.name || "").toLowerCase().includes(needle) ||
        (x.first_pick || "").toLowerCase().includes(needle) ||
        (x.top_summary || "").toLowerCase().includes(needle)
      );
    });
  }

  return out;
}

function toCSV(rows) {
  // basic CSV generator
  const header = [
    "Email",
    "Name",
    "Created At",
    "#1 Pick",
    "Top-3 Summary",
    "Type"
  ];
  const lines = [header.join(",")];

  for (const r of rows) {
    const cells = [
      r.email || "",
      r.name || "",
      r.created_at || "",
      r.first_pick || "",
      r.top_summary || "",
      r.type || ""
    ].map(val => {
      // escape quotes
      const v = (val || "").toString().replace(/"/g, '""');
      return `"${v}"`;
    });
    lines.push(cells.join(","));
  }

  return lines.join("\n");
}

export default cors(async function handler(event) {
  // 1. auth
  const { user } = await getUserFromAuth(event);
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    return {
      statusCode: 401,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ error: "unauthorized" })
    };
  }

  // 2. body
  const body = parseJSON(event.body);
  const search = body.search || "";
  const type = body.type || null;

  const supa = getAdminClient();

  // 3. fetch data
  const { data, error } = await supa
    .from("quiz_results")
    .select(`
      id,
      created_at,
      email,
      name,
      nickname,
      full_name,
      user_name,
      is_guest,
      top3,
      first_pick,
      top_summary
    `)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("adminExportCORS select error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ error: "db_error", detail: String(error.message || error) })
    };
  }

  // 4. group + filter
  const snaps = buildSnapshots(data || []);
  const filtered = filterSnapshots(snaps, { search, type });

  // 5. build CSV
  const csv = toCSV(filtered);

  return {
    statusCode: 200,
    headers: {
      // important: CSV download headers
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="users.csv"'
    },
    body: csv
  };
});
