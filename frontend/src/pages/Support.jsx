import React, { useState } from 'react';

const css = {
  card: { background: '#0D1E35', border: '1px solid #1E3050', borderRadius: 16, padding: 28, marginBottom: 24 },
  title: { fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#4A6080', marginBottom: 20 },
  faqItem: { borderBottom: '1px solid #1E3050', paddingBottom: 0 },
  faqQ: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 0', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#fff',
  },
  faqA: { fontSize: 13, color: '#7A8CA0', lineHeight: 1.7, paddingBottom: 16 },
  linkRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 0', borderBottom: '1px solid #1B2B4B',
  },
  linkLabel: { fontSize: 14, fontWeight: 600, color: '#fff' },
  linkSub: { fontSize: 12, color: '#7A8CA0', marginTop: 2 },
  linkBtn: {
    background: '#1B2B4B', border: '1px solid #243050', borderRadius: 8,
    padding: '7px 16px', color: '#00B4D8', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', textDecoration: 'none', display: 'inline-block',
  },
  badge: {
    background: 'rgba(0,180,216,0.12)', border: '1px solid rgba(0,180,216,0.3)',
    color: '#00B4D8', borderRadius: 20, fontSize: 11, fontWeight: 700,
    padding: '3px 10px', letterSpacing: 0.3,
  },
};

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

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={css.faqItem}>
      <div style={css.faqQ} onClick={() => setOpen((v) => !v)}>
        {q}
        <span style={{ color: '#00B4D8', fontSize: 18, lineHeight: 1 }}>{open ? '−' : '+'}</span>
      </div>
      {open && <div style={css.faqA}>{a}</div>}
    </div>
  );
}

export default function Support() {
  return (
    <div>
      {/* FAQ */}
      <div style={css.card}>
        <div style={css.title}>Frequently Asked Questions</div>
        <div style={css.subtitle}>Answers to the most common questions about CockpitHire.</div>
        {FAQS.map((item) => <FaqItem key={item.q} q={item.q} a={item.a} />)}
      </div>

      {/* Contact */}
      <div style={css.card}>
        <div style={css.title}>Contact & Feedback</div>
        <div style={css.subtitle}>We read every message — usually reply within 24 hours.</div>
        <div>
          {[
            { label: 'General Support', sub: 'Questions, bugs, account issues', href: 'mailto:support@cockpithire.com', btn: 'Email us' },
            { label: 'Report a Job Listing', sub: 'Outdated, inaccurate, or suspicious posting', href: 'mailto:listings@cockpithire.com', btn: 'Report' },
            { label: 'Partnership Enquiries', sub: 'Airlines, flight schools, and aviation businesses', href: 'mailto:partnerships@cockpithire.com', btn: 'Get in touch' },
          ].map((item) => (
            <div key={item.label} style={css.linkRow}>
              <div>
                <div style={css.linkLabel}>{item.label}</div>
                <div style={css.linkSub}>{item.sub}</div>
              </div>
              <a href={item.href} style={css.linkBtn}>{item.btn}</a>
            </div>
          ))}
        </div>
      </div>

      {/* App info */}
      <div style={css.card}>
        <div style={css.title}>About CockpitHire</div>
        <div style={css.subtitle}>Platform information and version details.</div>
        <div>
          {[
            { label: 'Platform', sub: 'Web application', badge: 'Beta' },
            { label: 'Mobile App', sub: 'iOS & Android', badge: 'Coming soon' },
            { label: 'Data Sources', sub: 'Airline career boards, ATC portals, aviation job boards', badge: null },
          ].map((item) => (
            <div key={item.label} style={{ ...css.linkRow, alignItems: 'flex-start' }}>
              <div>
                <div style={css.linkLabel}>{item.label}</div>
                <div style={css.linkSub}>{item.sub}</div>
              </div>
              {item.badge && <span style={css.badge}>{item.badge}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
