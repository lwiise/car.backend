// netlify/functions/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// IMPORTANT:
// Add these to your Netlify environment variables:
//   SUPABASE_URL = https://zrlfkdxpqkhfusjktrey.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = <your service_role key from Supabase>
// Do NOT expose service_role to the browser. Only inside Netlify functions.

export const supaAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
