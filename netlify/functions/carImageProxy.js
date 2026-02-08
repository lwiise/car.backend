// netlify/functions/carImageProxy.js

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
  const query = `${brand} ${model} car`.trim() || "car";

  const url = `https://source.unsplash.com/featured/?${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`upstream_${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/jpeg";
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
