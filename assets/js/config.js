// Public browser configuration. The Pages workflow fills these placeholders
// from the repository Actions secrets during deployment.
// Never put a Supabase service_role key in browser code.
export const SUPABASE_URL = "__SUPABASE_URL__";
export const SUPABASE_ANON_KEY = "__SUPABASE_ANON_KEY__";
