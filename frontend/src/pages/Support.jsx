import React, { useState } from 'react';
import { LightPage, Card, Badge } from '../components/primitives';

const FAQS = [
  {
    q: 'How does job matching work?',
    a: 'CockpitHire compares your pilot profile — licences, type ratings, medical, flight hours, and issuing authority — against each job\'s published requirements. Each job receives a match score from 0–100%. The breakdown shows what matched, what\'s marginal, and what\'s missing. Use the "Qualified only" toggle on the Jobs tab to filter out jobs you don\'t meet the hard requirements for.',
  },
  {
    q: 'What are job alerts and how do I manage them?',
    a: 'When a new job is posted that matches your profile, CockpitHire creates a job alert and (if enabled) sends a push notification. View all alerts on the Alerts tab. You can mark alerts as read, dismiss ones you\'re not interested in, or save jobs you want to revisit. Alert matching is intentionally lenient — it casts a wide net. Use the Qualified only filter on the Jobs tab for a stricter view.',
  },
  {
    q: 'What does my match score mean?',
    a: 'The match score (0–100%) reflects how well your qualifications align with a job\'s requirements. Certificates and issuing authority are hard requirements (failing either disqualifies the match). Hours, type ratings, and medical class contribute soft points. The breakdown — visible in the job detail — lists each criterion as matched, marginal, or missing.',
  },
  {
    q: 'How often are jobs updated?',
    a: 'Our scraper runs regularly across monitored airline career boards, ATC boards, and aviation platforms. New postings appear on your Jobs tab within hours of going live.',
  },
  {
    q: 'Why am I not seeing any matches?',
    a: 'Matches are calculated from your profile. Make sure you\'ve added your licences, type ratings, medical certificate, and flight hours in the Profile tab. The more complete your profile, the more accurate your matches. Also check that your licence issuing authority is correct (e.g. EASA or FAA, not ICAO) — the authority field is used to filter jobs by regulatory region.',
  },
  {
    q: 'What is the CV Builder?',
    a: 'The CV Builder (CV tab) generates a professional aviation CV as a downloadable PDF. Your profile data — name, licences, type ratings, medical, logbook hours, and right-to-work — flows in automatically. You can add a summary, skills, and languages, choose a colour theme, and select from two CV template styles. Your CV always reflects your current profile; no manual syncing needed.',
  },
  {
    q: 'How do I import my existing logbook?',
    a: 'Go to the Logbook tab and click "Import". Export your flights as a CSV from your existing logbook app and upload it. Your flights and totals will be merged automatically.',
  },
  {
    q: 'What does "carry-forward hours" mean?',
    a: 'If you flew before using CockpitHire, those hours won\'t appear in our logbook. Use "Previous / carry-forward hours" in the Logbook tab to enter your prior totals — they\'re added to your live totals and used for job matching.',
  },
  {
    q: 'What is Right to Work tracking?',
    a: 'The Right to Work section on your Profile lets you record the countries you\'re authorised to work in and the supporting documents (passport, visa, residency permit, etc.). This data feeds into job matching — some postings require work authorisation for a specific country or region.',
  },
  {
    q: 'Is my profile visible to airlines?',
    a: 'No, by default your profile is private. You can control visibility in Settings → Privacy. Even when visible, airlines only see your qualifications — not your personal contact details unless you apply.',
  },
  {
    q: 'What is ICAO ELP and why does it matter?',
    a: 'ICAO English Language Proficiency (ELP) is a mandatory certification for pilots operating internationally. Level 4 is the minimum for most international ops; Level 6 has no expiry. Add your ELP level under Profile → Licences (ELP tab). Most airlines require you to declare your ELP level.',
  },
  {
    q: 'How do I delete my account?',
    a: 'Go to Settings → Danger Zone → Delete Account. This permanently removes all your data. This action cannot be undone.',
  },
];

const CONTACTS = [
  { label: 'General Support', sub: 'Questions, bugs, account issues', href: 'mailto:support@cockpithire.com', btn: 'Email us' },
  { label: 'Report a Job Listing', sub: 'Outdated, inaccurate, or suspicious posting', href: 'mailto:listings@cockpithire.com', btn: 'Report' },
  { label: 'Partnership Enquiries', sub: 'Airlines, flight schools, and aviation businesses', href: 'mailto:partnerships@cockpithire.com', btn: 'Get in touch' },
];

const ABOUT = [
  { label: 'Platform', sub: 'Web application', badge: 'Beta', variant: 'info' },
  { label: 'Mobile App', sub: 'iOS & Android', badge: 'Coming soon', variant: 'neutral' },
  { label: 'Data Sources', sub: 'Airline career boards, ATC portals, aviation job boards', badge: null },
];

const css = {
  cardTitle: { fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 4 },
  cardSub: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 },
  linkRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--border)' },
  linkLabel: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  linkSub: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 },
};

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '16px 0', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}
      >
        {q}
        <span style={{ color: 'var(--accent)', fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{open ? '−' : '+'}</span>
      </div>
      {open && <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, paddingBottom: 16 }}>{a}</div>}
    </div>
  );
}

// mailto contact styled to match Button variant="secondary" tokens (border → accent on hover)
function ContactLink({ href, children }) {
  const [hover, setHover] = useState(false);
  return (
    <a
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'inline-block', flexShrink: 0, background: 'var(--surface)', border: `1px solid ${hover ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '10px 16px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap', transition: 'border-color 0.15s ease' }}
    >
      {children}
    </a>
  );
}

export default function Support() {
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
          {FAQS.map((item) => <FaqItem key={item.q} q={item.q} a={item.a} />)}
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

        {/* App info */}
        <Card style={{ padding: 28, marginBottom: 24 }}>
          <div style={css.cardTitle}>About CockpitHire</div>
          <div style={css.cardSub}>Platform information and version details.</div>
          <div>
            {ABOUT.map((item) => (
              <div key={item.label} style={{ ...css.linkRow, alignItems: 'flex-start' }}>
                <div>
                  <div style={css.linkLabel}>{item.label}</div>
                  <div style={css.linkSub}>{item.sub}</div>
                </div>
                {item.badge && <Badge variant={item.variant}>{item.badge}</Badge>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </LightPage>
  );
}
