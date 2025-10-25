// netlify/functions/cors.js
// Add your real domains here
const ALLOWED_ORIGINS = [
  "https://scopeonride.webflow.io",
  "https://carbackendd.netlify.app",
  "http://localhost:8888",
  "http://localhost:3000",
];

function getOrigin(event) {
  const o = event.headers?.origin || event.headers?.Origin || "";
  return ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0];
}

function baseHeaders(event) {
  const origin = getOrigin(event);
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Credentials": "false",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Email, x-admin-email",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function withCors(handler) {
  return async (event, context) => {
    // Preflight
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: baseHeaders(event), body: "" };
    }
    const res = await handler(event, context);
    return { ...res, headers: { ...(res.headers || {}), ...baseHeaders(event) } };
  };
}

module.exports = { withCors };
