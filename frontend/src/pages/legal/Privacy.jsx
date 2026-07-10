import React from 'react';
import LegalShell from './LegalShell';

export default function Privacy() {
  return (
    <LegalShell title="Privacy policy" updated="July 2026">
      <p>
        This policy explains what CockpitHire (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects,
        why, and what we do — and never do — with it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details</strong> — name, email address, and password (stored hashed, never in plain text).</li>
        <li><strong>Pilot profile</strong> — licences, ratings, medical class, flight hours, education, work-authorisation countries, and optional details like phone number and passport expiry. You choose what to enter.</li>
        <li><strong>Logbook entries</strong> — flights you record in the digital logbook.</li>
        <li><strong>Usage basics</strong> — which alerts you read or dismiss, and jobs you save, so the product works.</li>
      </ul>

      <h2>Why we collect it</h2>
      <ul>
        <li>To match job listings against your credentials and alert you when you qualify.</li>
        <li>To compute your flight-experience totals from your logbook.</li>
        <li>To build CVs you generate yourself in the CV builder.</li>
        <li>To send push notifications you have enabled, and account emails such as verification.</li>
      </ul>

      <h2>What we never do</h2>
      <ul>
        <li>Your profile is <strong>private by default</strong>. It is never shown to employers, airlines, or other users unless you explicitly choose to share it (for example by applying somewhere yourself).</li>
        <li>We do not sell, rent, or trade your personal data. To anyone.</li>
        <li>We do not handle your job applications — applying always happens on the employer&rsquo;s own site, so your application data goes to them directly, not through us.</li>
        <li>We do not display advertising and do not share data with advertisers.</li>
      </ul>

      <h2>Where your data lives</h2>
      <p>
        Data is stored on managed cloud infrastructure (our database and hosting
        providers) protected by encryption in transit. Access is limited to what is
        needed to operate the service.
      </p>

      <h2>Your rights</h2>
      <p>
        You can view and edit your profile at any time. You can delete your logbook
        entries, saved jobs, and alerts inside the app. To delete your account and all
        associated data entirely, email{' '}
        <a href="mailto:contact@cockpithire.com">contact@cockpithire.com</a> from your
        registered address and we will remove it.
      </p>

      <h2>Job listing data</h2>
      <p>
        Job listings shown on CockpitHire come from public sources — airline career
        sites, government job boards, and licensed job APIs. Every listing links back to
        the original posting. Airline factfile information is compiled from public
        sources and pilot contributions.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes materially, we will note the new date at the top of this
        page. Questions: <a href="mailto:contact@cockpithire.com">contact@cockpithire.com</a>.
      </p>
    </LegalShell>
  );
}
