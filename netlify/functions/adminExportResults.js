// netlify/functions/adminExportResults.js
import { createClient } from '@supabase/supabase-js';
import { corsHeaders, SUPABASE_URL, SUPABASE_SERVICE_ROLE, allowOrigin } from './_supabase.js';

export async function handler(event) {
  try {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: corsHeaders, body: 'ok' };
    }

    // Allow origin + set CORS response headers
    allowOrigin(event);

    // Service-role client (server only)
    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    // Pull all results (newest first)
    const { data: results, error } = await supa
      .from('results')
      .select('created_at, user_id, answers, top3')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Map user_id -> email (from profiles)
    const userIds = [...new Set((results || []).map(r => r.user_id).filter(Boolean))];
    let emails = {};
    if (userIds.length) {
      const { data: profiles, error: pErr } = await supa
        .from('profiles')
        .select('id, email')
        .in('id', userIds);
      if (pErr) throw pErr;
      emails = Object.fromEntries((profiles || []).map(p => [p.id, p.email || '']));
    }

    // CSV rows
    const header = ['created_at', 'email', 'answers_json', 'top3_json'];
    const rows = results.map(r => [
      r.created_at || '',
      emails[r.user_id] || '',
      JSON.stringify(r.answers || {}),
      JSON.stringify(r.top3 || []),
    ]);

    const csv = [header, ...rows]
      .map(cols => cols.map(v => `"${String(v ?? '').replaceAll('"','""')}"`).join(','))
      .join('\n');

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="results.csv"',
      },
      body: csv,
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: e.message || 'error',
    };
  }
}
