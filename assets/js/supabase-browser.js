function readConfig() {
  return window.ATS_ENV || {};
}

export function hasSupabaseConfig() {
  const cfg = readConfig();
  return Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
}

let cachedClient = null;
export const MEDIA_BUCKET = "ats-media";

export function getSupabase() {
  if (cachedClient) return cachedClient;
  if (!window.supabase || typeof window.supabase.createClient !== "function") return null;

  const cfg = readConfig();
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return null;

  cachedClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });

  return cachedClient;
}

export function getFunctionBase() {
  const cfg = readConfig();
  return cfg.FUNCTION_BASE || "/.netlify/functions";
}

function sanitizeSegment(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";
}

export async function uploadMediaFile(file, folder = "uploads") {
  const client = getSupabase();
  if (!client) throw new Error("Supabase client is not available.");
  if (!(file instanceof File)) throw new Error("A file upload is required.");

  const extension = file.name.includes(".") ? file.name.split(".").pop() : "";
  const folderName = sanitizeSegment(folder);
  const baseName = sanitizeSegment(file.name.replace(/\.[^.]+$/, ""));
  const objectPath = `${folderName}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${baseName}${extension ? `.${sanitizeSegment(extension)}` : ""}`;

  const { error } = await client.storage.from(MEDIA_BUCKET).upload(objectPath, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  const { data } = client.storage.from(MEDIA_BUCKET).getPublicUrl(objectPath);
  return data?.publicUrl || null;
}

export async function callFunction(path, payload, accessToken) {
  const response = await fetch(`${getFunctionBase()}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(payload || {}),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage = data.error || `Function ${path} failed`;
    throw new Error(errorMessage);
  }
  return data;
}
