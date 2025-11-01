import cors, { json } from "./cors.js";
import { sbAdmin } from "./_supabase.js";

// --- BEGIN ADMIN AUTH BLOCK ---
const ALLOWED_ADMINS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

async function requireAdmin(supabase, event) {
  const authHeader = event.headers?.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { ok:false, statusCode:401, error:"Missing bearer token" };
  }

  // validate token with Supabase
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { ok:false, statusCode:401, error:"Unauthorized" };
  }

  const email = (data.user.email || "").toLowerCase();

  // if you set ADMIN_EMAILS, only those emails can get in
  if (ALLOWED_ADMINS.length && !ALLOWED_ADMINS.includes(email)) {
    return { ok:false, statusCode:403, error:"Forbidden" };
  }

  return { ok:true, user:data.user };
}
// --- END ADMIN AUTH BLOCK ---


// netlify/functions/adminExport.js
import cors from "./cors.js"; // we'll build our own raw response, not json()
import { sbAdmin } from "./_supabase.js";

// --- paste helper from above here ---
const ALLOWED_ADMINS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

async function requireAdmin(supabase, event) {
  const authHeader = event.headers?.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok:false, statusCode:401, error:"Missing bearer token" };

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { ok:false, statusCode:401, error:"Unauthorized" };

  const email = (data.user.email || "").toLowerCase();
  if (ALLOWED_ADMINS.length && !ALLOWED_ADMINS.includes(email)) {
    return { ok:false, statusCode:403, error:"Forbidden" };
  }

  return { ok:true, user:data.user };
}
// --- end helper ---

function escCSV(val) {
  const s = String(val ?? "");
  // wrap in quotes + escape inner quotes
  return `"${s.replace(/"/g, '""')}"`;
}

export const handler = cors(async (event) => {
  const supabase = sbAdmin();

  // auth
  const auth = await requireAdmin(supabase, event);
  if (!auth.ok) {
    return {
      statusCode: auth.statusCode,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: auth.error })
    };
  }

  // You send { search, type, resultsOnly } in body, but
  // for now we'll just dump recent results (same as adminList page=1 big pageSize)
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch {}
  const pageSize = 500; // export up to 500 most recent
  const from = 0;
  const to   = pageSize - 1;

  const { data, error } = await supabase
    .from("results")
    .select(`
      id,
      created_at,
      top3,
      answers,
      user_id,
      profile:profiles (
        user_id,
        email,
        name,
        nickname
      )
    `)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("adminExport select error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "db_error", detail: error.message })
    };
  }

  const rows = (data || []).map(r => {
    const p = r.profile || {};
    const top3Arr = r.top3 || [];
    const firstPick = top3Arr[0]
      ? `${top3Arr[0].brand || ""} ${top3Arr[0].model || ""}`.trim()
      : "";
    const top3Joined = top3Arr
      .map(c => `${c.brand || ""} ${c.model || ""}`.trim())
      .join(" | ");
    return {
      name: p.name || p.nickname || "",
      email: p.email || "",
      created_at: r.created_at || "",
      first_pick: firstPick,
      top3: top3Joined,
      type: r.user_id ? "User" : "Guest"
    };
  });

  // build CSV
  const header = [
    "name",
    "email",
    "created_at",
    "first_pick",
    "top3",
    "type"
  ];
  const csvLines = [
    header.map(escCSV).join(",")
  ];
  for (const row of rows) {
    csvLines.push([
      escCSV(row.name),
      escCSV(row.email),
      escCSV(row.created_at),
      escCSV(row.first_pick),
      escCSV(row.top3),
      escCSV(row.type)
    ].join(","));
  }
  const csv = csvLines.join("\n");

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="users.csv"'
    },
    body: csv
  };
});
