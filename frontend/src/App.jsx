import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { authApi } from './services/api';
import { setPilot, logout } from './store';

// Employer portal (separate auth — React Context, not the pilot Redux store)
import { EmployerAuthProvider } from './context/EmployerAuthContext';
import RequireEmployerAuth from './components/employer/RequireEmployerAuth';
import EmployerRegister from './pages/employer/EmployerRegister';
import EmployerLogin from './pages/employer/EmployerLogin';
import EmployerPendingApproval from './pages/employer/EmployerPendingApproval';
import EmployerStatusNotice from './pages/employer/EmployerStatusNotice';

import Layout from './components/Layout';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Jobs from './pages/Jobs';
import Airlines from './pages/Airlines';
import AirlineDetail from './pages/AirlineDetail';
import AirlineContribute from './pages/AirlineContribute';
import AdminModeration from './pages/AdminModeration';
import Alerts from './pages/Alerts';
import Logbook from './pages/Logbook';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Support from './pages/Support';
import { lazy, Suspense } from 'react';
const CVBuilder = lazy(() => import('./pages/CVBuilder'));

function RequireAuth({ children }) {
  const token = useSelector((s) => s.auth.token);
  return token ? children : <Navigate to="/login" replace />;
}

// Placeholder for the approved-employer landing target. Replaced by the real
// dashboard in step (f); exists now so login redirects resolve cleanly.
function EmployerDashboardStub() {
  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', color: '#C0CDE0',
      display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, fontSize: 16 }}>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#00B4D8', marginBottom: 10 }}>✈ Employer Dashboard</div>
        Your account is approved. The dashboard is coming soon.
      </div>
    </div>
  );
}

export default function App() {
  const dispatch = useDispatch();
  const token = useSelector((s) => s.auth.token);

  useEffect(() => {
    if (!token) return;
    authApi.me()
      .then(({ data }) => dispatch(setPilot(data)))
      .catch(() => dispatch(logout()));
  }, [token, dispatch]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Navigate to="/jobs" replace />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="airlines" element={<Airlines />} />
          <Route path="airlines/:id" element={<AirlineDetail />} />
          <Route path="airlines/:id/contribute" element={<AirlineContribute />} />
          <Route path="admin/moderation" element={<AdminModeration />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="logbook" element={<Logbook />} />
          <Route path="profile" element={<Profile />} />
          <Route path="support" element={<Support />} />
          <Route path="settings" element={<Settings />} />
          <Route path="cv" element={<Suspense fallback={<div style={{padding:48,textAlign:'center',color:'#7A8CA0'}}>Loading…</div>}><CVBuilder /></Suspense>} />
        </Route>

        {/* Employer portal — OUTSIDE the pilot RequireAuth tree, own auth provider */}
        <Route path="/employer" element={<EmployerAuthProvider><Outlet /></EmployerAuthProvider>}>
          <Route path="register" element={<EmployerRegister />} />
          <Route path="login" element={<EmployerLogin />} />
          <Route path="pending-approval" element={<RequireEmployerAuth><EmployerPendingApproval /></RequireEmployerAuth>} />
          <Route path="rejected" element={<RequireEmployerAuth><EmployerStatusNotice kind="rejected" /></RequireEmployerAuth>} />
          <Route path="suspended" element={<RequireEmployerAuth><EmployerStatusNotice kind="suspended" /></RequireEmployerAuth>} />
          {/* Minimal stub so approved-login lands cleanly — full dashboard is step (f) */}
          <Route path="dashboard" element={<RequireEmployerAuth><EmployerDashboardStub /></RequireEmployerAuth>} />
        </Route>

        <Route path="*" element={<Navigate to="/jobs" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
