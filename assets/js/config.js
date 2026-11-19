// Supabase browser configuration.
// The publishable/anon key is designed for browser use. Never put a service_role key here.
export const SUPABASE_URL = ${{ secrets.VITE_SUPABASE_URL  }};
export const SUPABASE_ANON_KEY = ${{ secrets.VITE_SUPABASE_ANON_KEY }};
