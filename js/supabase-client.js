// ==========================================================
// Supabase connection — used by every screen in the app.
// The anon key is meant to be public/client-side; real data
// protection happens via Row Level Security + the RPC
// functions defined in sql/schema.sql, not by hiding this key.
// ==========================================================

const SUPABASE_URL = "https://hjmdwvfkqfhgjlaejava.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqbWR3dmZrcWZoZ2psYWVqYXZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5MTQxNjQsImV4cCI6MjEwNDQ5MDE2NH0.54bOJ3UOFyWFa64_tIRRYlX19MnQSndyCc4vECV36SA";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
