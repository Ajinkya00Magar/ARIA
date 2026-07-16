import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// If env is missing, we initialize with dummy values so it doesn't crash, 
// but requests will fail when they attempt to use it.
const supabaseUrl = env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = env.SUPABASE_ANON_KEY || 'dummy-key';

export const supabase = createClient(supabaseUrl, supabaseKey);
