import { getSupabase, hasSupabaseConfig } from "./supabase-browser.js";

export function roleToDashboardPath(role) {
  const normalized = String(role || "user").toLowerCase();
  if (["admin", "broker", "developer", "user"].includes(normalized)) {
    return `/dashboard.html#${normalized}`;
  }
  return "/dashboard.html#user";
}

export async function getSession() {
  const client = getSupabase();
  if (!client) return null;

  const {
    data: { session },
  } = await client.auth.getSession();
  return session || null;
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user || null;
}

export async function getMyProfile() {
  const client = getSupabase();
  const user = await getCurrentUser();
  if (!client || !user) return null;

  const { data, error } = await client
    .from("profiles")
    .select("user_id, role, name, phone, company, website_url, description, logo_url, verification_status, suspended, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function ensureProfile() {
  const client = getSupabase();
  const user = await getCurrentUser();
  if (!client || !user) return null;

  const existing = await getMyProfile();
  if (existing) return existing;

  const payload = {
    user_id: user.id,
    role: "user",
    name: user.user_metadata?.name || user.email || "User",
    phone: user.user_metadata?.phone || null,
    company: user.user_metadata?.company || null,
    website_url: user.user_metadata?.website_url || null,
    description: user.user_metadata?.description || null,
    logo_url: user.user_metadata?.logo_url || null,
    verification_status: "approved",
  };

  const { error } = await client.from("profiles").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
  return getMyProfile();
}

export async function requireAuthOrRedirect(target = "/auth.html") {
  const session = await getSession();
  if (!session) {
    const redirect = encodeURIComponent(window.location.pathname + window.location.hash);
    window.location.href = `${target}?redirect=${redirect}`;
    return null;
  }
  return session;
}

export function assertSupabaseOrExplain(statusEl) {
  if (hasSupabaseConfig()) return true;
  if (statusEl) {
    statusEl.textContent =
      "Missing Supabase config. Set SUPABASE_URL and SUPABASE_ANON_KEY in assets/js/app-config.js.";
  }
  return false;
}
