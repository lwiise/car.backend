// netlify/functions/cors.js

// Domains that are allowed to call these functions from the browser
const ALLOWED_ORIGINS = [
  "https://scopeonride.webflow.io",
  "https://carbackendd.netlify.app",
  "http://localhost:8888",
  "http://localhost:3000",
];

// Small helper to wrap a handler with CORS + error safety
function cors(handler) {
  return async function (event, context) {
    const origin =
      event.headers?.origin ||
      event.headers?.Origin ||
      "";
    // if it's in the list, echo it back. Otherwise '*'
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
      ? origin
      : "*";

    // --- 1) Handle CORS preflight (OPTIONS) immediately ---
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Headers":
            "Authorization, Content-Type, X-User-Id, X-User-Email",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Max-Age": "86400",
          "Content-Type": "application/json",
        },
        body: "",
      };
    }

    // --- 2) Run the real handler safely ---
    try {
      const result = await handler(event, context) || {};

      const statusCode = result.statusCode || 200;
      const body =
        typeof result.body === "string"
          ? result.body
          : JSON.stringify(result.body ?? {});

      // merge headers from handler + our CORS headers
      const baseHeaders = result.headers || {};
      const headers = {
        ...baseHeaders,
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, X-User-Id, X-User-Email",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      };

      // default content-type if handler didn't set one
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }

      return { statusCode, headers, body };
    } catch (err) {
      console.error("Function crashed:", err);
      return {
        statusCode: 500,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Headers":
            "Authorization, Content-Type, X-User-Id, X-User-Email",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          error: "internal_error",
          detail: String(err && err.message ? err.message : err),
        }),
      };
    }
  };
}

// convenience helper if you like returning json() inside handlers
function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(obj ?? {}),
  };
}

module.exports = { cors, json };
