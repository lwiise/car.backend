// netlify/functions/cors.js
// Update the list to match your real domains.
const ALLOWED_ORIGINS = [
  'https://scopeonride.webflow.io', // your Webflow site
  'http://localhost:8888',          // Netlify dev
  'http://localhost:5173'           // Vite etc. (optional)
];

function getOrigin(event) {
  const o = event.headers?.origin || event.headers?.Origin;
  return ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0];
}

function baseHeaders(event) {
  const origin = getOrigin(event);
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Credentials': 'false',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

function withCors(handler) {
  return async (event, context) => {
    // Handle preflight so the browser sees an HTTP OK on OPTIONS
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: baseHeaders(event) };
    }
    // Call your real handler, then merge CORS headers
    const res = await handler(event, context);
    return {
      ...res,
      headers: { ...(res?.headers || {}), ...baseHeaders(event) },
    };
  };
}

module.exports = { withCors };
// If your functions are ESM, use:
// export { withCors };
