import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../store';

const NAV = [
  { to: '/jobs',    icon: '💼', label: 'Job Openings'  },
  { to: '/alerts',  icon: '🔔', label: 'My Alerts'     },
  { to: '/logbook', icon: '📖', label: 'Flight Logbook' },
  { to: '/profile', icon: '👤', label: 'My Profile'    },
];

const css = {
  shell: { display: 'flex', height: '100vh', overflow: 'hidden', background: '#0A1628' },

  sidebar: {
    width: 240, flexShrink: 0, background: '#0D1E35',
    borderRight: '1px solid #1E3050',
    display: 'flex', flexDirection: 'column', padding: '0 0 24px',
  },
  logo: {
    padding: '28px 24px 24px', borderBottom: '1px solid #1E3050',
    fontSize: 20, fontWeight: 800, color: '#00B4D8', letterSpacing: '-0.5px',
  },
  logoSub: { fontSize: 11, color: '#4A6080', fontWeight: 500, marginTop: 2 },

  nav: { flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 },
  navLink: (active) => ({
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '11px 14px', borderRadius: 10, textDecoration: 'none',
    fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
    background: active ? '#1B2B4B' : 'transparent',
    color: active ? '#00B4D8' : '#7A8CA0',
    border: 'none', width: '100%', textAlign: 'left',
  }),
  navIcon: { fontSize: 16, width: 20, textAlign: 'center' },

  logoutBtn: {
    margin: '0 12px', padding: '11px 14px', borderRadius: 10,
    background: 'transparent', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 12,
    color: '#4A6080', fontSize: 14, fontWeight: 600, transition: 'color 0.15s',
  },

  main: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' },
  topbar: {
    padding: '16px 32px', borderBottom: '1px solid #1E3050',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: '#0D1E35', flexShrink: 0,
  },
  pageTitle: { fontSize: 20, fontWeight: 800, color: '#fff' },
  pilotTag: {
    display: 'flex', alignItems: 'center', gap: 10,
    fontSize: 13, color: '#7A8CA0',
  },
  avatar: {
    width: 34, height: 34, borderRadius: '50%',
    background: 'linear-gradient(135deg, #00B4D8, #0077A8)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: 13, color: '#fff',
  },
  content: { flex: 1, padding: '32px', overflowY: 'auto' },
};

const PAGE_TITLES = { '/jobs': 'Job Openings', '/alerts': 'My Alerts', '/logbook': 'Flight Logbook', '/profile': 'My Profile' };

export default function Layout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const pilot = useSelector((s) => s.auth.pilot);
  const alerts = useSelector((s) => s.jobs.alerts);
  const unread = alerts.filter((a) => !a.readAt).length;
  const path = window.location.pathname;

  const handleLogout = () => { dispatch(logout()); navigate('/login'); };

  const initials = pilot
    ? `${pilot.firstName?.[0] ?? ''}${pilot.lastName?.[0] ?? ''}`.toUpperCase()
    : '?';

  return (
    <div style={css.shell}>
      {/* Sidebar */}
      <aside style={css.sidebar}>
        <div style={css.logo}>
          ✈ CockpitHire
          <div style={css.logoSub}>Aviation Careers Worldwide</div>
        </div>

        <nav style={css.nav}>
          {NAV.map(({ to, icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => css.navLink(isActive)}>
              <span style={css.navIcon}>{icon}</span>
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

        <button style={css.logoutBtn} onClick={handleLogout}>
          <span style={css.navIcon}>🚪</span> Sign Out
        </button>
      </aside>

      {/* Main */}
      <div style={css.main}>
        <header style={css.topbar}>
          <div style={css.pageTitle}>{PAGE_TITLES[path] ?? 'CockpitHire'}</div>
          <div style={css.pilotTag}>
            <span>{pilot ? `${pilot.firstName} ${pilot.lastName}` : 'Pilot'}</span>
            <div style={css.avatar}>{initials}</div>
          </div>
        </header>
        <div style={css.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
