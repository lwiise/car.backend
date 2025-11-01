// netlify/functions/adminStatsCORS.js
import cors, { json } from "./cors.js";
import {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
} from "./_supabase.js";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "kkk1@gmail.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// same grouping logic, trimmed down for stats
function buildSnapshots(rawRows) {
  const groups = {};

  for (const row of rawRows) {
    const emailKey =
      (row.email && row.email.toLowerCase()) ||
      `guest-${row.id}`;

    if (!groups[emailKey]) {
      groups[emailKey] = {
        latest: row,
        earliest_at: row.created_at,
        hasSignedUp: !row.is_guest,
      };
    } else {
      // track earliest presence
      if (
        new Date(row.created_at) <
        new Date(groups[emailKey].earliest_at)
      ) {
        groups[emailKey].earliest_at = row.created_at;
      }
      // if any record isn't guest, mark them as User
      if (!row.is_guest) {
        groups[emailKey].hasSignedUp = true;
      }
    }
  }

  const snapshots = [];
  for (const key in groups) {
    const g = groups[key];
    const r = g.latest;
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
      earliest_at: g.earliest_at,
      type: g.hasSignedUp ? "User" : "Guest",
    });
  }
  return snapshots;
}

function filterByType(snapshots, type) {
  if (type === "user") {
    return snapshots.filter((x) => x.type === "User");
  }
  if (type === "guest") {
    return snapshots.filter((x) => x.type === "Guest");
  }
  return snapshots;
}

export default cors(async function handler(event) {
  // 1. auth
  const { user } = await getUserFromAuth(event);
  const emailLower = user?.email?.toLowerCase() || "";
  if (!user || !ADMIN_EMAILS.includes(emailLower)) {
    return json(401, { error: "unauthorized" });
  }

  // 2. params from frontend
  const body = parseJSON(event.body);
  const lastDays = Number(body.lastDays) || 7;
  const type = body.type || null; // "user" | "guest" | null

  const supa = getAdminClient();

  // 3. fetch recent quiz rows
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
      is_guest
    `)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("adminStatsCORS select error:", error);
    return json(500, {
      error: "db_error",
      detail: String(error.message || error),
    });
  }

  // 4. collapse by email
  const snaps = buildSnapshots(data || []);

  // 5. filter users/guests
  const filtered = filterByType(snaps, type);

  // total unique
  const total = filtered.length;

  // "new" = first time we ever saw them is within lastDays
  const cutoffMs =
    Date.now() - lastDays * 24 * 60 * 60 * 1000;
  const fresh = filtered.filter((s) => {
    const firstSeen = new Date(s.earliest_at).getTime() || 0;
    return firstSeen >= cutoffMs;
  });

  return json(200, {
    total,
    new: fresh.length,
  });
});
