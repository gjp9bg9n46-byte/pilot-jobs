import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { employerApi } from '../services/employerApi';

// Employer auth state via React Context (deliberately NOT the pilot Redux store).
const EmployerAuthContext = createContext(null);

export function EmployerAuthProvider({ children }) {
  const [employer, setEmployer] = useState(null);
  const [loading, setLoading] = useState(true);

  // Verify the stored token against the backend and load the employer.
  const refresh = useCallback(async () => {
    if (!localStorage.getItem('employerToken')) {
      setEmployer(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const { data } = await employerApi.getMe();
      setEmployer(data);
      return data;
    } catch {
      localStorage.removeItem('employerToken');
      setEmployer(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const { data } = await employerApi.login(email, password);
    localStorage.setItem('employerToken', data.token);
    setEmployer(data.employer);
    return data.employer;
  };

  const register = async (payload) => {
    const { data } = await employerApi.register(payload);
    localStorage.setItem('employerToken', data.token);
    setEmployer(data.employer);
    return data.employer;
  };

  const logout = () => {
    localStorage.removeItem('employerToken');
    setEmployer(null);
  };

  const value = {
    employer,
    loading,
    isAuthenticated: !!employer,
    status: employer?.status ?? null,
    login,
    register,
    logout,
    refresh,
  };

  return <EmployerAuthContext.Provider value={value}>{children}</EmployerAuthContext.Provider>;
}

export function useEmployerAuth() {
  const ctx = useContext(EmployerAuthContext);
  if (!ctx) throw new Error('useEmployerAuth must be used within an EmployerAuthProvider');
  return ctx;
}
