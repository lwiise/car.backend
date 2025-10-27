const DEFAULT_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

export default function cors(handler) {
  return async (event, context) => {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: DEFAULT_HEADERS, body: "" };
    }
    try {
      const res = await handler(event, context);
      if (!res || typeof res !== "object") {
        return { statusCode: 200, headers: DEFAULT_HEADERS, body: JSON.stringify(res ?? {}) };
      }
      const headers = { ...DEFAULT_HEADERS, ...(res.headers || {}) };
      const body = typeof res.body === "string" ? res.body : JSON.stringify(res.body ?? {});
      return { statusCode: res.statusCode ?? 200, headers, body };
    } catch (err) {
      return { statusCode: 500, headers: DEFAULT_HEADERS, body: JSON.stringify({ error: String(err && err.message || err) }) };
    }
  };
}
