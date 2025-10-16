// netlify/functions/adminResults.js
import { supaAdmin, ok, bad, handleOptions, requireAdmin } from './_supa.js';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const gate = requireAdmin(event);
  if (!gate.ok) return bad(403, gate.reason);

  const url = new URL(event.rawUrl || `https://x${event.path}${event.queryStringParameters ? '?' : ''}`);
  const qs = Object.fromEntries(url.searchParams.entries());
  const limit  = Math.min(parseInt(qs.limit || '20', 10), 100);
  const offset = Math.max(parseInt(qs.offset || '0', 10), 0);

  try {
    const supa = supaAdmin();

    // results joined with profile fields
    // Make sure you have a FK from results.user_id -> profiles.user_id in Supabase
    const sel = `
      id, created_at, user_id, answers, top3,
      profiles!inner(email, name, nickname, dob, gender, country, state)
    `;

    const from = supa
      .from('results')
      .select(sel, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await from;
    if (error) throw error;

    const items = (data || []).map(r => ({
      id: r.id,
      created_at: r.created_at,
      user_id: r.user_id,
      answers: r.answers || {},
      top3: Array.isArray(r.top3) ? r.top3 : [],
      user: {
        email: r.profiles?.email || '',
        name: r.profiles?.name || '',
        nickname: r.profiles?.nickname || '',
        dob: r.profiles?.dob || null,
        gender: r.profiles?.gender || '',
        country: r.profiles?.country || '',
        state: r.profiles?.state || '',
      },
    }));

    return ok({ items, total: count ?? items.length, limit, offset });
  } catch (err) {
    console.error('[adminResults]', err);
    return bad(500, err.message || 'Server error');
  }
}
