// netlify/functions/adminUsersStats.js
const { createClient } = require("@supabase/supabase-js");

const CORS = {
  "Access-Control-Allow-Origin": "https://scopeonride.webflow.io", // <- use "*" while testing if needed
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-admin-email, X-Admin-Email",
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  const headers = { ...CORS, "content-type": "application/json" };
  try {
    const qs = event.queryStringParameters || {};
    const range = (qs.range || "day").toLowerCase(); // day|week|month
    const days = Number(qs.days || 30);              // how far back to count buckets
    const now = new Date();

    if (!["day", "week", "month"].includes(range)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "range must be day|week|month" }) };
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // Fast total count
    const { count: totalCount, error: totalErr } = await sb
      .from("profiles")
      .select("*", { head: true, count: "exact" });
    if (totalErr) throw totalErr;

    // If days <= 0, just return total
    if (!days || days <= 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ total: totalCount, range, days, buckets: [] }),
      };
    }

    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Count window total for pagination planning
    const { count: windowCount, error: wErr } = await sb
      .from("profiles")
      .select("created_at", { head: true, count: "exact" })
      .gte("created_at", since.toISOString());
    if (wErr) throw wErr;

    // Page through created_at only and bucket in JS
    const pageSize = 2000;
    const pages = Math.ceil((windowCount || 0) / pageSize);
    const buckets = new Map();

    const keyFor = (d) => {
      const dt = new Date(d);
      if (range === "day") {
        return dt.toISOString().slice(0, 10); // YYYY-MM-DD
      }
      if (range === "week") {
        // ISO week start (Monday)
        const temp = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
        const day = temp.getUTCDay() || 7; // 1..7 (Mon..Sun)
        temp.setUTCDate(temp.getUTCDate() - (day - 1));
        return temp.toISOString().slice(0, 10); // week-start date
      }
      // month
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`; // YYYY-MM
    };

    for (let p = 0; p < pages; p++) {
      const from = p * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await sb
        .from("profiles")
        .select("created_at")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;

      (data || []).forEach((row) => {
        const k = keyFor(row.created_at);
        buckets.set(k, (buckets.get(k) || 0) + 1);
      });
    }

    // Sort keys ascending
    const ordered = Array.from(buckets.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, count]) => ({ key, count }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        total: totalCount,
        range,
        days,
        start: since.toISOString(),
        end: now.toISOString(),
        buckets: ordered,
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e?.message || e) }) };
  }
};
