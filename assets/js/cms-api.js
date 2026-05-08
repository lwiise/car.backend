import { getSupabase, hasSupabaseConfig } from "./supabase-browser.js";

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

export function getDeveloperSlug(row) {
  const stored = String(row?.brand_slug || "").trim();
  if (stored && !isUuidLike(stored)) return slugify(stored);
  return slugify(row?.name || "developer");
}

export function getProjectSlug(row) {
  const stored = String(row?.public_slug || "").trim();
  if (stored && !isUuidLike(stored)) return slugify(stored);
  return slugify(row?.name || "project");
}

const PROJECT_COORD_OVERRIDES = {
  at: [46.671874, 24.693714],
  "nakheel-heights": [46.671874, 24.693714],
  "palm-residences": [46.65251, 24.75628],
};

export function getProjectCoords(row) {
  if (row && row.map_lng != null && row.map_lat != null) {
    return [Number(row.map_lng), Number(row.map_lat)];
  }
  const slug = getProjectSlug(row);
  return PROJECT_COORD_OVERRIDES[slug] ? [...PROJECT_COORD_OVERRIDES[slug]] : [46.6753, 24.7136];
}

export function getProjectPopupCoords(row) {
  if (row && row.popup_lng != null && row.popup_lat != null) {
    return [Number(row.popup_lng), Number(row.popup_lat)];
  }
  return getProjectCoords(row);
}

function matchSlug(row, requestedSlug, kind) {
  const slug = String(requestedSlug || "").trim().toLowerCase();
  if (!slug || !row) return false;
  if (String(row.id || "").toLowerCase() === slug) return true;
  if (kind === "developer") {
    return getDeveloperSlug(row) === slug || slugify(row?.name || "") === slug;
  }
  return getProjectSlug(row) === slug || slugify(row?.name || "") === slug;
}

export function safeJsonParse(text, fallback = {}) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return fallback;
  }
}

export function safeJsonStringify(value) {
  return JSON.stringify(value || {}, null, 2);
}

function getClient() {
  if (!hasSupabaseConfig()) return null;
  return getSupabase();
}

export async function fetchPublishedGlobals(keys = []) {
  const client = getClient();
  if (!client) return [];

  let query = client
    .from("site_globals")
    .select("id, key, content_json, is_published, updated_at")
    .eq("is_published", true)
    .order("key", { ascending: true });

  if (Array.isArray(keys) && keys.length) {
    query = query.in("key", keys);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchPublishedPageByRoute({ slugs = [], canonicalUrl = "" } = {}) {
  const client = getClient();
  if (!client) return null;

  if (canonicalUrl) {
    const { data, error } = await client
      .from("site_pages")
      .select("id, slug, title, seo_title, seo_description, seo_keywords, og_title, og_description, og_image_url, canonical_url, is_published, updated_at")
      .eq("is_published", true)
      .eq("canonical_url", canonicalUrl)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    if (data?.[0]) return data[0];
  }

  if (!Array.isArray(slugs) || !slugs.length) return null;

  const { data, error } = await client
    .from("site_pages")
    .select("id, slug, title, seo_title, seo_description, seo_keywords, og_title, og_description, og_image_url, canonical_url, is_published, updated_at")
    .eq("is_published", true)
    .in("slug", slugs.filter(Boolean))
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

export async function fetchPageBySlug(slug, { includeDraft = false } = {}) {
  const client = getClient();
  if (!client) return null;

  let query = client
    .from("site_pages")
    .select("id, slug, title, seo_title, seo_description, seo_keywords, og_title, og_description, og_image_url, canonical_url, is_published, updated_at")
    .eq("slug", slug)
    .maybeSingle();

  if (!includeDraft) query = query.eq("is_published", true);

  const { data, error } = await query;
  if (error) throw error;
  return data || null;
}

export async function fetchSectionsByPageId(pageId, { includeDraft = false } = {}) {
  const client = getClient();
  if (!client || !pageId) return [];

  let query = client
    .from("site_sections")
    .select("id, page_id, section_key, section_type, content_json, sort_order, is_published, updated_at")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: true });

  if (!includeDraft) query = query.eq("is_published", true);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchPublishedPageBundle(slug) {
  const page = await fetchPageBySlug(slug);
  if (!page) return null;
  const sections = await fetchSectionsByPageId(page.id);
  return { page, sections };
}

export async function fetchPublishedPageBundleByRoute({ slugs = [], canonicalUrl = "" } = {}) {
  const page = await fetchPublishedPageByRoute({ slugs, canonicalUrl });
  if (!page) return null;
  const sections = await fetchSectionsByPageId(page.id);
  return { page, sections };
}

export async function fetchPublishedDevelopers() {
  const client = getClient();
  if (!client) return [];

  // Read from the developers_public view so password-protected rows return
  // only their safe columns (description / website_url / phone / email /
  // seo / og / canonical are null-ed out by the view). The full content
  // lives in the underlying table and is only retrievable via the
  // developer-unlock function.
  const { data, error } = await client
    .from("developers_public")
    .select("id, name, brand_slug, description, logo_url, website_url, phone, email, status, is_published, password_protected, seo_title, seo_description, seo_keywords, og_title, og_description, og_image_url, canonical_url, created_at, updated_at")
    .eq("is_published", true)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchPublishedProjects({ developerId = null } = {}) {
  const client = getClient();
  if (!client) return [];

  // Read from the projects_public view so password-protected rows return
  // only their safe columns (description / gallery / video / model are
  // null-ed out by the view). The full content lives in the underlying
  // table and is only retrievable via the project-unlock function.
  let query = client
    .from("projects_public")
    .select("id, developer_id, public_developer_id, public_slug, name, location, map_lat, map_lng, popup_lat, popup_lng, description, hero_image_url, gallery_images, media_360_url, media_360_inside_url, video_url, model_url, show_images, show_360, show_360_inside, show_video, show_model, status, is_published, password_protected, seo_title, seo_description, seo_keywords, og_title, og_description, og_image_url, canonical_url, created_at, updated_at")
    .eq("is_published", true)
    .not("public_developer_id", "is", null)
    .order("updated_at", { ascending: false });

  if (developerId) query = query.eq("public_developer_id", developerId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchPublishedDeveloperBundle(slug) {
  const client = getClient();
  if (!client) return null;
  const developers = await fetchPublishedDevelopers();
  const developer = developers.find((item) => matchSlug(item, slug, "developer")) || null;
  if (!developer) return null;

  // For password-protected developers, don't load the projects list — the
  // page is gated and the unlock function returns the full projects bundle
  // after the visitor authenticates.
  if (developer.password_protected) {
    return { developer, projects: [] };
  }

  const { data: projects, error: projectsError } = await client
    .from("projects_public")
    .select("id, developer_id, public_developer_id, public_slug, name, location, map_lat, map_lng, popup_lat, popup_lng, description, hero_image_url, gallery_images, media_360_url, media_360_inside_url, video_url, model_url, show_images, show_360, show_360_inside, show_video, show_model, status, is_published, password_protected, seo_title, seo_description, seo_keywords, og_title, og_description, og_image_url, canonical_url, created_at, updated_at")
    .eq("public_developer_id", developer.id)
    .eq("is_published", true)
    .order("updated_at", { ascending: false });

  if (projectsError) throw projectsError;

  return {
    developer,
    projects: projects || [],
  };
}

export async function fetchPublishedProjectBundle(slug) {
  const client = getClient();
  if (!client) return null;
  const projects = await fetchPublishedProjects();
  const project = projects.find((item) => matchSlug(item, slug, "project")) || null;
  if (!project) return null;

  const [developerRes, relatedRes] = await Promise.all([
    client
      .from("developers_public")
      .select("id, name, brand_slug, description, logo_url, website_url, phone, email, status, is_published, password_protected, seo_title, seo_description, seo_keywords, og_title, og_description, og_image_url, canonical_url, created_at, updated_at")
      .eq("id", project.public_developer_id)
      .eq("is_published", true)
      .maybeSingle(),
    client
      .from("projects_public")
      .select("id, public_developer_id, public_slug, name, location, map_lat, map_lng, popup_lat, popup_lng, description, hero_image_url, gallery_images, media_360_url, media_360_inside_url, video_url, model_url, show_images, show_360, show_360_inside, show_video, show_model, status, is_published, password_protected, created_at, updated_at")
      .eq("public_developer_id", project.public_developer_id)
      .eq("is_published", true)
      .neq("id", project.id)
      .order("updated_at", { ascending: false }),
  ]);

  if (developerRes.error) throw developerRes.error;
  if (relatedRes.error) throw relatedRes.error;

  return {
    project,
    developer: developerRes.data || null,
    relatedProjects: relatedRes.data || [],
  };
}

// Public-facing wrapper around the project-unlock Netlify function.
// Returns either:
//   { ok: true, bundle, token }            — full content (with new token if a password was supplied)
//   { ok: false, locked: true, project, error? } — locked stub for the gate UI
//   { ok: false, error: "..." }            — server / network error
export async function unlockProjectBundle(slug, { token = null, password = null } = {}) {
  if (!slug) return { ok: false, error: "Missing slug" };
  try {
    const res = await fetch("/.netlify/functions/project-unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, token, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || "Unlock service error." };
    return data;
  } catch (err) {
    return { ok: false, error: "Network error reaching unlock service." };
  }
}

// Public-facing wrapper around the developer-unlock Netlify function.
// Returns either:
//   { ok: true, bundle, token }                       — full content
//   { ok: false, locked: true, developer, error? }    — locked stub for the gate UI
//   { ok: false, error: "..." }                       — server / network error
export async function unlockDeveloperBundle(slug, { token = null, password = null } = {}) {
  if (!slug) return { ok: false, error: "Missing slug" };
  try {
    const res = await fetch("/.netlify/functions/developer-unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, token, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || "Unlock service error." };
    return data;
  } catch (err) {
    return { ok: false, error: "Network error reaching unlock service." };
  }
}
