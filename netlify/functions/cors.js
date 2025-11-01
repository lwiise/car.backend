

// netlify/functions/cors.js
//
// Lightweight CORS + response helpers for all Netlify functions.
// Also normalizes JSON responses so the browser (Webflow, localhost, etc.)
// can actually call these endpoints with Authorization headers.

const ALLOWED_ORIGINS = [
  "https://scopeonride.webflow.io",
  "https://carbackendd.netlify.app",
  "http://localhost:8888",
  "http://localhost:3000"
];

// tiny helper for JSON responses
export function json(statusCode, obj, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": extraHeaders["Content-Type"] || "application/json",
      ...extraHeaders
    },
    body: JSON.stringify(obj ?? {})
  };
}

// CORS wrapper
export default function cors(handler) {
  return async function (event, context) {
    const origin = event.headers?.origin || "";
    // if origin is known, reflect it back. otherwise just fall back to first allowed
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0];

    // Handle OPTIONS (preflight) without touching handler
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Headers":
            "Authorization, Content-Type, X-User-Id, X-User-Email",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        },
        body: ""
      };
    }

    // Run the real handler
    let result;
    try {
      result = await handler(event, context);
    } catch (err) {
      console.error("Function crashed:", err);
      result = {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "internal_error",
          detail: String(err)
        })
      };
    }

    // normalize handler result if they just returned plain data
    if (!result || typeof result !== "object") {
      result = {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result ?? {})
      };
    }

    const {
      statusCode = 200,
      headers = {},
      body = ""
    } = result;

    return {
      statusCode,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, X-User-Id, X-User-Email",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Vary": "Origin",
        "Content-Type": headers["Content-Type"] || "application/json",
        ...headers
      },
      body: typeof body === "string" ? body : JSON.stringify(body)
    };
  };
}

