// netlify/functions/adminListUsers.js
const { withCors } = require("./cors");
const { sbAdmin, parseBody } = require("./_supabase");

exports.handler = withCors(async (event) => {
  const supabase = sbAdmin();
  const { search = "", lastDays = null, page = 1, pageSize = 25, order = "desc" } = parseBody(event);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("profiles")
    .select("id, email, name, nickname, gender, dob, country, state, created_at", { count: "exact" })
    .order("created_at", { ascending: order === "asc" })
    .range(from, to);

  if (lastDays && Number(lastDays) > 0) {
    const since = new Date(Date.now() - Number(lastDays) * 86400000).toISOString();
    query = query.gte("created_at", since);
  }

  const { data, error, count } = await query;
  if (error) return { statusCode: 500, body: { error: error.message } };

  const s = search.trim().toLowerCase();
  const rows = !s ? data : data.filter(p => {
    const hay = [p.name, p.email, p.country, p.state, p.nickname].join(" ").toLowerCase();
    return hay.includes(s);
  });

  return { statusCode: 200, body: { page, pageSize, total: count ?? rows.length, rows } };
});
