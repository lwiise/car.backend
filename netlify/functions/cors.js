// netlify/functions/cors.js
exports.cors = (handler) => async (event, context) => {
  const origin = event.headers.origin || "";
  // Add *now* and your real domains. You can tighten later.
  const allowList = (process.env.ALLOWED_ORIGIN || "*")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const isAllowed = allowList.includes("*") || allowList.includes(origin);
  const allowOrigin = isAllowed ? origin : (allowList[0] || "*");

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
      },
      body: ""
    };
  }

  const res = await handler(event, context);
  return {
    ...res,
    headers: {
      ...(res.headers || {}),
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin",
    }
  };
};
