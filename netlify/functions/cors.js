// netlify/functions/cors.js
const ALLOWED_ORIGINS = [
  "https://scopeonride.webflow.io",
  "https://carbackendd.netlify.app",
  "http://localhost:8888",
  "http://localhost:3000"
];

// tiny helper to build Netlify-style responses with headers
function response(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*", // we will also handle stricter allow below
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-User-Id, X-User-Email",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    },
    body: JSON.stringify(bodyObj ?? {})
  };
}

// MAIN WRAPPER
export default function cors(handler) {
  return async function(event, context) {
    const origin = event.headers?.origin || "";
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "*";

    // Handle OPTIONS preflight right here
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": allowed,
          "Access-Control-Allow-Headers": "Authorization, Content-Type, X-User-Id, X-User-Email",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Max-Age": "86400"
        },
        body: ""
      };
    }

    // Run actual handler
    let result;
    try {
      result = await handler(event, context);
    } catch (err) {
      console.error("Function exploded:", err);
      return {
        statusCode: 500,
        headers: {
          "Access-Control-Allow-Origin": allowed,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ error: "internal_error", detail: "" + err })
      };
    }

    // normalize handler return
    if (!result || typeof result !== "object") {
      result = { statusCode: 200, body: result ?? "" };
    }
    const {
      statusCode = 200,
      headers = {},
      body = ""
    } = result;

    return {
      statusCode,
      headers: {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-User-Id, X-User-Email",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Content-Type": headers["Content-Type"] || "application/json",
        ...headers
      },
      body: typeof body === "string" ? body : JSON.stringify(body)
    };
  };
}

// also export a helper so you can early-return with JSON easily
export function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(obj ?? {})
  };
}

export { response };
