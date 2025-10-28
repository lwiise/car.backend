// netlify/functions/cors.js
// CommonJS: require("./cors") returns the wrapper function.

module.exports = function cors(fn) {
  const chooseOrigin = (reqOrigin) => reqOrigin || "*";

  return async (event, context) => {
    const reqOrigin = event.headers?.origin || event.headers?.Origin || "";
    const origin = chooseOrigin(reqOrigin);

    // Preflight
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Headers": "authorization, content-type",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          Vary: "Origin",
        },
        body: "",
      };
    }

    try {
      const res = await fn(event, context);
      const headers = Object.assign({}, res?.headers || {}, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        Vary: "Origin",
      });
      return { ...res, headers };
    } catch (err) {
      console.error("[CORS] handler error:", err);
      return {
        statusCode: 500,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          Vary: "Origin",
        },
        body: JSON.stringify({ error: "Internal error" }),
      };
    }
  };
};
