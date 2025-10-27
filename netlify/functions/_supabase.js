import { createClient } from "@supabase/supabase-js";

export function sbAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE env.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function json(data, statusCode = 200, headers = {}) {
  return { statusCode, headers, body: data };
}

export function parseBody(event) {
  const raw = event.body || "";
  const ct = (event.headers?.["content-type"] || event.headers?.["Content-Type"] || "").toLowerCase();
  try {
    if (raw && (ct.includes("application/json"))) {
      return JSON.parse(raw);
    }
    return raw ? JSON.parse(raw) : {};
  } catch {
    try {
      const b = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
      return b ? JSON.parse(b) : {};
    } catch {
      return {};
    }
  }
}

export async function getUserFromToken(token) {
  if (!token) return null;
  const supabase = sbAdmin();
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) return null;
    return data?.user || null;
  } catch {
    return null;
  }
}
