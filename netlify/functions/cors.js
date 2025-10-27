// Universal CORS wrapper for Netlify functions (ESM + CJS)
// Works with both: 
//   import cors from "./cors.js"; export const handler = cors(async (event)=>{ ... })
// and
//   const { withCors } = require("./cors"); exports.handler = withCors(async (event)=>{ ... });
//
// Features:
// - Handles preflight OPTIONS requests
// - Mirrors the request Origin when allowed (so credentials work), or falls back to *
// - Allows common headers including Authorization
// - Merges CORS headers with your function's own headers
//
// Configure allowed origins via env CORS_ALLOW_ORIGINS, comma-separated (e.g. "https://your-site.com,https://admin.your-site.com").
// If unset, any origin is allowed (mirrored).

const DEFAULT_MAX_AGE = "600";

function parseAllowedOrigins() {
  const raw = (process.env.CORS_ALLOW_ORIGINS || "").trim();
  if (!raw) return ["*"]; // permissive by default
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function buildCorsHeaders(origin, allowCreds, extraHeaders) {
  const base = {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": DEFAULT_MAX_AGE,
    "Vary": "Origin"
  };
  if (allowCreds) base["Access-Control-Allow-Credentials"] = "true";
  if (extraHeaders && typeof extraHeaders === "object") {
    for (const [k, v] of Object.entries(extraHeaders)) base[k] = v;
  }
  return base;
}

function pickOrigin(eventOrigin, allowed) {
  const o = eventOrigin || "";
  if (!allowed || allowed.length === 0) return "*";
  if (allowed.includes("*")) return o || "*";
  return allowed.includes(o) ? o : allowed[0]; // default to first allowed if mismatch
}

function normalizeHeaders(obj) {
  const out = {};
  if (!obj) return out;
  for (const [k, v] of Object.entries(obj)) out[String(k)] = String(v);
  return out;
}

function corsWrapper(handler, options = {}) {
  const allowed = Array.isArray(options.allowedOrigins) && options.allowedOrigins.length
    ? options.allowedOrigins
    : parseAllowedOrigins();

  const allowCredentials = options.credentials === true; // default false

  return async (event, context) => {
    const reqHeaders = normalizeHeaders(event && event.headers);
    const reqOrigin = reqHeaders["origin"] || reqHeaders["Origin"] || "";
    const originToUse = pickOrigin(reqOrigin, allowed);

    // Preflight
    if ((event.httpMethod || event.requestContext?.http?.method) === "OPTIONS") {
      return {
        statusCode: 204,
        headers: buildCorsHeaders(originToUse, allowCredentials, options.headers),
        body: ""
      };
    }

    // Main call
    const res = await handler(event, context);

    const resObj = res && typeof res === "object" ? res : { statusCode: 200, body: String(res ?? "") };
    resObj.headers = {
      ...(resObj.headers || {}),
      ...buildCorsHeaders(originToUse, allowCredentials, options.headers)
    };
    // Ensure body is a string
    if (typeof resObj.body !== "string") resObj.body = JSON.stringify(resObj.body ?? {});
    return resObj;
  };
}

// ===== Exports for both ESM & CJS =====
export function withCors(handler, options) { return corsWrapper(handler, options); }
export default function cors(handler, options) { return corsWrapper(handler, options); }

// CJS interop
module.exports = Object.assign(function withCorsCJS(handler, options){ return corsWrapper(handler, options); }, {
  withCors: (handler, options) => corsWrapper(handler, options),
  default: (handler, options) => corsWrapper(handler, options)
});
