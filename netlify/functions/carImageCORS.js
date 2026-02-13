// netlify/functions/carImageCORS.js
import {
  getAdminClient,
  parseJSON,
  jsonResponse,
  preflightResponse,
  resolveOrigin
} from "./_supabaseAdmin.js";

const BUCKET = process.env.CAR_IMAGE_BUCKET || "car-images";
const THEME_VERSION = process.env.CAR_IMAGE_THEME || "v1";
const IMAGE_FORMAT = process.env.OPENAI_IMAGE_FORMAT || "png";
const POLL_AFTER_MS = 4000;
const SYNC_GENERATE_TIMEOUT_MS = Number(process.env.CAR_IMAGE_SYNC_TIMEOUT_MS || 15000);

function slugify(val) {
  return String(val || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

function isTruthy(value) {
  const v = String(value || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

async function ensureBucket(supa) {
  const { error } = await supa.storage.createBucket(BUCKET, {
    public: true
  });
  if (error && !/already exists/i.test(error.message || "")) {
    throw error;
  }
}

async function fileExists(supa, filePath) {
  const parts = filePath.split("/");
  const file = parts.pop();
  const folder = parts.join("/");
  const { data, error } = await supa.storage
    .from(BUCKET)
    .list(folder, { limit: 1, search: file });

  if (error) {
    if (/not found/i.test(error.message || "")) {
      await ensureBucket(supa);
      const retry = await supa.storage
        .from(BUCKET)
        .list(folder, { limit: 1, search: file });
      if (retry.error) throw retry.error;
      return (retry.data || []).length > 0;
    }
    throw error;
  }

  return (data || []).length > 0;
}

function publicUrl(supa, filePath) {
  return supa.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl;
}

function resolveSiteOrigin() {
  return (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.SITE_URL ||
    "https://carbackendd.netlify.app"
  );
}

function pendingPayload() {
  return {
    status: "pending",
    cached: false,
    poll_after_ms: POLL_AFTER_MS
  };
}

function errorPayload(errorCode) {
  return {
    status: "error",
    error: String(errorCode || "generate_failed"),
    poll_after_ms: POLL_AFTER_MS
  };
}

async function triggerBackground(brand, model, force) {
  try {
    const qs = new URLSearchParams({
      brand: String(brand || ""),
      model: String(model || ""),
      ...(force ? { force: "1" } : {})
    });
    const origin = resolveSiteOrigin();
    const url = `${origin}/.netlify/functions/carImageGenerate-background?${qs.toString()}`;
    await fetch(url, { method: "GET" });
  } catch (err) {
    console.warn("[carImageCORS] background trigger failed:", err?.message || err);
  }
}

async function triggerSyncGenerate(brand, model, force) {
  const qs = new URLSearchParams({
    brand: String(brand || ""),
    model: String(model || ""),
    ...(force ? { force: "1" } : {})
  });
  const origin = String(resolveSiteOrigin() || "").replace(/\/+$/, "");
  const url = `${origin}/.netlify/functions/carImageGenerate?${qs.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_GENERATE_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}

    if (res.ok && (data?.url || data?.data_url)) {
      return {
        status: "ready",
        url: data?.url || data?.data_url,
        cached: Boolean(data?.cached)
      };
    }
    if (!res.ok) {
      return { status: "error", error: data?.error || `generate_http_${res.status}` };
    }
    return { status: "pending" };
  } catch (err) {
    if (err?.name === "AbortError") {
      return { status: "pending" };
    }
    return { status: "error", error: "generate_fetch_failed" };
  } finally {
    clearTimeout(timeout);
  }
}

export const handler = async (event) => {
  let brand = "";
  let model = "";
  try {
    if (event.httpMethod === "OPTIONS") {
      return preflightResponse(event);
    }

    if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
      return jsonResponse(405, { error: "method_not_allowed" }, event);
    }

    let force = false;
    let trigger = false;
    let mode = "";
    if (event.httpMethod === "GET") {
      const qs = new URLSearchParams(event.queryStringParameters || {});
      brand = String(qs.get("brand") || "").trim();
      model = String(qs.get("model") || "").trim();
      force = isTruthy(qs.get("force"));
      trigger = isTruthy(qs.get("trigger"));
      mode = String(qs.get("mode") || "").trim().toLowerCase();
    } else {
      const body = parseJSON(event.body || "{}");
      brand = String(body.brand || "").trim();
      model = String(body.model || "").trim();
      force = isTruthy(body.force);
      trigger = isTruthy(body.trigger);
      mode = String(body.mode || "").trim().toLowerCase();
    }

    if (!brand && !model) {
      return jsonResponse(400, { error: "missing_car_name" }, event);
    }

    const slug = slugify(`${brand} ${model}`);
    if (!slug) {
      return jsonResponse(400, { error: "invalid_car_name" }, event);
    }

    let supa = null;
    try {
      supa = getAdminClient();
    } catch (err) {
      console.error("[carImageCORS] getAdminClient failed:", err);
    }

    const filePath = `${THEME_VERSION}/${slug}.${IMAGE_FORMAT}`;
    let exists = false;
    let url = "";
    if (supa) {
      try {
        exists = await fileExists(supa, filePath);
        if (exists && !force) {
          url = publicUrl(supa, filePath);
        }
      } catch (err) {
        console.error("[carImageCORS] storage check failed:", err);
      }
    }

    if (mode === "status") {
      if (exists && !force && url) {
        return jsonResponse(200, { status: "ready", url, cached: true }, event);
      }

      if (trigger) {
        const sync = await triggerSyncGenerate(brand, model, force);
        if (sync.status === "ready" && sync.url) {
          return jsonResponse(200, { status: "ready", url: sync.url, cached: Boolean(sync.cached) }, event);
        }
        if (sync.status === "error") {
          return jsonResponse(200, errorPayload(sync.error), event);
        }
        triggerBackground(brand, model, force);
      }

      return jsonResponse(200, pendingPayload(), event);
    }

    if (exists && !force && url) {
      if (event.httpMethod === "GET") {
        return {
          statusCode: 302,
          headers: {
            Location: url,
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": resolveOrigin(event) || "*",
            "Access-Control-Allow-Headers":
              "Content-Type, Authorization, X-User-Id, X-User-Email, X-Admin-Email",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
          }
        };
      }
      return jsonResponse(200, { url, cached: true }, event);
    }

    if (event.httpMethod === "GET") {
      triggerBackground(brand, model, force);
    } else if (trigger) {
      triggerBackground(brand, model, force);
    }

    return jsonResponse(202, pendingPayload(), event);
  } catch (err) {
    console.error("[carImageCORS] handler crash:", err);
    return jsonResponse(202, pendingPayload(), event);
  }
};
