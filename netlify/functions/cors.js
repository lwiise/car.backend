// netlify/functions/cors.js
const ALLOW_ORIGINS = [
  "https://scopeonride.webflow.io",     // Webflow preview
  "https://www.scopeonride.com",        // your prod domain (edit if different)
  "http://localhost:8888",              // Netlify dev / local
];

function pickOrigin(origin) {
  if (!origin) return ALLOW_ORIGINS[0];
  return ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
}

export function cors(handler) {
  return async (event, context) => {
    const origin = pickOrigin(event.headers?.origin || event.headers?.Origin);

    // Preflight
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,              // IMPORTANT: must be 200/204
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
          "Access-Control-Allow-Headers":
            "authorization, content-type, x-requested-with, apikey, sb-session",
          "Access-Control-Allow-Credentials": "true",
          Vary: "Origin",
        },
        body: "",
      };
    }

    try {
      const res = await handler(event, context);

      // Always add CORS on normal responses too
      const headers = {
        ...(res?.headers || {}),
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        Vary: "Origin",
      };

      return { ...(res || {}), headers };
    } catch (err) {
      return {
        statusCode: 500,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          Vary: "Origin",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: err?.message || String(err) }),
      };
    }
  };
}
