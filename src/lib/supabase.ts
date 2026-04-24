import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

// Client for server-side operations (bypasses RLS if needed, but use carefully)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Helper to get client with current user context will be handled in the app router components
