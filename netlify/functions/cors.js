// netlify/functions/cors.js
const ALLOWED_ORIGINS = [
  "https://scopeonride.webflow.io",
  "https://www.scopeonride.com",
  "https://scopeonride.com",
  "http://localhost:8888",
  "http://127.0.0.1:5500",
  "http://localhost:5500"
];

function corsHeaders(event) {
  const origin = event.headers.origin || event.headers.Origin || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Access-Control-Max-Age": "86400"
  };
}

function withCors(handler) {
  return async (event, context) => {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: corsHeaders(event), body: "" };
    }
    try {
      const resp = await handler(event, context);
      const statusCode = resp?.statusCode ?? 200;
      const body = typeof resp?.body === "string" ? resp.body : JSON.stringify(resp?.body ?? {});
      return { statusCode, headers: { ...(resp?.headers || {}), ...corsHeaders(event) }, body };
    } catch (e) {
      return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message || "Server error" }) };
    }
  };
}

module.exports = { withCors, corsHeaders, ALLOWED_ORIGINS };
