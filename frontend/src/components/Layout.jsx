import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../store';
import { adminApi, authApi } from '../services/api';
import { useIsMobile } from '../hooks/useIsMobile';
import VerifyEmailBanner from './auth/VerifyEmailBanner';

const S = { strokeLinecap: 'round', strokeLinejoin: 'round' };
const Ico = ({ d, extra, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" {...S}>
    {d && <path d={d} />}
    {extra}
  </svg>
);

const AIRLINES_ICON = <Ico extra={<><path d="M2 9h14M9 3l6 6-6 6"/><circle cx="5" cy="9" r="1.5"/></>} />;
const MODERATION_ICON = (
  <Ico extra={<><path d="M9 1.5L2 5v5c0 4 3 7 7 7s7-3 7-7V5L9 1.5z"/><polyline points="6 9 8 11 12 7"/></>} />
);

const NAV_ITEMS = [
  { to: '/jobs',     label: 'Jobs',
    icon: <Ico extra={<><rect x="2" y="6" width="14" height="10" rx="1.5"/><path d="M6 6V4.5A1.5 1.5 0 017.5 3h3A1.5 1.5 0 0112 4.5V6"/><line x1="2" y1="11" x2="16" y2="11"/></>} /> },
  { to: '/airlines', label: 'Airlines', icon: AIRLINES_ICON },
  { to: '/alerts',   label: 'Alerts',
    icon: <Ico extra={<><path d="M9 2.5a4.5 4.5 0 00-4.5 4.5v2.5L3 12h12l-1.5-2.5V7A4.5 4.5 0 009 2.5z"/><path d="M7.5 14.5a1.5 1.5 0 003 0"/></>} /> },
  { to: '/logbook',  label: 'Logbook',
    icon: <Ico extra={<><rect x="3" y="2" width="12" height="14" rx="1.5"/><line x1="6" y1="6.5" x2="12" y2="6.5"/><line x1="6" y1="9" x2="12" y2="9"/><line x1="6" y1="11.5" x2="10" y2="11.5"/></>} /> },
  { to: '/cv',       label: 'CV Builder',
    icon: <Ico extra={<><rect x="3" y="2" width="12" height="14" rx="1.5"/><line x1="6" y1="5.5" x2="12" y2="5.5"/><line x1="6" y1="8" x2="12" y2="8"/><line x1="6" y1="10.5" x2="9" y2="10.5"/><circle cx="11.5" cy="12" r="2"/><path d="M13 13.5l1.5 1.5"/></>} /> },
  { to: '/profile',  label: 'Profile',
    icon: <Ico extra={<><circle cx="9" cy="6.5" r="2.5"/><path d="M3 16a6 6 0 0112 0"/></>} /> },
];

const BOTTOM_NAV_ITEMS = [
  { to: '/settings', label: 'Settings',
    icon: <Ico extra={<><circle cx="9" cy="9" r="2.5"/><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.6 3.6l1.4 1.4M13 13l1.4 1.4M3.6 14.4l1.4-1.4M13 5l1.4-1.4"/></>} /> },
  { to: '/support',  label: 'Support',
    icon: <Ico extra={<><path d="M2.5 3h13a1 1 0 011 1v7.5a1 1 0 01-1 1H5.5l-3 3V4a1 1 0 011-1z"/></>} /> },
];

const SIDEBAR_NAV = [
  ...NAV_ITEMS,
  ...BOTTOM_NAV_ITEMS,
];

const PAGE_TITLES = {
  '/jobs': 'Job Openings', '/airlines': 'Airline Factfile', '/alerts': 'My Alerts',
  '/logbook': 'Flight Logbook', '/profile': 'My Profile',
  '/cv': 'CV Builder', '/support': 'Support', '/settings': 'Settings',
  '/admin/moderation': 'Airline Moderation',
  '/admin/employers': 'Employer Moderation',
};

const SIGN_OUT_ICON = <Ico size={18} extra={<><path d="M7 3H3a1 1 0 00-1 1v10a1 1 0 001 1h4"/><polyline points="12 5 16 9 12 13"/><line x1="16" y1="9" x2="6" y2="9"/></>} />;

// Plane wordmark glyph (stroke via style so it can use the accent token).
const PlaneMark = ({ size = 18, style }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--accent)', ...style }}>
    <path d="M16 9H3.5M10 4L16 9l-6 5M7 6L2 9l5 3" />
  </svg>
);

// Light-theme nav link: active gets accent text + a 3px left-border accent.
// No inline background, so the .nav-link:hover utility can apply the fill.
function navLinkStyle(isActive) {
  return {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '11px 14px', borderLeft: `3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
    borderRadius: 10, textDecoration: 'none',
    fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
    color: isActive ? 'var(--accent)' : 'var(--text-primary)',
  };
}
function drawerLinkStyle(isActive) {
  return {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '13px 20px', borderLeft: `3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
    textDecoration: 'none', fontSize: 15, fontWeight: 600,
    color: isActive ? 'var(--accent)' : 'var(--text-primary)',
    transition: 'background 0.1s, color 0.1s',
  };
}

const unreadBadge = { background: 'var(--accent)', color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: 800, padding: '1px 7px' };
const pendingBadge = { background: '#FEF3C7', color: '#92400E', borderRadius: 10, fontSize: 11, fontWeight: 800, padding: '1px 7px' };

export default function Layout() {
  const dispatch   = useDispatch();
  const navigate   = useNavigate();
  const pilot      = useSelector((s) => s.auth.pilot);
  const alerts     = useSelector((s) => s.jobs.alerts);
  const unread     = alerts.filter((a) => !a.readAt).length;
  const isMobile   = useIsMobile();
  const path       = window.location.pathname;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [empPending, setEmpPending] = useState(0);

  // Pending-employer count for the admin "Employer Moderation" badge.
  useEffect(() => {
    if (!pilot?.isAdmin) return;
    adminApi.listPendingEmployers().then(({ data }) => setEmpPending(Array.isArray(data) ? data.length : 0)).catch(() => {});
  }, [pilot?.isAdmin, path]);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [drawerOpen]);

  // Prevent body scroll while drawer is open
  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen, isMobile]);

  const handleLogout = () => { dispatch(logout()); navigate('/login'); };
  const closeDrawer  = () => setDrawerOpen(false);

  const initials = pilot
    ? `${pilot.firstName?.[0] ?? ''}${pilot.lastName?.[0] ?? ''}`.toUpperCase()
    : '?';

  const avatar = (size) => ({
    width: size, height: size, borderRadius: '50%', background: 'var(--accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: size > 32 ? 13 : 12, color: '#fff', flexShrink: 0,
  });

  // ─── Mobile layout ────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="app-light" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>

        {/* ── Backdrop ───────────────────────────────────────────────────────── */}
        <div
          aria-hidden="true"
          onClick={closeDrawer}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(15,20,25,0.5)',
            opacity: drawerOpen ? 1 : 0,
            pointerEvents: drawerOpen ? 'auto' : 'none',
            transition: 'opacity 250ms ease',
          }}
        />

        {/* ── Slide-out drawer ───────────────────────────────────────────────── */}
        <nav
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          style={{
            position: 'fixed', top: 0, left: 0, height: '100%',
            width: '80vw', maxWidth: 320,
            background: 'var(--surface)', borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column',
            zIndex: 1001,
            transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 250ms ease',
            willChange: 'transform',
          }}
        >
          {/* Drawer header — fixed at top */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <PlaneMark size={16} /> CockpitHire
            </div>
            <button
              onClick={closeDrawer}
              aria-label="Close menu"
              className="icon-button"
              style={{
                width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
                borderRadius: 8, flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="3" x2="15" y2="15"/><line x1="15" y1="3" x2="3" y2="15"/>
              </svg>
            </button>
          </div>

          {/* Drawer body — scrollable */}
          <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8, paddingBottom: 8 }}>
            {/* Main nav */}
            {NAV_ITEMS.map(({ to, icon, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={closeDrawer}
                className="nav-link"
                style={({ isActive }) => drawerLinkStyle(isActive)}
              >
                <span style={{ width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                <span style={{ flex: 1 }}>{label}</span>
                {to === '/alerts' && unread > 0 && <span style={unreadBadge}>{unread}</span>}
              </NavLink>
            ))}

            {/* Admin-only moderation links */}
            {pilot?.isAdmin && (
              <NavLink
                to="/admin"
                end
                onClick={closeDrawer}
                className="nav-link"
                style={({ isActive }) => drawerLinkStyle(isActive)}
              >
                <span style={{ width: 20, textAlign: 'center', flexShrink: 0 }}>{MODERATION_ICON}</span>
                <span>Admin Dashboard</span>
              </NavLink>
            )}
            {pilot?.isAdmin && (
              <NavLink
                to="/admin/moderation"
                onClick={closeDrawer}
                className="nav-link"
                style={({ isActive }) => drawerLinkStyle(isActive)}
              >
                <span style={{ width: 20, textAlign: 'center', flexShrink: 0 }}>{MODERATION_ICON}</span>
                <span>Airline Moderation</span>
              </NavLink>
            )}
            {pilot?.isAdmin && (
              <NavLink
                to="/admin/employers"
                onClick={closeDrawer}
                className="nav-link"
                style={({ isActive }) => drawerLinkStyle(isActive)}
              >
                <span style={{ width: 20, textAlign: 'center', flexShrink: 0 }}>{MODERATION_ICON}</span>
                <span style={{ flex: 1 }}>Employer Moderation</span>
                {empPending > 0 && <span style={pendingBadge}>{empPending}</span>}
              </NavLink>
            )}

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--border)', margin: '8px 20px' }} />

            {/* Bottom nav items */}
            {BOTTOM_NAV_ITEMS.map(({ to, icon, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={closeDrawer}
                className="nav-link"
                style={({ isActive }) => drawerLinkStyle(isActive)}
              >
                <span style={{ width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                <span>{label}</span>
              </NavLink>
            ))}
          </div>

          {/* Sign out — pinned at bottom of drawer */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '8px 0', flexShrink: 0 }}>
            <button
              onClick={() => { closeDrawer(); handleLogout(); }}
              className="nav-link"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                padding: '13px 20px', background: 'none', border: 'none',
                cursor: 'pointer', fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)',
                textAlign: 'left',
              }}
            >
              <span style={{ width: 20, textAlign: 'center', flexShrink: 0 }}>{SIGN_OUT_ICON}</span>
              Sign Out
            </button>
          </div>
        </nav>

        {/* ── Mobile top bar ─────────────────────────────────────────────────── */}
        <header style={{
          padding: '0 16px',
          height: 52,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          {/* Hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            className="icon-button"
            style={{
              width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', cursor: 'pointer', color: 'var(--text-primary)',
              borderRadius: 8, flexShrink: 0, marginLeft: -8,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="3" y1="5"  x2="17" y2="5"/>
              <line x1="3" y1="10" x2="17" y2="10"/>
              <line x1="3" y1="15" x2="17" y2="15"/>
            </svg>
          </button>

          {/* Logo */}
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <PlaneMark size={15} /> CockpitHire
          </div>

          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {unread > 0 && <span style={{ ...unreadBadge, fontSize: 10, padding: '2px 6px' }}>{unread}</span>}
            <div style={avatar(32)}>{initials}</div>
          </div>
        </header>

        {/* ── Page content ───────────────────────────────────────────────────── */}
        {/* intentional — dark page body; light page bodies migrate later */}
        {/* NOTE: LightPage primitive bleeds over this padding (16px 16px 24px). Keep in sync. */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px', background: '#0A1628', color: '#fff' }}>
          <Outlet />
        </div>

      </div>
    );
  }

  // ─── Desktop layout ───────────────────────────────────────────────────────────
  return (
    <div className="app-light" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: 240, flexShrink: 0, background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', padding: '0 0 24px',
      }}>
        <div style={{
          padding: '28px 24px 24px', borderBottom: '1px solid var(--border)',
          fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px',
        }}>
          <PlaneMark size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
          CockpitHire
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, marginTop: 2 }}>Aviation Careers Worldwide</div>
        </div>

        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {SIDEBAR_NAV.map(({ to, icon, label }, i) => (
            <React.Fragment key={to}>
              {/* Divider before Settings (index 6 = after CV Builder and Profile) */}
              {i === 6 && <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px 8px' }} />}
              <NavLink to={to} className="nav-link" style={({ isActive }) => navLinkStyle(isActive)}>
                <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{icon}</span>
                {label}
                {to === '/alerts' && unread > 0 && <span style={{ ...unreadBadge, marginLeft: 'auto' }}>{unread}</span>}
              </NavLink>
            </React.Fragment>
          ))}

          {pilot?.isAdmin && (
            <NavLink to="/admin" end className="nav-link" style={({ isActive }) => ({ ...navLinkStyle(isActive), marginTop: 4 })}>
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{MODERATION_ICON}</span>
              Admin Dashboard
            </NavLink>
          )}
          {pilot?.isAdmin && (
            <NavLink to="/admin/moderation" className="nav-link" style={({ isActive }) => navLinkStyle(isActive)}>
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{MODERATION_ICON}</span>
              Airline Moderation
            </NavLink>
          )}
          {pilot?.isAdmin && (
            <NavLink to="/admin/employers" className="nav-link" style={({ isActive }) => navLinkStyle(isActive)}>
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{MODERATION_ICON}</span>
              <span style={{ flex: 1 }}>Employer Moderation</span>
              {empPending > 0 && <span style={pendingBadge}>{empPending}</span>}
            </NavLink>
          )}
        </nav>

        <button
          onClick={handleLogout}
          className="nav-link"
          style={{
            margin: '0 12px', padding: '11px 14px', borderRadius: 10,
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 12,
            color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600,
          }}
        >
          <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>
            {SIGN_OUT_ICON}
          </span>
          Sign Out
        </button>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <header style={{
          padding: '16px 32px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--surface)', flexShrink: 0,
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{PAGE_TITLES[path] ?? 'CockpitHire'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
            <span>{pilot ? `${pilot.firstName} ${pilot.lastName}` : 'Pilot'}</span>
            <div style={avatar(34)}>{initials}</div>
          </div>
        </header>
        <VerifyEmailBanner verified={pilot?.emailVerified} resendFn={authApi.resendVerification} />
        {/* intentional — dark page body; light page bodies migrate later */}
        {/* NOTE: LightPage primitive bleeds over this padding (32px). Keep in sync. */}
        <div style={{ flex: 1, padding: '32px', overflowY: 'auto', background: '#0A1628', color: '#fff' }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
