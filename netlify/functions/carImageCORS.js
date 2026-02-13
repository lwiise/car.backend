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
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const IMAGE_SIZE = process.env.OPENAI_IMAGE_SIZE || "1536x1024";
const IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY || "high";
const IMAGE_FORMAT = process.env.OPENAI_IMAGE_FORMAT || "png";

function slugify(val) {
  return String(val || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

function buildPrompt(brand, model) {
  const title = `${brand || ""} ${model || ""}`.trim() || "car";
  return [
    `Photorealistic studio photo of a ${title}, 3/4 front view.`,
    "Dark studio, soft rim-light, subtle teal highlights, clean background.",
    "Realistic reflections, high detail.",
    "No people, no text, no watermark, no logos."
  ].join(" ");
}

function fallbackSvg(brand, model) {
  const title = String(`${brand || ""} ${model || ""}`).trim() || "Car";
  const safeTitle = title.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 28);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#8ea5b6" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#04080c" stop-opacity="0.85"/>
        </linearGradient>
        <radialGradient id="g2" cx="0.2" cy="0.0" r="0.9">
          <stop offset="0%" stop-color="#8ea5b6" stop-opacity="0.35"/>
          <stop offset="70%" stop-color="#030608" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#030608" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#g1)"/>
      <rect width="1200" height="800" fill="url(#g2)"/>
      <rect x="40" y="40" width="1120" height="720" rx="28" ry="28" fill="#030608" fill-opacity="0.35" stroke="#ffffff" stroke-opacity="0.12"/>
      <text x="80" y="380" fill="#ffffff" fill-opacity="0.92" font-size="56" font-family="Montserrat, Arial, sans-serif" font-weight="700">${safeTitle}</text>
      <text x="80" y="440" fill="#ffffff" fill-opacity="0.65" font-size="24" font-family="Montserrat, Arial, sans-serif">Recommended match</text>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function respondWithFallback(event, brand, model) {
  const origin = resolveOrigin(event) || "*";
  const hasCarName = Boolean(String(brand || "").trim() || String(model || "").trim());

  if (hasCarName) {
    const url = proxyUrl(brand, model);
    if (event.httpMethod === "GET") {
      return {
        statusCode: 302,
        headers: {
          Location: url,
          "Cache-Control": "public, max-age=1800",
          "Access-Control-Allow-Origin": origin
        }
      };
    }
    return jsonResponse(200, { url, cached: false, fallback: true }, event);
  }

  const dataUrl = fallbackSvg(brand, model);
  if (event.httpMethod === "GET") {
    const svg = decodeURIComponent(dataUrl.split(",")[1] || "");
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": origin
      },
      body: svg
    };
  }
  return jsonResponse(200, { data_url: dataUrl, cached: false, fallback: true }, event);
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

function proxyUrl(brand, model) {
  const qs = new URLSearchParams({
    brand: String(brand || ""),
    model: String(model || "")
  });
  const origin = String(resolveSiteOrigin() || "").replace(/\/+$/, "");
  return `${origin}/.netlify/functions/carImageProxy?${qs.toString()}`;
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
    if (event.httpMethod === "GET") {
      const qs = new URLSearchParams(event.queryStringParameters || {});
      brand = String(qs.get("brand") || "").trim();
      model = String(qs.get("model") || "").trim();
      force = Boolean(qs.get("force"));
    } else {
      const body = parseJSON(event.body || "{}");
      brand = String(body.brand || "").trim();
      model = String(body.model || "").trim();
      force = Boolean(body.force);
    }

    if (!brand && !model) {
      return respondWithFallback(event, brand, model);
    }

    const slug = slugify(`${brand} ${model}`);
    if (!slug) {
      return respondWithFallback(event, brand, model);
    }

    if (event.httpMethod === "GET") {
      triggerBackground(brand, model, force);
    }

    let supa = null;
    try {
      supa = getAdminClient();
  } catch (err) {
    console.error("[carImageCORS] getAdminClient failed:", err);
  }
  const filePath = `${THEME_VERSION}/${slug}.${IMAGE_FORMAT}`;

  let storageOk = Boolean(supa);
  if (supa) {
    try {
      const exists = await fileExists(supa, filePath);
      if (exists && !force) {
        const url = publicUrl(supa, filePath);
        if (event.httpMethod === "GET") {
          return {
            statusCode: 302,
            headers: {
              Location: url,
              "Cache-Control": "public, max-age=86400",
              "Access-Control-Allow-Origin": resolveOrigin(event) || "*"
            }
          };
        }
        return jsonResponse(200, { url, cached: true }, event);
      }
    } catch (err) {
      storageOk = false;
      console.error("[carImageCORS] storage check failed:", err);
    }
  }

    return respondWithFallback(event, brand, model);
  } catch (err) {
    console.error("[carImageCORS] handler crash:", err);
    return respondWithFallback(event, brand, model);
  }
};
