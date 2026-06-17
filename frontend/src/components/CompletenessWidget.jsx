import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { profileApi, cvApi } from '../services/api';
import { Card } from './primitives';

// ── Completeness model ────────────────────────────────────────────────────────
// Two tiers: Core categories drive the headline %; Recommended are shown +
// encouraged but excluded from the number (a high-hour captain with no type
// rating is still very employable). All computed client-side from the existing
// GET /profile call + one GET /cv (which returns .totals and .cv together).
// Preferences + Notifications are intentionally deferred until the backend
// schema cluster lands (their save path 500s today → nothing to read).
function buildCategories(profile, cv, totals) {
  const certs = profile?.certificates || [];
  const nonElp = certs.filter((c) => c.type !== 'ELP');
  const elp = certs.filter((c) => c.type === 'ELP');
  const medicals = profile?.medicals || [];
  const rtw = profile?.rightToWork || [];
  const ratings = profile?.ratings || [];
  const training = profile?.trainingRecords || [];
  const totalTime = totals?.totalTime || 0;

  const c = cv || {};
  const cvBuilt =
    !!(c.summary && String(c.summary).trim()) ||
    ['education', 'languages', 'skills', 'typeRatings', 'licenses'].some(
      (k) => Array.isArray(c[k]) && c[k].length > 0,
    );

  const core = [
    {
      key: 'personal', label: 'Personal info', to: '/profile',
      done: !!(profile?.role && profile?.nationality),
      hint: (profile?.role && profile?.nationality) ? 'Role + nationality set' : 'Add your role and nationality',
    },
    {
      key: 'licences', label: 'Licences', to: '/profile',
      done: nonElp.length > 0,
      hint: nonElp.length > 0 ? `${nonElp.length} on file` : 'No licences yet',
    },
    {
      key: 'medical', label: 'Medical', to: '/profile',
      done: medicals.length > 0,
      hint: medicals.length > 0 ? `${medicals.length} on file` : 'No medical on file',
    },
    {
      key: 'elp', label: 'English proficiency', to: '/profile',
      done: elp.length > 0,
      hint: elp.length > 0 ? 'On file' : 'No ELP record yet',
    },
    {
      key: 'rtw', label: 'Right to work', to: '/profile',
      done: rtw.length > 0,
      hint: rtw.length > 0 ? `${rtw.length} ${rtw.length === 1 ? 'entry' : 'entries'}` : 'No entries yet',
    },
    {
      key: 'logbook', label: 'Logbook', to: '/logbook',
      done: totalTime > 0,
      hint: totalTime > 0 ? `${Math.round(totalTime).toLocaleString()} h logged` : 'No hours logged yet',
    },
    {
      key: 'cv', label: 'CV', to: '/cv',
      done: cvBuilt,
      hint: cvBuilt ? 'Built' : 'Not built yet',
    },
  ];

  const recommended = [
    {
      key: 'ratings', label: 'Type ratings', to: '/profile',
      done: ratings.length > 0,
      hint: ratings.length > 0 ? `${ratings.length} on file` : 'Add your type ratings',
    },
    {
      key: 'recurrent', label: 'Recurrent training', to: '/profile',
      done: training.length > 0,
      hint: training.length > 0 ? `${training.length} on file` : 'None logged yet',
    },
  ];

  return { core, recommended };
}

// ── Progress ring (SVG, no chart lib) ──────────────────────────────────────────
function Ring({ pct, size = 64, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  return (
    <svg width={size} height={size} role="img" aria-label={`${pct}% complete`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, fill: 'var(--text-primary)' }}>
        {pct}%
      </text>
    </svg>
  );
}

// ── Status glyph ────────────────────────────────────────────────────────────────
function StatusGlyph({ done }) {
  return done ? (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="9" cy="9" r="9" fill="var(--accent)" />
      <path d="M5 9.2l2.6 2.6L13 6.4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="9" cy="9" r="8" fill="none" stroke="var(--border)" strokeWidth="1.5" />
    </svg>
  );
}

const css = {
  card: { padding: 24, marginBottom: 24 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 },
  title: { fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em', marginBottom: 4 },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 },
  rowLabel: { fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 },
  rowHint: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 },
  arrow: { fontSize: 16, color: 'var(--text-secondary)', flexShrink: 0 },
  sectionLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '16px 0 4px', paddingTop: 16, borderTop: '1px solid var(--border)' },
  collapsedBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 20px', marginBottom: 24, background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 12 },
  link: { background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)', padding: 0 },
};

function Row({ cat }) {
  return (
    <Link
      to={cat.to}
      className="completeness-row"
      aria-label={`${cat.label}: ${cat.done ? 'complete' : 'incomplete'}. ${cat.hint}`}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px', borderRadius: 8, color: 'inherit' }}
    >
      <StatusGlyph done={cat.done} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={css.rowLabel}>{cat.label}</div>
        <div style={css.rowHint}>{cat.hint}</div>
      </div>
      <span className="completeness-arrow" style={css.arrow} aria-hidden="true">→</span>
    </Link>
  );
}

export default function CompletenessWidget() {
  const [profile, setProfile] = useState(null);
  const [cv, setCv] = useState(null);
  const [totals, setTotals] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false); // for the 100% collapsed state

  useEffect(() => {
    let alive = true;
    Promise.all([
      profileApi.get().then((r) => r.data).catch(() => null),
      cvApi.getData().then((r) => r.data).catch(() => null),
    ]).then(([p, cvRes]) => {
      if (!alive) return;
      setProfile(p);
      setCv(cvRes?.cv ?? null);
      setTotals(cvRes?.totals ?? null);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  if (!loaded) return null; // avoid layout flash; render nothing until data is in

  const { core, recommended } = buildCategories(profile, cv, totals);
  const doneCount = core.filter((c) => c.done).length;
  const pct = Math.round((doneCount / core.length) * 100);

  // 100% → collapse to a persistent confirmation bar (expandable to re-check).
  if (pct === 100 && !expanded) {
    return (
      <div style={css.collapsedBar}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#166534' }}>✓ Profile complete.</span>
        <button type="button" style={{ ...css.link, color: '#166534' }} onClick={() => setExpanded(true)}>
          View checklist
        </button>
      </div>
    );
  }

  const subtitle = pct === 0
    ? "Let's get you set up — finish these to start matching."
    : pct === 100
      ? 'All set — every section is complete.'
      : 'Finish these to improve your match quality.';

  return (
    <Card style={css.card}>
      <div style={css.header}>
        <div>
          <div style={css.title}>Profile completeness</div>
          <div style={css.subtitle}>{subtitle}</div>
        </div>
        <Ring pct={pct} />
      </div>

      <div>
        {core.map((cat) => <Row key={cat.key} cat={cat} />)}
      </div>

      <div style={css.sectionLabel}>Recommended</div>
      <div>
        {recommended.map((cat) => <Row key={cat.key} cat={cat} />)}
      </div>
    </Card>
  );
}
