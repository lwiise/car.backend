// netlify/functions/adminStatsCORS.js
import cors, { json } from "./cors.js";
import supaHelpers from "./_supabase.js";
const { getAdminClient, parseJSON, getUserFromAuth } = supaHelpers;

const ADMIN_EMAILS = ["kkk1@gmail.com"];

// same helpers from adminListCORS.js -- duplicated here so each file is standalone
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
        earliest_at: row.created_at,
        hasSignedUp: !row.is_guest,
      };
    }
    const g = groups[emailKey];
    g.all.push(row);

    if (new Date(row.created_at) < new Date(g.earliest_at)) {
      g.earliest_at = row.created_at;
    }
    if (!row.is_guest) {
      g.hasSignedUp = true;
    }
  }

  const snapshots = [];
  for (const key in groups) {
    const g = groups[key];
    const r = g.latest;
    const top3 = Array.isArray(r.top3) ? r.top3 : [];

    snapshots.push({
      email: r.email || "—",
      name: r.name || r.nickname || r.full_name || r.user_name || r.email || "—",
      created_at: r.created_at,
      top3,
      type: g.hasSignedUp ? "User" : "Guest",
      earliest_at: g.earliest_at,
    });
  }
  return snapshots;
}

function filterByType(snapshots, type) {
  if (type === "user") {
    return snapshots.filter(x => x.type === "User");
  }
  if (type === "guest") {
    return snapshots.filter(x => x.type === "Guest");
  }
  return snapshots;
}

export default cors(async function handler(event) {
  // 1. auth
  const { user } = await getUserFromAuth(event);
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    return json(401, { error: "unauthorized" });
  }

  // 2. body
  const body = parseJSON(event.body);
  const lastDays = Number(body.lastDays) || 7;
  const type = body.type || null;

  const supa = getAdminClient();

  // 3. pull recent data
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
      top3
    `)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("adminStatsCORS select error:", error);
    return json(500, { error: "db_error", detail: String(error.message || error) });
  }

  // 4. collapse per email
  const snaps = buildSnapshots(data || []);
  const nowFiltered = filterByType(snaps, type);

  // total = number of unique emails in this bucket
  const total = nowFiltered.length;

  // "new" = people whose FIRST EVER appearance (earliest_at) is within lastDays
  const cutoffMs = Date.now() - lastDays * 24 * 60 * 60 * 1000;
  const fresh = nowFiltered.filter(s => {
    const firstSeen = new Date(s.earliest_at).getTime() || 0;
    return firstSeen >= cutoffMs;
  });

  return json(200, {
    total,
    new: fresh.length,
  });
});
