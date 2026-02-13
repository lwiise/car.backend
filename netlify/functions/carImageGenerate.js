// netlify/functions/carImageGenerate.js
import {
  getAdminClient,
  parseJSON,
  jsonResponse,
  preflightResponse
} from "./_supabaseAdmin.js";

const BUCKET = process.env.CAR_IMAGE_BUCKET || "car-images";
const THEME_VERSION = process.env.CAR_IMAGE_THEME || "v1";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const IMAGE_SIZE = process.env.OPENAI_IMAGE_SIZE || "1536x1024";
const IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY || "high";
const IMAGE_FORMAT = process.env.OPENAI_IMAGE_FORMAT || "png";
const TRANSIENT_IMAGE_SIZE = process.env.OPENAI_TRANSIENT_IMAGE_SIZE || "1024x1024";
const TRANSIENT_IMAGE_QUALITY = process.env.OPENAI_TRANSIENT_IMAGE_QUALITY || "medium";
const TRANSIENT_IMAGE_FORMAT = process.env.OPENAI_TRANSIENT_IMAGE_FORMAT || "webp";
const STUDIO_STYLE_PROMPT = [
  "Photorealistic automotive studio photography.",
  "3/4 front view composition, centered subject.",
  "Dark studio backdrop with subtle teal rim lighting.",
  "Soft controlled key light, realistic reflections, high detail.",
  "Clean background with no distractions.",
  "No people, no text, no logos, no watermark."
].join(" ");

function isTruthy(value) {
  const v = String(value || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function slugify(val) {
  return String(val || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

function buildPrompt(brand, model) {
  const title = `${brand || ""} ${model || ""}`.trim() || "car";
  return `${STUDIO_STYLE_PROMPT} Vehicle: ${title}.`;
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

function makeDataUrl(contentType, buffer) {
  const ct = String(contentType || "image/png");
  return `data:${ct};base64,${buffer.toString("base64")}`;
}

export const handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return preflightResponse(event);
    }

    if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
      return jsonResponse(405, { error: "method_not_allowed" }, event);
    }

    let brand = "";
    let model = "";
    let force = false;
    if (event.httpMethod === "GET") {
      const qs = new URLSearchParams(event.queryStringParameters || {});
      brand = String(qs.get("brand") || "").trim();
      model = String(qs.get("model") || "").trim();
      force = isTruthy(qs.get("force"));
    } else {
      const body = parseJSON(event.body || "{}");
      brand = String(body.brand || "").trim();
      model = String(body.model || "").trim();
      force = isTruthy(body.force);
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
      console.error("[carImageGenerate] getAdminClient failed:", err?.message || err);
    }

    const filePath = `${THEME_VERSION}/${slug}.${IMAGE_FORMAT}`;

    if (supa) {
      const exists = await fileExists(supa, filePath);
      if (exists && !force) {
        return jsonResponse(200, { url: publicUrl(supa, filePath), cached: true }, event);
      }
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonResponse(500, { error: "missing_openai_key" }, event);
    }

    let OpenAI;
    try {
      ({ default: OpenAI } = await import("openai"));
    } catch (err) {
      console.error("[carImageGenerate] OpenAI import failed:", err);
      return jsonResponse(500, { error: "openai_import_failed" }, event);
    }

    const client = new OpenAI({ apiKey });
    const prompt = buildPrompt(brand, model);
    const useTransientDelivery = !supa;
    const outputFormat = useTransientDelivery ? TRANSIENT_IMAGE_FORMAT : IMAGE_FORMAT;
    const size = useTransientDelivery ? TRANSIENT_IMAGE_SIZE : IMAGE_SIZE;
    const quality = useTransientDelivery ? TRANSIENT_IMAGE_QUALITY : IMAGE_QUALITY;

    const result = await client.images.generate({
      model: IMAGE_MODEL,
      prompt,
      size,
      quality,
      output_format: outputFormat
    });

    const img = result?.data?.[0];
    if (useTransientDelivery && img?.url) {
      return jsonResponse(200, {
        url: img.url,
        cached: false,
        transient: true
      }, event);
    }

    let buffer;
    let contentType = `image/${outputFormat}`;
    if (img?.b64_json) {
      buffer = Buffer.from(img.b64_json, "base64");
    } else if (img?.url) {
      const res = await fetch(img.url);
      if (!res.ok) {
        return jsonResponse(500, { error: `image_download_failed_${res.status}` }, event);
      }
      contentType = res.headers.get("content-type") || contentType;
      const arr = await res.arrayBuffer();
      buffer = Buffer.from(arr);
    } else {
      return jsonResponse(500, { error: "image_response_empty" }, event);
    }

    if (!supa) {
      return jsonResponse(200, {
        url: makeDataUrl(contentType, buffer),
        cached: false,
        transient: true
      }, event);
    }

    await ensureBucket(supa);
    const { error: upErr } = await supa.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType,
        upsert: true,
        cacheControl: "31536000"
      });
    if (upErr) {
      return jsonResponse(200, {
        url: makeDataUrl(contentType, buffer),
        cached: false,
        transient: true,
        warning: "storage_upload_failed"
      }, event);
    }

    return jsonResponse(200, {
      url: publicUrl(supa, filePath),
      cached: false
    }, event);
  } catch (err) {
    console.error("[carImageGenerate] handler crash:", err);
    return jsonResponse(500, {
      error: "internal_error",
      detail: err?.message || String(err)
    }, event);
  }
};
