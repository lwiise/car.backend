// netlify/functions/carImageProxy.js

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const COMMONS_MIME_OK = /^image\/(?:jpe?g|png|webp|avif)/i;
const TITLE_BLOCKLIST =
  /\b(logo|emblem|badge|icon|wordmark|interior|dashboard|engine|wheel|rim|manual|brochure|diagram|drawing)\b/i;

function fallbackSvg(brand, model) {
  const title = String(`${brand || ""} ${model || ""}`).trim() || "Car";
  const safeTitle = title.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 28);
  return `
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
  `.trim();
}

function buildQueries(brand, model) {
  const b = String(brand || "").trim();
  const m = String(model || "").trim();
  const title = `${b} ${m}`.trim();
  const out = [];

  if (title) out.push(`${title} car`);
  if (b && m) out.push(`${b} ${m} front view`);
  if (b) out.push(`${b} ${m} suv`);
  if (b) out.push(`${b} ${m} sedan`);
  if (b) out.push(`${b} ${m} hatchback`);
  out.push("car exterior");

  const seen = new Set();
  return out.filter((q) => {
    const key = String(q || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function commonsApiUrl(query) {
  const url = new URL(COMMONS_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "8");
  url.searchParams.set("gsrsearch", `${query} filetype:bitmap`);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url");
  url.searchParams.set("iiurlwidth", "1600");
  url.searchParams.set("origin", "*");
  return url.toString();
}

async function findCommonsImageUrl(query) {
  const res = await fetch(commonsApiUrl(query), {
    headers: {
      "User-Agent": "carbackendd-image-proxy/1.0"
    }
  });
  if (!res.ok) {
    throw new Error(`commons_search_${res.status}`);
  }

  const data = await res.json();
  const pages = Array.isArray(data?.query?.pages) ? data.query.pages : [];

  for (const page of pages) {
    const title = String(page?.title || "");
    if (TITLE_BLOCKLIST.test(title)) continue;

    const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
    const candidate = info?.thumburl || info?.url;
    if (!candidate) continue;
    return candidate;
  }
  return null;
}

async function downloadImage(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "carbackendd-image-proxy/1.0"
    }
  });
  if (!res.ok) {
    throw new Error(`commons_image_${res.status}`);
  }
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  if (!COMMONS_MIME_OK.test(contentType)) {
    throw new Error(`unsupported_content_type_${contentType}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, contentType };
}

export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "text/plain" },
      body: "Method Not Allowed"
    };
  }

  const qs = new URLSearchParams(event.queryStringParameters || {});
  const brand = String(qs.get("brand") || "").trim();
  const model = String(qs.get("model") || "").trim();

  try {
    const queries = buildQueries(brand, model);
    let remoteUrl = null;

    for (const q of queries) {
      try {
        remoteUrl = await findCommonsImageUrl(q);
      } catch (err) {
        console.warn("[carImageProxy] commons lookup failed:", err?.message || err);
      }
      if (remoteUrl) break;
    }

    if (!remoteUrl) {
      throw new Error("commons_no_match");
    }

    const { buf, contentType } = await downloadImage(remoteUrl);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400"
      },
      body: buf.toString("base64"),
      isBase64Encoded: true
    };
  } catch (err) {
    console.warn("[carImageProxy] fallback svg:", err?.message || err);
    const svg = fallbackSvg(brand, model);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600"
      },
      body: svg
    };
  }
};
