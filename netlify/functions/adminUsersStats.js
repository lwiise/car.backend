// netlify/functions/adminUsersStats.js
const { withCors } = require("./cors");
const { sbAdmin, parseBody, startOfDay } = require("./_supabase");

exports.handler = withCors(async (event) => {
  const supabase = sbAdmin();
  const { lastDays = 7 } = parseBody(event);
  const since = new Date(Date.now() - Number(lastDays) * 86400000).toISOString();

  // totals: registered users
  const { count: totalUsers, error: tErr } = await supabase
    .from("profiles").select("*", { count: "exact", head: true });
  if (tErr) return { statusCode: 500, body: { error: tErr.message } };

  // new users in range
  const { count: newUsers, error: nErr } = await supabase
    .from("profiles").select("*", { count: "exact", head: true })
    .gte("created_at", since);
  if (nErr) return { statusCode: 500, body: { error: nErr.message } };

  // distinct guests (total + new in range)
  const { data: allGuests, error: gErr } = await supabase
    .from("results").select("guest_id, created_at").not("guest_id", "is", null);
  if (gErr) return { statusCode: 500, body: { error: gErr.message } };

  const totalGuests = new Set((allGuests || []).map(r => r.guest_id)).size;
  const newGuests = new Set((allGuests || []).filter(r => r.created_at >= since).map(r => r.guest_id)).size;

  // daily series
  const series = [];
  for (let i = Number(lastDays) - 1; i >= 0; i--) {
    const day = startOfDay(new Date(Date.now() - i * 86400000));
    const next = new Date(day); next.setDate(day.getDate() + 1);

    const { count: u } = await supabase
      .from("profiles").select("*", { count: "exact", head: true })
      .gte("created_at", day.toISOString()).lt("created_at", next.toISOString());

    const { data: gDay } = await supabase
      .from("results").select("guest_id, created_at")
      .not("guest_id", "is", null)
      .gte("created_at", day.toISOString()).lt("created_at", next.toISOString());

    series.push({
      date: day.toISOString().slice(0,10),
      users: u || 0,
      guests: new Set((gDay || []).map(r => r.guest_id)).size
    });
  }

  return {
    statusCode: 200,
    body: {
      totals: { users: totalUsers || 0, guests: totalGuests || 0 },
      newInRange: { users: newUsers || 0, guests: newGuests || 0 },
      series
    }
  };
});
