// Client-safe runtime config.
// Fill these values for local/dev if you are not injecting them at deploy time.
window.ATS_ENV = window.ATS_ENV || {
  SUPABASE_URL: "https://cxzgdmbqsjdbmrwrdkqf.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4emdkbWJxc2pkYm1yd3Jka3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MTY1MDQsImV4cCI6MjA4ODM5MjUwNH0.HlyePIWg__bK1-41ugyumORcTp56fixbZXfXm2TvWpY",
  FUNCTION_BASE: "/.netlify/functions",
  GOOGLE_MAPS_API_KEY: "AIzaSyDovnaPYcgTcIqQPOciKzEakaJ1EmNf7Z0",
  GOOGLE_MAP_ID: "3fe15b19a5d2c2b789a4815b",
  // When true, PPM project-map records are persisted in the
  // crm_project_map_records Supabase table (and hydrated into
  // localStorage on load). When false, behavior matches the legacy
  // localStorage-only path. Flip on after applying the
  // 20260503_0001_crm_project_map_records.sql migration AND running
  // the one-time data import on the old origin.
  PPM_MAP_USE_DB: false,
};
