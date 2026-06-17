import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LightPage, Card, Badge, Input } from '../components/primitives';
import pkg from '../../package.json';

// FAQs grouped by category. `slug` powers deep-links (/support#faq-<slug>) — keep
// stable once shipped (support replies + in-app help link to them).
const FAQS = [
  // ── Jobs & Matching ──
  { cat: 'Jobs & Matching', slug: 'how-job-matching-works', q: 'How does job matching work?',
    a: 'CockpitHire compares your pilot profile — licences, type ratings, medical, flight hours, and issuing authority — against each job\'s published requirements. Each job receives a match score from 0–100%. The breakdown shows what matched, what\'s marginal, and what\'s missing. Use the "Qualified only" toggle on the Jobs tab to filter out jobs you don\'t meet the hard requirements for.' },
  { cat: 'Jobs & Matching', slug: 'match-score-meaning', q: 'What does my match score mean?',
    a: 'The match score (0–100%) reflects how well your qualifications align with a job\'s requirements. Certificates and issuing authority are hard requirements (failing either disqualifies the match). Hours, type ratings, and medical class contribute soft points. The breakdown — visible in the job detail — lists each criterion as matched, marginal, or missing.' },
  { cat: 'Jobs & Matching', slug: 'job-alerts', q: 'What are job alerts and how do I manage them?',
    a: 'When a new job is posted that matches your profile, CockpitHire creates a job alert and (if enabled) sends a push notification. View all alerts on the Alerts tab. You can mark alerts as read, dismiss ones you\'re not interested in, or save jobs you want to revisit. Alert matching is intentionally lenient — it casts a wide net. Use the Qualified only filter on the Jobs tab for a stricter view.' },
  { cat: 'Jobs & Matching', slug: 'how-often-jobs-updated', q: 'How often are jobs updated?',
    a: 'Our scraper runs across monitored airline career boards, ATC boards, and aviation platforms. New postings typically appear on your Jobs tab within a day of going live.' },
  { cat: 'Jobs & Matching', slug: 'no-matches', q: 'Why am I not seeing any matches?',
    a: 'Matches are calculated from your profile. Make sure you\'ve added your licences, type ratings, medical certificate, and flight hours in the Profile tab. The more complete your profile, the more accurate your matches. Also check that your licence issuing authority is correct (e.g. EASA or FAA, not ICAO) — the authority field is used to filter jobs by regulatory region.' },

  // ── Your Profile ──
  { cat: 'Your Profile', slug: 'right-to-work', q: 'What is Right to Work tracking?',
    a: 'The Right to Work section on your Profile lets you record the countries you\'re authorised to work in and the supporting documents (passport, visa, residency permit, etc.). This data feeds into job matching — some postings require work authorisation for a specific country or region.' },
  { cat: 'Your Profile', slug: 'icao-elp', q: 'What is ICAO ELP and why does it matter?',
    a: 'ICAO English Language Proficiency (ELP) is a mandatory certification for pilots operating internationally. Level 4 is the minimum for most international ops; Level 6 has no expiry. Add your ELP level under Profile → Licences (ELP tab). Most airlines require you to declare your ELP level.' },

  // ── CV & Logbook ──
  { cat: 'CV & Logbook', slug: 'cv-builder', q: 'What is the CV Builder?',
    a: 'The CV Builder (CV tab) generates a professional aviation CV as a downloadable PDF. Your profile data — name, licences, type ratings, medical, logbook hours, and right-to-work — flows in automatically. You can add a summary, skills, and languages, choose a colour theme, and select from two CV template styles. Your CV always reflects your current profile; no manual syncing needed.' },
  { cat: 'CV & Logbook', slug: 'import-logbook', q: 'How do I import my existing logbook?',
    a: 'Go to the Logbook tab and click "Import". Export your flights as a CSV from your existing logbook app and upload it. Your flights and totals will be merged automatically.' },
  { cat: 'CV & Logbook', slug: 'carry-forward-hours', q: 'What does "carry-forward hours" mean?',
    a: 'If you flew before using CockpitHire, those hours won\'t appear in our logbook. Use "Previous / carry-forward hours" in the Logbook tab to enter your prior totals — they\'re added to your live totals and used for job matching.' },

  // ── Account & Privacy ──
  { cat: 'Account & Privacy', slug: 'profile-visibility', q: 'Is my profile visible to airlines?',
    a: 'By default your profile is visible to airlines and recruiters, who can see your qualifications — but never your personal contact details unless you apply. You can change this any time in Settings → Privacy.' },
  { cat: 'Account & Privacy', slug: 'delete-account', q: 'How do I delete my account?',
    a: 'Go to Settings → Danger Zone → Delete Account. This permanently removes all your data. This action cannot be undone.' },
];

const CAT_ORDER = ['Jobs & Matching', 'Your Profile', 'CV & Logbook', 'Account & Privacy'];

const CONTACTS = [
  { label: 'General Support', sub: 'Questions, bugs, account issues', href: 'mailto:support@cockpithire.com', btn: 'Email us' },
  { label: 'Report a Job Listing', sub: 'Outdated, inaccurate, or suspicious posting', href: 'mailto:listings@cockpithire.com', btn: 'Report' },
  { label: 'Partnership Enquiries', sub: 'Airlines, flight schools, and aviation businesses', href: 'mailto:partnerships@cockpithire.com', btn: 'Get in touch' },
];

const WHATS_NEW = [
  '468 airline factfiles with fleet, hubs, and contributor-edited data',
  'Pilot-editable fleet contributions',
  'Dedicated job detail pages with personalised match scoring',
  'CV Builder with two template styles',
];

const css = {
  cardTitle: { fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 4 },
  cardSub: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 },
  linkRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--border)' },
  linkLabel: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  linkSub: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 },
  catLabel: { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '20px 0 2px' },
  faqHeaderBtn: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
    width: '100%', padding: '16px 0', cursor: 'pointer', fontSize: 14, fontWeight: 600,
    color: 'var(--text-primary)', background: 'none', border: 'none', textAlign: 'left',
    fontFamily: 'var(--font-body)',
  },
};

function FaqItem({ item, defaultOpen, highlighted }) {
  const [open, setOpen] = useState(defaultOpen);
  const headerId = `faq-header-${item.slug}`;
  const contentId = `faq-content-${item.slug}`;
  return (
    <div
      id={`faq-${item.slug}`}
      style={{
        borderBottom: '1px solid var(--border)', borderRadius: 6, scrollMarginTop: 16,
        background: highlighted ? 'rgba(0,63,136,0.06)' : 'transparent',
        transition: 'background 0.6s ease',
      }}
    >
      <button
        type="button"
        className="faq-header"
        id={headerId}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((v) => !v)}
        style={css.faqHeaderBtn}
      >
        {item.q}
        <span aria-hidden="true" style={{ color: 'var(--accent)', fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div id={contentId} role="region" aria-labelledby={headerId}
          style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, paddingBottom: 16 }}>
          {item.a}
        </div>
      )}
    </div>
  );
}

// mailto contact styled to match Button variant="secondary" tokens (border → accent on hover/focus)
function ContactLink({ href, children }) {
  const [hover, setHover] = useState(false);
  return (
    <a
      href={href}
      className="support-contact"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'inline-block', flexShrink: 0, background: 'var(--surface)', border: `1px solid ${hover ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '10px 16px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap', transition: 'border-color 0.15s ease' }}
    >
      {children}
    </a>
  );
}

export default function Support() {
  const [query, setQuery] = useState('');
  // Deep-link target read once on mount (#faq-<slug>); drives auto-expand + highlight.
  const [hashSlug, setHashSlug] = useState(() =>
    (typeof window !== 'undefined' && window.location.hash.startsWith('#faq-'))
      ? window.location.hash.slice('#faq-'.length) : null,
  );

  useEffect(() => {
    if (!hashSlug) return undefined;
    // Scroll the targeted FAQ into view after render, then fade the highlight.
    const el = document.getElementById(`faq-${hashSlug}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setHashSlug(null), 1800);
    return () => clearTimeout(t);
  }, [hashSlug]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => q ? FAQS.filter((f) => (f.q + ' ' + f.a).toLowerCase().includes(q)) : FAQS,
    [q],
  );

  return (
    <LightPage style={{ fontFamily: 'var(--font-body)' }}>
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 8 }}>
          Support
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 32 }}>
          Help, contact, and what we're building.
        </p>

        {/* FAQ */}
        <Card style={{ padding: 28, marginBottom: 24 }}>
          <div style={css.cardTitle}>Frequently Asked Questions</div>
          <div style={css.cardSub}>Answers to the most common questions about CockpitHire.</div>

          <div style={{ marginBottom: 4 }}>
            <Input
              type="search"
              aria-label="Search FAQs"
              placeholder="Search FAQs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '24px 0 8px', fontSize: 14, color: 'var(--text-secondary)' }}>
              No FAQs match your search.{' '}
              <button type="button" onClick={() => setQuery('')}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14 }}>
                Clear search
              </button>
            </div>
          ) : (
            CAT_ORDER.map((cat) => {
              const items = filtered.filter((f) => f.cat === cat);
              if (items.length === 0) return null; // hide empty categories when filtering
              return (
                <div key={cat}>
                  <div style={css.catLabel}>{cat}</div>
                  {items.map((item) => (
                    <FaqItem key={item.slug} item={item} defaultOpen={item.slug === hashSlug} highlighted={item.slug === hashSlug} />
                  ))}
                </div>
              );
            })
          )}
        </Card>

        {/* Contact */}
        <Card style={{ padding: 28, marginBottom: 24 }}>
          <div style={css.cardTitle}>Contact &amp; Feedback</div>
          <div style={css.cardSub}>We read every message — usually reply within 24 hours.</div>
          <div>
            {CONTACTS.map((item) => (
              <div key={item.label} style={css.linkRow}>
                <div>
                  <div style={css.linkLabel}>{item.label}</div>
                  <div style={css.linkSub}>{item.sub}</div>
                </div>
                <ContactLink href={item.href}>{item.btn}</ContactLink>
              </div>
            ))}
          </div>
        </Card>

        {/* About */}
        <Card style={{ padding: 28, marginBottom: 24 }}>
          <div style={css.cardTitle}>About CockpitHire</div>
          <div style={css.cardSub}>What CockpitHire is, and what's new.</div>

          <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7, marginTop: 0, marginBottom: 20 }}>
            A job-matching platform for professional pilots — aggregating cockpit vacancies worldwide and
            scoring them against your licences, ratings, medical, and hours.
          </p>

          <div style={css.catLabel}>What's new</div>
          <ul style={{ margin: '8px 0 20px', paddingLeft: 18, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7 }}>
            {WHATS_NEW.map((w) => <li key={w} style={{ marginBottom: 4 }}>{w}</li>)}
          </ul>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div>
              <div style={css.linkLabel}>Web app <Badge variant="info">Beta</Badge></div>
              <div style={css.linkSub}>Version {pkg.version} · Mobile app coming soon</div>
            </div>
          </div>
        </Card>
      </div>
    </LightPage>
  );
}
