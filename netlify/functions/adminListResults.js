// netlify/functions/adminListResults.js
const { getAdminClient } = require("./_supabase");

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type",
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "content-type",
          "Access-Control-Allow-Methods": "GET,OPTIONS",
        },
        body: "",
      };
    }

    const url = new URL(event.rawUrl || `${event.headers["x-forwarded-proto"]}://${event.headers.host}${event.path}${event.rawQuery ? "?" + event.rawQuery : ""}`);
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "20", 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));

    // Mock mode
    if (url.searchParams.get("mock") === "1") {
      const items = Array.from({ length: limit }).map((_, i) => ({
        id: `mock-res-${offset + i + 1}`,
        created_at: new Date(Date.now() - i * 3600e3).toISOString(),
        user_id: `mock-user-${i + 1}`,
        answers: { q1: "Personal use", budget: "$200–$400", _meta: { submittedAt: new Date().toISOString() } },
        top3: [
          { brand: "Tesla", model: "Model 3", reason: "electric and modern", image: "" },
          { brand: "BMW", model: "X5", reason: "luxury family SUV", image: "" },
          { brand: "Toyota", model: "Corolla", reason: "affordable and reliable", image: "" },
        ],
      }));
      return json(200, { items });
    }

    const sb = getAdminClient();

    // Your table name is "results" (from resultsSave.js / resultsList.js you shared)
    // Columns: id, created_at, user_id, answers (json), top3 (json)
    const rangeFrom = offset;
    const rangeTo = offset + limit - 1;

    const { data, error } = await sb
      .from("results")
      .select("id,created_at,user_id,answers,top3")
      .order("created_at", { ascending: false })
      .range(rangeFrom, rangeTo);

    if (error) throw error;

    return json(200, { items: data || [] });
  } catch (err) {
    console.error("[adminListResults] ERROR:", err);
    const message = err?.message || String(err);
    return json(500, { error: "ADMIN_RESULTS_FAILED", message });
  }
};
