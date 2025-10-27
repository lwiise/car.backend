// Simple, safe CORS wrapper for Netlify functions (ESM)
const ALLOW_LIST = [
  "https://scopeonride.webflow.io",
  "https://www.scopeonride.webflow.io",
  "http://localhost:8888",   // Netlify dev
  "http://localhost:4173",   // Vite dev (optional)
];

function pickOrigin(origin = "") {
  return ALLOW_LIST.includes(origin) ? origin : ALLOW_LIST[0] || "*";
}

export default function cors(handler) {
  return async (event, context) => {
    const origin = pickOrigin(event.headers?.origin);

    // Preflight
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        },
        body: "",
      };
    }

    // Actual request
    const res = await handler(event, context);
    return {
      ...res,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
        Vary: "Origin",
        ...(res.headers || {}),
      },
    };
  };
}
