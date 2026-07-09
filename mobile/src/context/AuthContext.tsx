// Unified auth context — handles BOTH pilots and employers.
//
// The web app keeps two entirely separate auth clients (authToken vs
// employerToken). On mobile we unify into one context with an `accountType`
// discriminator, because a single device session is one account at a time and
// the router gate needs one source of truth.
//
// Backend contract:
//   Pilot    POST /auth/login        { email, password }      -> { token, pilot }
//            POST /auth/register      { email, password, ... } -> { token, pilot }
//            GET  /auth/me            -> pilot
//   Employer POST /employers/login    { contactEmail, password } -> { token, employer }
//            POST /employers/register { companyName, ... }        -> { token, employer }
//            GET  /employers/me        -> employer
//   Shared   POST /auth/resend-verification  (authAnyUser — either token)
//
// Token persists in expo-secure-store under `cockpithire.auth.token`; the account
// type persists under `cockpithire.auth.type` so hydrate can call the right /me.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import api, {
  clearToken,
  getToken,
  registerUnauthorizedHandler,
  setToken,
} from '../lib/api';
import { deleteItem, getItem, setItem } from '../lib/secureStore';
import { registerForPush } from '../lib/push';

export type AccountType = 'pilot' | 'employer';

export interface Pilot {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  emailVerified?: boolean;
  isAdmin?: boolean;
  [key: string]: unknown;
}

export interface Employer {
  id: string;
  companyName: string;
  companyType: string;
  country: string;
  contactName: string;
  contactEmail: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  emailVerified?: boolean;
  headquartersCity?: string | null;
  [key: string]: unknown;
}

export type Account =
  | { type: 'pilot'; data: Pilot }
  | { type: 'employer'; data: Employer };

export interface PilotRegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  country?: string;
  city?: string;
}

export type EmployerRegisterInput = {
  companyName: string;
  companyType: string;
  country: string;
  contactName: string;
  contactEmail: string;
  password: string;
  headquartersCity?: string;
  website?: string;
  description?: string;
  contactPhone?: string;
};

const TYPE_KEY = 'cockpithire.auth.type';

interface AuthContextValue {
  account: Account | null;
  user: Pilot | Employer | null;
  accountType: AccountType | null;
  emailVerified: boolean | undefined;
  token: string | null;
  loading: boolean;
  loginPilot: (email: string, password: string) => Promise<Pilot>;
  loginEmployer: (email: string, password: string) => Promise<Employer>;
  registerPilot: (input: PilotRegisterInput) => Promise<Pilot>;
  registerEmployer: (input: EmployerRegisterInput) => Promise<Employer>;
  resendVerification: () => Promise<{ message?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function setStoredType(type: AccountType) {
  await setItem(TYPE_KEY, type);
}
async function getStoredType(): Promise<AccountType | null> {
  const v = await getItem(TYPE_KEY);
  return v === 'pilot' || v === 'employer' ? v : null;
}
async function clearStoredType() {
  await deleteItem(TYPE_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const clearLocal = useCallback(() => {
    setTokenState(null);
    setAccount(null);
  }, []);

  const logout = useCallback(async () => {
    await clearToken();
    await clearStoredType();
    clearLocal();
  }, [clearLocal]);

  // The axios 401 interceptor already cleared the token; sync local state + type.
  useEffect(() => {
    registerUnauthorizedHandler(() => {
      clearStoredType();
      clearLocal();
    });
  }, [clearLocal]);

  // Silent push registration once authenticated — acquires a token ONLY if the OS
  // permission was already granted (never prompts here; the prompt is triggered
  // explicitly from Settings › Notifications). No-op on web / Expo Go / denial.
  useEffect(() => {
    if (!token) return;
    registerForPush(false).catch(() => {});
  }, [token]);

  // Hydrate on mount from the stored token + account type.
  useEffect(() => {
    let active = true;
    (async () => {
      const stored = await getToken();
      const type = await getStoredType();
      if (!stored || !type) {
        if (active) setLoading(false);
        return;
      }
      try {
        if (type === 'employer') {
          const { data } = await api.get<Employer>('/employers/me');
          if (active) {
            setTokenState(stored);
            setAccount({ type: 'employer', data });
          }
        } else {
          const { data } = await api.get<Pilot>('/auth/me');
          if (active) {
            setTokenState(stored);
            setAccount({ type: 'pilot', data });
          }
        }
      } catch {
        await clearToken();
        await clearStoredType();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(async (tok: string, type: AccountType) => {
    await setToken(tok);
    await setStoredType(type);
    setTokenState(tok);
  }, []);

  const loginPilot = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<{ token: string; pilot: Pilot }>('/auth/login', {
        email,
        password,
      });
      await persist(data.token, 'pilot');
      setAccount({ type: 'pilot', data: data.pilot });
      return data.pilot;
    },
    [persist],
  );

  const loginEmployer = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<{ token: string; employer: Employer }>('/employers/login', {
        contactEmail: email,
        password,
      });
      await persist(data.token, 'employer');
      setAccount({ type: 'employer', data: data.employer });
      return data.employer;
    },
    [persist],
  );

  const registerPilot = useCallback(
    async (input: PilotRegisterInput) => {
      const { data } = await api.post<{ token: string; pilot: Pilot }>('/auth/register', input);
      await persist(data.token, 'pilot');
      setAccount({ type: 'pilot', data: data.pilot });
      return data.pilot;
    },
    [persist],
  );

  const registerEmployer = useCallback(
    async (input: EmployerRegisterInput) => {
      const { data } = await api.post<{ token: string; employer: Employer }>(
        '/employers/register',
        input,
      );
      await persist(data.token, 'employer');
      setAccount({ type: 'employer', data: data.employer });
      return data.employer;
    },
    [persist],
  );

  const resendVerification = useCallback(async () => {
    const { data } = await api.post<{ success: boolean; message?: string }>(
      '/auth/resend-verification',
    );
    return data;
  }, []);

  const refresh = useCallback(async () => {
    if (!account) return;
    try {
      if (account.type === 'employer') {
        const { data } = await api.get<Employer>('/employers/me');
        setAccount({ type: 'employer', data });
      } else {
        const { data } = await api.get<Pilot>('/auth/me');
        setAccount({ type: 'pilot', data });
      }
    } catch {
      // 401 handled by interceptor
    }
  }, [account]);

  const value = useMemo<AuthContextValue>(
    () => ({
      account,
      user: account?.data ?? null,
      accountType: account?.type ?? null,
      emailVerified: account?.data.emailVerified,
      token,
      loading,
      loginPilot,
      loginEmployer,
      registerPilot,
      registerEmployer,
      resendVerification,
      logout,
      refresh,
    }),
    [
      account,
      token,
      loading,
      loginPilot,
      loginEmployer,
      registerPilot,
      registerEmployer,
      resendVerification,
      logout,
      refresh,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export default AuthContext;
