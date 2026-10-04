import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { authApi } from './services/api';
import { setPilot, logout } from './store';

// Eager — small shared shells, auth providers and guards (always on the critical
// path). Landing is eager too: it is the LCP-critical marketing route, so it must
// not wait on a chunk fetch. Every actual page below is lazy-loaded.
import { EmployerAuthProvider } from './context/EmployerAuthContext';
import RequireEmployerAuth from './components/employer/RequireEmployerAuth';
import RequireEmployerStatus from './components/employer/RequireEmployerStatus';
import Layout from './components/Layout';
import PublicLayout from './components/PublicLayout';
import Landing from './pages/Landing';

// Lazy — each route is a separate chunk, kept off the landing's initial bundle.
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const About = lazy(() => import('./pages/legal/About'));
const Privacy = lazy(() => import('./pages/legal/Privacy'));
const Terms = lazy(() => import('./pages/legal/Terms'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail'));
const Primitives = lazy(() => import('./pages/dev/Primitives'));
const Jobs = lazy(() => import('./pages/Jobs'));
const Airlines = lazy(() => import('./pages/Airlines'));
const AirlineDetail = lazy(() => import('./pages/AirlineDetail'));
const AirlineContribute = lazy(() => import('./pages/AirlineContribute'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminModeration = lazy(() => import('./pages/AdminModeration'));
const AdminEmployers = lazy(() => import('./pages/AdminEmployers'));
const Alerts = lazy(() => import('./pages/Alerts'));
const Logbook = lazy(() => import('./pages/Logbook'));
const ProfileRedesign = lazy(() => import('./pages/ProfileRedesign'));
const Settings = lazy(() => import('./pages/Settings'));
const Support = lazy(() => import('./pages/Support'));
const CVBuilder = lazy(() => import('./pages/CVBuilder'));
const EmployerLogin = lazy(() => import('./pages/employer/EmployerLogin'));
const EmployerRegister = lazy(() => import('./pages/employer/EmployerRegister'));
const EmployerPendingApproval = lazy(() => import('./pages/employer/EmployerPendingApproval'));
const EmployerStatusNotice = lazy(() => import('./pages/employer/EmployerStatusNotice'));
const EmployerDashboard = lazy(() => import('./pages/employer/EmployerDashboard'));
const EmployerProfile = lazy(() => import('./pages/employer/EmployerProfile'));
const EmployerJobForm = lazy(() => import('./pages/employer/EmployerJobForm'));
const EmployerApplicants = lazy(() => import('./pages/employer/EmployerApplicants'));
const EmployerForgotPassword = lazy(() => import('./pages/employer/EmployerForgotPassword'));
const EmployerResetPassword = lazy(() => import('./pages/employer/EmployerResetPassword'));
const EmployerVerifyEmail = lazy(() => import('./pages/employer/EmployerVerifyEmail'));

function PageSpinner() {
  return (
    <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', background: '#FFFFFF' }}>
      <div style={{ width: 34, height: 34, borderRadius: '50%', border: '3px solid #E3E8EF', borderTopColor: '#003F88', animation: 'lpspin .8s linear infinite' }} aria-label="Loading" role="status" />
      <style>{'@keyframes lpspin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}

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
      <Suspense fallback={<PageSpinner />}>
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
            {/* Jobs handles /jobs/:slugId too: desktop shows the split view with the job
                selected; phone/iPad-portrait shows the job as a full page. */}
            <Route path="jobs/:slugId" element={<Jobs />} />
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
            <Route path="profile" element={<ProfileRedesign />} />
            <Route path="settings" element={<Settings />} />
            <Route path="cv" element={<CVBuilder />} />
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

          <Route path="*" element={<Navigate to="/profile" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
