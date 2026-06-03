import React from 'react';
import { Navigate } from 'react-router-dom';
import { useEmployerAuth } from '../../context/EmployerAuthContext';

// Asserts a specific employer status (used by the step-f dashboard).
// On mismatch, redirects to the page appropriate for the employer's actual status.
const ROUTE_FOR = {
  PENDING: '/employer/pending-approval',
  REJECTED: '/employer/rejected',
  SUSPENDED: '/employer/suspended',
  APPROVED: '/employer/dashboard',
};

export default function RequireEmployerStatus({ status: required, children }) {
  const { employer, isAuthenticated, loading } = useEmployerAuth();
  const hasToken = !!localStorage.getItem('employerToken');

  if (!hasToken) return <Navigate to="/employer/login" replace />;
  if (loading) {
    return <div style={{ minHeight: '100vh', background: '#0A1628', color: '#7A8CA0',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>Loading…</div>;
  }
  if (!isAuthenticated) return <Navigate to="/employer/login" replace />;

  if (employer.status === required) return children;
  return <Navigate to={ROUTE_FOR[employer.status] || '/employer/login'} replace />;
}
