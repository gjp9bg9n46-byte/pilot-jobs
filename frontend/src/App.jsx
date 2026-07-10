import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { authApi } from './services/api';
import { setPilot, logout } from './store';

// Employer portal (separate auth — React Context, not the pilot Redux store)
import { EmployerAuthProvider } from './context/EmployerAuthContext';
import RequireEmployerAuth from './components/employer/RequireEmployerAuth';
import RequireEmployerStatus from './components/employer/RequireEmployerStatus';
// Dedicated employer auth (cool-operator .app-b2b identity). The /login + /register
// pilot pages are pilot-only; ?as=employer bookmarks redirect here for back-compat.
import EmployerLogin from './pages/employer/EmployerLogin';
import EmployerRegister from './pages/employer/EmployerRegister';
import EmployerPendingApproval from './pages/employer/EmployerPendingApproval';
import EmployerStatusNotice from './pages/employer/EmployerStatusNotice';
import EmployerDashboard from './pages/employer/EmployerDashboard';
import EmployerProfile from './pages/employer/EmployerProfile';
import EmployerJobForm from './pages/employer/EmployerJobForm';
import EmployerApplicants from './pages/employer/EmployerApplicants';

import Layout from './components/Layout';
import PublicLayout from './components/PublicLayout';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import About from './pages/legal/About';
import Privacy from './pages/legal/Privacy';
import Terms from './pages/legal/Terms';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import VerifyEmail from './pages/auth/VerifyEmail';
import EmployerForgotPassword from './pages/employer/EmployerForgotPassword';
import EmployerResetPassword from './pages/employer/EmployerResetPassword';
import EmployerVerifyEmail from './pages/employer/EmployerVerifyEmail';
import Landing from './pages/Landing';
import Primitives from './pages/dev/Primitives';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import Airlines from './pages/Airlines';
import AirlineDetail from './pages/AirlineDetail';
import AirlineContribute from './pages/AirlineContribute';
import AdminDashboard from './pages/AdminDashboard';
import AdminModeration from './pages/AdminModeration';
import AdminEmployers from './pages/AdminEmployers';
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

// Airline factfile is public: logged-in pilots get the full app chrome (sidebar),
// logged-out visitors get the slim public shell. Same page content either way.
function AirlineChrome() {
  const token = useSelector((s) => s.auth.token);
  return token ? <Layout /> : <PublicLayout />;
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
        {/* Public marketing landing */}
        <Route path="/" element={<Landing />} />

        {/* Internal design-primitives showcase (unlinked, public) */}
        <Route path="/dev/primitives" element={<Primitives />} />

        {/* Public info + legal pages */}
        <Route path="/about" element={<About />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />

        {/* Unified auth — wrapped in EmployerAuthProvider so the Employer toggle works */}
        <Route element={<EmployerAuthProvider><Outlet /></EmployerAuthProvider>}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
        </Route>

        {/* Public airline factfile + jobs — chrome adapts to auth state (slim shell when logged out) */}
        <Route element={<AirlineChrome />}>
          <Route path="airlines" element={<Airlines />} />
          <Route path="airlines/:id" element={<AirlineDetail />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="jobs/:slugId" element={<JobDetail />} />
          <Route path="support" element={<Support />} />
        </Route>

        {/* Authenticated pilot app (pathless layout — URLs unchanged) */}
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="airlines/:id/contribute" element={<AirlineContribute />} />
          <Route path="admin" element={<AdminDashboard />} />
          <Route path="admin/moderation" element={<AdminModeration />} />
          <Route path="admin/employers" element={<AdminEmployers />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="logbook" element={<Logbook />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="cv" element={<Suspense fallback={<div style={{padding:48,textAlign:'center',color:'#7A8CA0'}}>Loading…</div>}><CVBuilder /></Suspense>} />
        </Route>

        {/* Employer portal — OUTSIDE the pilot RequireAuth tree, own auth provider */}
        <Route path="/employer" element={<EmployerAuthProvider><Outlet /></EmployerAuthProvider>}>
          {/* Dedicated employer auth pages (public — not advertised, but functional) */}
          <Route path="login" element={<EmployerLogin />} />
          <Route path="register" element={<EmployerRegister />} />
          <Route path="forgot-password" element={<EmployerForgotPassword />} />
          <Route path="reset-password" element={<EmployerResetPassword />} />
          <Route path="verify-email" element={<EmployerVerifyEmail />} />
          <Route path="pending-approval" element={<RequireEmployerAuth><EmployerPendingApproval /></RequireEmployerAuth>} />
          <Route path="rejected" element={<RequireEmployerAuth><EmployerStatusNotice kind="rejected" /></RequireEmployerAuth>} />
          <Route path="suspended" element={<RequireEmployerAuth><EmployerStatusNotice kind="suspended" /></RequireEmployerAuth>} />
          <Route path="dashboard" element={<RequireEmployerAuth><EmployerDashboard /></RequireEmployerAuth>} />
          <Route path="profile" element={<RequireEmployerAuth><EmployerProfile /></RequireEmployerAuth>} />
          <Route path="jobs/new" element={<RequireEmployerStatus status="APPROVED"><EmployerJobForm /></RequireEmployerStatus>} />
          <Route path="jobs/:id/edit" element={<RequireEmployerStatus status="APPROVED"><EmployerJobForm /></RequireEmployerStatus>} />
          <Route path="jobs/:id/applicants" element={<RequireEmployerStatus status="APPROVED"><EmployerApplicants /></RequireEmployerStatus>} />
        </Route>

        <Route path="*" element={<Navigate to="/jobs" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
