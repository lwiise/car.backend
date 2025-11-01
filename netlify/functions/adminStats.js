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


// netlify/functions/adminStats.js
import cors, { json } from "./cors.js";
import { sbAdmin } from "./_supabase.js"; // service-role Supabase client

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

export const handler = cors(async (event) => {
  const supabase = sbAdmin();

  // auth gate
  const auth = await requireAdmin(supabase, event);
  if (!auth.ok) {
    return json(auth.statusCode, { error: auth.error });
  }

  // frontend sends { lastDays, type }, but dashboard only uses total + new
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch {}
  const lastDays = Number(body.lastDays || 7);

  const sinceISO = new Date(Date.now() - lastDays*24*60*60*1000).toISOString();

  // total registered profiles
  const allProfiles = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

  // new profiles in last X days
  const newProfiles = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .gte("created_at", sinceISO);

  const totalCount = allProfiles.count || 0;
  const newCount   = newProfiles.count || 0;

  // match what the frontend expects in loadStats():
  // $("#ad-total").textContent = data.total
  // $("#ad-new").textContent   = data.new
  return json(200, {
    total: totalCount,
    new: newCount
  });
});
