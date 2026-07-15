import axios from 'axios';

const BASE_URL =
  (typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL : process.env.API_URL) ??
  'http://127.0.0.1:3001';

export const apiClient = axios.create({
  baseURL: `${BASE_URL}/api`,
  withCredentials: true,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// Inject JWT token from Zustand auth store on every request
apiClient.interceptors.request.use((config) => {
  // Dynamically import to avoid SSR issues
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('ibm-agent-auth');
      if (raw) {
        const parsed = JSON.parse(raw) as { state?: { accessToken?: string } };
        const token = parsed?.state?.accessToken;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    } catch {
      // ignore JSON parse errors
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
