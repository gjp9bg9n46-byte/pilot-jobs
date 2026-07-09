// Axios API client for the CockpitHire mobile app.
//
// Talks to the same backend as the web app. The base URL comes from
// EXPO_PUBLIC_API_URL (inlined at bundle time); the fallback is the
// verified-working proxy URL. NOTE: api.cockpithire.com currently NXDOMAINs, so
// the fallback intentionally points at cockpithire.com/api (proxy → Railway),
// which is the URL all prior verification used. Swap to the api. subdomain once
// its DNS is live.
import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { deleteItem, getItem, setItem } from './secureStore';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://cockpithire.com/api';

export const TOKEN_KEY = 'cockpithire.auth.token';

// ---- Token storage (secure-store on native, localStorage on web) -----------

export async function getToken(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await deleteItem(TOKEN_KEY);
}

// ---- 401 handler registration ----------------------------------------------
// AuthContext registers a handler here so the client can trigger logout +
// redirect without importing the router (avoids a circular dependency).

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function registerUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler;
}

// ---- Axios instance --------------------------------------------------------

const api = axios.create({
  baseURL: API_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

// Inject the Bearer token on every request.
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear the token and let the app redirect to /login.
api.interceptors.response.use(
  (res: AxiosResponse) => res,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await clearToken();
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

export default api;
