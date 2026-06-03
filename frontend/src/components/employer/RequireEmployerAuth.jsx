import React from 'react';
import { Navigate } from 'react-router-dom';
import { useEmployerAuth } from '../../context/EmployerAuthContext';

// Allows children for ANY authenticated employer (regardless of status).
// No token (or invalid token) → redirect to the employer login.
export default function RequireEmployerAuth({ children }) {
  const { isAuthenticated, loading } = useEmployerAuth();
  const hasToken = !!localStorage.getItem('employerToken');

  if (!hasToken) return <Navigate to="/employer/login" replace />;
  if (loading) {
    return <div style={{ minHeight: '100vh', background: '#0A1628', color: '#7A8CA0',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>Loading…</div>;
  }
  if (!isAuthenticated) return <Navigate to="/employer/login" replace />;
  return children;
}
