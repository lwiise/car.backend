// netlify/functions/authUtils.js

// Supabase sends us a JWT in Authorization: Bearer <token>
// The user's id is the "sub" claim inside that JWT.
// We don't need to fully verify the signature to just read "sub".

export function getUserIdFromAuthHeader(headers = {}) {
  const authHeader = headers.authorization || headers.Authorization || "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1];

  // decode JWT body without verifying
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson);
    return payload.sub || null;
  } catch {
    return null;
  }
}

// Node on Netlify doesn’t have atob by default in all runtimes.
// So add our own if missing:
function atob(str) {
  return Buffer.from(str, "base64").toString("binary");
}
