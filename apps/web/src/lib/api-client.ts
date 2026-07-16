import axios from 'axios';

const BASE_URL =
  (typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL : process.env.API_URL) ??
  (process.env.NODE_ENV === 'production' ? 'http://127.0.0.1:3001' : 'http://127.0.0.1:3002');

export const apiClient = axios.create({
  baseURL: `${BASE_URL}/api`,
  withCredentials: true,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

import { supabase } from './supabase';

// Inject JWT token from Supabase auth on every request
apiClient.interceptors.request.use(async (config) => {
  if (typeof window !== 'undefined') {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        config.headers.Authorization = `Bearer ${data.session.access_token}`;
      }
    } catch {
      // ignore
    }
  }
  return config;
});

// Local desktop app — no auth. Kept as a passthrough for error logging.
apiClient.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(err),
);

export default apiClient;
