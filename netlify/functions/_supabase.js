import { createClient } from "@supabase/supabase-js";

export function supabaseAdmin(accessToken) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE;

  const supabase = createClient(supabaseUrl, serviceKey, {
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
    auth: { persistSession: false }
  });
  return supabase;
}

export function getAccessToken(event) {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const [, token] = auth.split(" ");
  return token || null;
}

