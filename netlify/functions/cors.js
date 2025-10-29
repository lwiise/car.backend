// netlify/functions/cors.js
// Minimal CORS wrapper for Netlify Functions (ES modules)

export function cors(handler) {
  return async (event, context) => {
    const origin =
      process.env.ALLOWED_ORIGIN || event.headers?.origin || "*";

    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin",
    };

    // Preflight
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers: corsHeaders, body: "" };
    }

    const res = await handler(event, context);

    return {
      statusCode: res?.statusCode ?? 200,
      headers: { ...(res?.headers || {}), ...corsHeaders },
      body: res?.body ?? "",
    };
  };
}
