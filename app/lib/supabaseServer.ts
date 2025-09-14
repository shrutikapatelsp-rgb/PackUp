import { createClient, SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!URL || !SERVICE_ROLE) {
  // throw during build time on server so missing envs are obvious
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE env on server');
}

// Create server-side client - using service role
export const supabaseServer: SupabaseClient = createClient(URL, SERVICE_ROLE, {
  auth: { persistSession: false },
  global: { headers: { 'x-operation': 'packup-server' } },
});

export default supabaseServer;
