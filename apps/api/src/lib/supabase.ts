import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { env } from './env';

if (!globalThis.WebSocket) {
  (globalThis as any).WebSocket = WebSocket;
}

// If env is missing, we initialize with dummy values so it doesn't crash, 
// but requests will fail when they attempt to use it.
const supabaseUrl = env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = env.SUPABASE_ANON_KEY || 'dummy-key';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
});
