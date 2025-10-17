// netlify/functions/adminListUsers.js
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
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "12", 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));

    // Mock mode for quick verification
    if (url.searchParams.get("mock") === "1") {
      const items = Array.from({ length: limit }).map((_, i) => ({
        id: `mock-user-${offset + i + 1}`,
        email: `user${offset + i + 1}@demo.co`,
        name: "Demo Name",
        nickname: "Demo",
        dob: "1995-05-05",
        gender: "Prefer not to say",
        country: "United States",
        state: "California",
        created_at: new Date(Date.now() - i * 3600e3).toISOString(),
      }));
      return json(200, { items });
    }

    const sb = getAdminClient();

    // Your table uses "profiles" with these columns (from your other functions):
    // id, email, name, nickname, dob, gender, country, state, created_at
    const rangeFrom = offset;
    const rangeTo = offset + limit - 1;

    const { data, error } = await sb
      .from("profiles")
      .select("id,email,name,nickname,dob,gender,country,state,created_at")
      .order("created_at", { ascending: false })
      .range(rangeFrom, rangeTo);

    if (error) throw error;

    return json(200, { items: data || [] });
  } catch (err) {
    console.error("[adminListUsers] ERROR:", err);
    const message = err?.message || String(err);
    return json(500, { error: "ADMIN_USERS_FAILED", message });
  }
};
