// netlify/functions/adminListCORS.js
import cors, { json } from "./cors.js";
import supaHelpers from "./_supabase.js";
const { getAdminClient, parseJSON, getUserFromAuth } = supaHelpers;

/**
 * Who is allowed to access the admin dashboard.
 * Put ALL admin emails here (the emails you use to log in with Supabase Auth).
 */
const ADMIN_EMAILS = ["kkk1@gmail.com"];

/**
 * Build per-email snapshots:
 * - collapse many quiz results from the same email into one row (latest result wins)
 * - figure out if this email is a "User" (signed up) or "Guest" (only guest data)
 * - precompute summary strings for UI
 */
function buildSnapshots(rawRows) {
  // group rows by email (case-insensitive); fall back to a fake key if email is missing
  const groups = {};

  for (const row of rawRows) {
    const emailKey =
      (row.email && row.email.toLowerCase()) ||
      (`guest-${row.id}`); // no email case (not ideal but prevents crash)

    if (!groups[emailKey]) {
      groups[emailKey] = {
        all: [],
        latest: row,          // we'll keep first row as "latest" because we'll sort desc
        earliest_at: row.created_at,
        hasSignedUp: !row.is_guest, // if any row is not guest, this will flip true
      };
    }

    const g = groups[emailKey];
    g.all.push(row);

    // track earliest time they ever appeared
    if (new Date(row.created_at) < new Date(g.earliest_at)) {
      g.earliest_at = row.created_at;
    }

    // latest = most recent row. assume rawRows already sorted newest -> oldest
    // so first push stays the newest, we do nothing

    // if any row shows is_guest === false, treat them as signed up
    if (!row.is_guest) {
      g.hasSignedUp = true;
    }
  }

  // turn each group into a single snapshot row for the UI
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
      top3,
      type: g.hasSignedUp ? "User" : "Guest",

      // we also keep some extras that we reuse in details / stats
      all_rows: g.all,
      earliest_at: g.earliest_at,
      hasSignedUp: g.hasSignedUp,
      user_id: r.user_id || r.profile_id || r.uid || null,
    });
  }

  return snapshots;
}

/**
 * Filter by search and type.
 * - type can be "user", "guest", or null/"all".
 * - search needs >=2 chars.
 */
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

export default cors(async function handler(event) {
  // 1. auth check
  const { user } = await getUserFromAuth(event);
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    return json(401, { error: "unauthorized" });
  }

  // 2. parse body
  const body = parseJSON(event.body);
  const page = Number(body.page) || 1;
  const pageSize = Number(body.pageSize) || 20;
  const search = body.search || "";
  const type = body.type || null; // "user" | "guest" | null
  // resultsOnly is ignored here because the frontend only shows results anyway

  const supa = getAdminClient();

  // 3. fetch recent quiz result rows (newest first)
  //    NOTE: update 'quiz_results' and column list to match your DB.
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
      user_id,
      is_guest,
      top3,
      first_pick,
      top_summary,
      answers
    `)
    .order("created_at", { ascending: false })
    .limit(500); // grab a decent chunk, we'll group and paginate in memory

  if (error) {
    console.error("adminListCORS select error:", error);
    return json(500, { error: "db_error", detail: String(error.message || error) });
  }

  // 4. collapse rows per email
  const snapshots = buildSnapshots(data || []);

  // 5. apply filters (type + search)
  const filtered = filterSnapshots(snapshots, { search, type });

  // 6. paginate after filtering
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const slice = filtered.slice(start, end);
  const hasMore = end < filtered.length;

  // 7. shape response
  return json(200, {
    items: slice.map(row => ({
      email: row.email,
      name: row.name,
      created_at: row.created_at,
      first_pick: row.first_pick,
      top_summary: row.top_summary,
      top3: row.top3,
      type: row.type,
    })),
    hasMore,
  });
});
