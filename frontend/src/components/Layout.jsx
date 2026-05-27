import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../store';
import { useIsMobile } from '../hooks/useIsMobile';

const S = { strokeLinecap: 'round', strokeLinejoin: 'round' };
const Ico = ({ d, extra, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" {...S}>
    {d && <path d={d} />}
    {extra}
  </svg>
);

const NAV = [
  { to: '/jobs',    label: 'Jobs',
    icon: <Ico extra={<><rect x="2" y="6" width="14" height="10" rx="1.5"/><path d="M6 6V4.5A1.5 1.5 0 017.5 3h3A1.5 1.5 0 0112 4.5V6"/><line x1="2" y1="11" x2="16" y2="11"/></>} /> },
  { to: '/alerts',  label: 'Alerts',
    icon: <Ico extra={<><path d="M9 2.5a4.5 4.5 0 00-4.5 4.5v2.5L3 12h12l-1.5-2.5V7A4.5 4.5 0 009 2.5z"/><path d="M7.5 14.5a1.5 1.5 0 003 0"/></>} /> },
  { to: '/logbook', label: 'Logbook',
    icon: <Ico extra={<><rect x="3" y="2" width="12" height="14" rx="1.5"/><line x1="6" y1="6.5" x2="12" y2="6.5"/><line x1="6" y1="9" x2="12" y2="9"/><line x1="6" y1="11.5" x2="10" y2="11.5"/></>} /> },
  { to: '/profile', label: 'Profile',
    icon: <Ico extra={<><circle cx="9" cy="6.5" r="2.5"/><path d="M3 16a6 6 0 0112 0"/></>} /> },
  { to: '/settings', label: 'Settings',
    icon: <Ico extra={<><circle cx="9" cy="9" r="2.5"/><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.6 3.6l1.4 1.4M13 13l1.4 1.4M3.6 14.4l1.4-1.4M13 5l1.4-1.4"/></>} /> },
];

const SIDEBAR_NAV = [
  { to: '/jobs',    label: 'Jobs',    icon: NAV[0].icon },
  { to: '/alerts',  label: 'Alerts',  icon: NAV[1].icon },
  { to: '/logbook', label: 'Logbook', icon: NAV[2].icon },
  { to: '/profile', label: 'Profile', icon: NAV[3].icon },
  { to: '/cv',      label: 'CV Builder',
    icon: <Ico extra={<><rect x="3" y="2" width="12" height="14" rx="1.5"/><line x1="6" y1="5.5" x2="12" y2="5.5"/><line x1="6" y1="8" x2="12" y2="8"/><line x1="6" y1="10.5" x2="9" y2="10.5"/><circle cx="11.5" cy="12" r="2"/><path d="M13 13.5l1.5 1.5"/></>} /> },
  { to: '/settings', label: 'Settings', icon: NAV[4].icon },
  { to: '/support', label: 'Support',
    icon: <Ico extra={<><path d="M2.5 3h13a1 1 0 011 1v7.5a1 1 0 01-1 1H5.5l-3 3V4a1 1 0 011-1z"/></>} /> },
];

const PAGE_TITLES = {
  '/jobs': 'Job Openings', '/alerts': 'My Alerts',
  '/logbook': 'Flight Logbook', '/profile': 'My Profile',
  '/cv': 'CV Builder', '/support': 'Support', '/settings': 'Settings',
};

export default function Layout() {
  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const pilot     = useSelector((s) => s.auth.pilot);
  const alerts    = useSelector((s) => s.jobs.alerts);
  const unread    = alerts.filter((a) => !a.readAt).length;
  const isMobile  = useIsMobile();
  const path      = window.location.pathname;

  const handleLogout = () => { dispatch(logout()); navigate('/login'); };

  const initials = pilot
    ? `${pilot.firstName?.[0] ?? ''}${pilot.lastName?.[0] ?? ''}`.toUpperCase()
    : '?';

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0A1628', overflow: 'hidden' }}>
        {/* Mobile top bar */}
        <header style={{
          padding: '14px 16px',
          background: '#0D1E35',
          borderBottom: '1px solid #1E3050',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#00B4D8', letterSpacing: '-0.5px' }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="#00B4D8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 6 }}>
              <path d="M16 9H3.5M10 4L16 9l-6 5M7 6L2 9l5 3" />
            </svg>
            CockpitHire
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: '#7A8CA0' }}>{pilot?.firstName}</span>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'linear-gradient(135deg, #00B4D8, #0077A8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 12, color: '#fff',
            }}>
              {initials}
            </div>
          </div>
        </header>

        {/* Page content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 0' }}>
          <Outlet />
        </div>

        {/* Bottom navigation bar */}
        <nav style={{
          display: 'flex', background: '#0D1E35',
          borderTop: '1px solid #1E3050',
          paddingBottom: 'env(safe-area-inset-bottom)',
          flexShrink: 0,
        }}>
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '10px 4px 8px',
                textDecoration: 'none',
                color: isActive ? '#00B4D8' : '#4A6080',
                position: 'relative',
              })}
            >
              {({ isActive }) => (
                <>
                  {to === '/alerts' && unread > 0 && (
                    <span style={{
                      position: 'absolute', top: 6, right: '50%', transform: 'translateX(8px)',
                      background: '#00B4D8', color: '#0A1628',
                      borderRadius: 10, fontSize: 9, fontWeight: 800,
                      padding: '1px 5px', lineHeight: '14px',
                    }}>
                      {unread}
                    </span>
                  )}
                  <span style={{ color: isActive ? '#00B4D8' : '#4A6080' }}>{icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, marginTop: 4, letterSpacing: 0.2 }}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    );
  }

  // ─── Desktop layout ───────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#0A1628' }}>
      {/* Sidebar */}
      <aside style={{
        width: 240, flexShrink: 0, background: '#0D1E35',
        borderRight: '1px solid #1E3050',
        display: 'flex', flexDirection: 'column', padding: '0 0 24px',
      }}>
        <div style={{
          padding: '28px 24px 24px', borderBottom: '1px solid #1E3050',
          fontSize: 20, fontWeight: 800, color: '#00B4D8', letterSpacing: '-0.5px',
        }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#00B4D8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }}>
            <path d="M16 9H3.5M10 4L16 9l-6 5M7 6L2 9l5 3" />
          </svg>
          CockpitHire
          <div style={{ fontSize: 11, color: '#4A6080', fontWeight: 500, marginTop: 2 }}>Aviation Careers Worldwide</div>
        </div>

        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {SIDEBAR_NAV.map(({ to, icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 14px', borderRadius: 10, textDecoration: 'none',
              fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              background: isActive ? '#1B2B4B' : 'transparent',
              color: isActive ? '#00B4D8' : '#7A8CA0',
            })}>
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{icon}</span>
              {label}
              {to === '/alerts' && unread > 0 && (
                <span style={{
                  marginLeft: 'auto', background: '#00B4D8', color: '#0A1628',
                  borderRadius: 10, fontSize: 11, fontWeight: 800, padding: '1px 7px',
                }}>
                  {unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          style={{
            margin: '0 12px', padding: '11px 14px', borderRadius: 10,
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 12,
            color: '#4A6080', fontSize: 14, fontWeight: 600,
          }}
        >
          <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>
            <Ico size={18} extra={<><path d="M7 3H3a1 1 0 00-1 1v10a1 1 0 001 1h4"/><polyline points="12 5 16 9 12 13"/><line x1="16" y1="9" x2="6" y2="9"/></>} />
          </span>
          Sign Out
        </button>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <header style={{
          padding: '16px 32px', borderBottom: '1px solid #1E3050',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#0D1E35', flexShrink: 0,
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{PAGE_TITLES[path] ?? 'CockpitHire'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#7A8CA0' }}>
            <span>{pilot ? `${pilot.firstName} ${pilot.lastName}` : 'Pilot'}</span>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'linear-gradient(135deg, #00B4D8, #0077A8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 13, color: '#fff',
            }}>
              {initials}
            </div>
          </div>
        </header>
        <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
