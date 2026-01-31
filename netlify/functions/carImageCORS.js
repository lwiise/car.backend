// netlify/functions/carImageCORS.js
import OpenAI from "openai";
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

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(event);
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" }, event);
  }

  const body = parseJSON(event.body || "{}");
  const brand = String(body.brand || "").trim();
  const model = String(body.model || "").trim();
  const force = Boolean(body.force);

  if (!brand && !model) {
    return jsonResponse(400, { known: false, error: "missing_car_name" }, event);
  }

  const slug = slugify(`${brand} ${model}`);
  if (!slug) {
    return jsonResponse(400, { error: "invalid_car_name" }, event);
  }

  const supa = getAdminClient();
  const filePath = `${THEME_VERSION}/${slug}.${IMAGE_FORMAT}`;

  try {
    const exists = await fileExists(supa, filePath);
    if (exists && !force) {
      return jsonResponse(200, { url: publicUrl(supa, filePath), cached: true }, event);
    }
  } catch (err) {
    console.error("[carImageCORS] storage check failed:", err);
    return jsonResponse(500, { error: "storage_check_failed" }, event);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { error: "missing_openai_key" }, event);
  }

  let buffer;
  try {
    const client = new OpenAI({ apiKey });
    const prompt = buildPrompt(brand, model);

    const result = await client.images.generate({
      model: IMAGE_MODEL,
      prompt,
      size: IMAGE_SIZE,
      quality: IMAGE_QUALITY,
      output_format: IMAGE_FORMAT
    });

    const img = result?.data?.[0];
    if (img?.b64_json) {
      buffer = Buffer.from(img.b64_json, "base64");
    } else if (img?.url) {
      const res = await fetch(img.url);
      const arr = await res.arrayBuffer();
      buffer = Buffer.from(arr);
    } else {
      throw new Error("image_response_empty");
    }
  } catch (err) {
    console.error("[carImageCORS] OpenAI error:", err);
    return jsonResponse(500, { error: "image_generation_failed" }, event);
  }

  try {
    await ensureBucket(supa);
    const { error: upErr } = await supa.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: `image/${IMAGE_FORMAT}`,
        upsert: true,
        cacheControl: "31536000"
      });
    if (upErr) throw upErr;
  } catch (err) {
    console.error("[carImageCORS] storage upload failed:", err);
    return jsonResponse(500, { error: "storage_upload_failed" }, event);
  }

  return jsonResponse(200, { url: publicUrl(supa, filePath), cached: false }, event);
};
