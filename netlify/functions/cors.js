// netlify/functions/cors.js

const ALLOWED_ORIGINS = [
  "https://scopeonride.webflow.io",
  "https://carbackendd.netlify.app",
  "http://localhost:8888",
  "http://localhost:3000"
];

// helper to normalize function return -> Netlify response
function normalizeResult(result) {
  if (!result || typeof result !== "object") {
    return { statusCode: 200, body: result ?? "" };
  }
  return result;
}

// MAIN WRAPPER
export default function cors(handler) {
  return async function(event, context) {
    const origin = event.headers?.origin || "";
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "*";

    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": allowed,
          "Access-Control-Allow-Headers":
            "Authorization, Content-Type, X-User-Id, X-User-Email",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Max-Age": "86400"
        },
        body: ""
      };
    }

    // run actual logic
    let result;
    try {
      result = await handler(event, context);
    } catch (err) {
      console.error("[cors] handler crashed:", err);
      return {
        statusCode: 500,
        headers: {
          "Access-Control-Allow-Origin": allowed,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: "internal_error",
          detail: String(err)
        })
      };
    }

    // attach CORS headers no matter what
    const { statusCode = 200, headers = {}, body = "" } =
      normalizeResult(result);

    return {
      statusCode,
      headers: {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, X-User-Id, X-User-Email",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Content-Type":
          headers["Content-Type"] || "application/json",
        ...headers
      },
      body:
        typeof body === "string"
          ? body
          : JSON.stringify(body ?? {})
    };
  };
}

// sugar: easy JSON response from inside handlers
export function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj ?? {})
  };
}
