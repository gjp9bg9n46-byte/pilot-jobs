import React from 'react';
import LegalShell from './LegalShell';

export default function Terms() {
  return (
    <LegalShell title="Terms &amp; conditions" updated="July 2026">
      <p>
        These terms govern your use of CockpitHire (cockpithire.com and the CockpitHire
        mobile app). By creating an account or using the service you agree to them.
      </p>

      <h2>The service</h2>
      <p>
        CockpitHire is a job-discovery and career platform for pilots. We aggregate
        publicly available job listings, match them against the profile you provide, and
        offer tools such as alerts, a digital logbook, airline factfiles, and a CV
        builder. The service is provided free of charge to pilots.
      </p>

      <h2>Job listings and applications</h2>
      <ul>
        <li>Listings originate from third-party sources — airline career sites, government job boards, and licensed job APIs. Each listing links to the original posting.</li>
        <li>We do not control third-party postings and cannot guarantee that a listing is accurate, current, or still open. Always verify details on the employer&rsquo;s own site.</li>
        <li>Applications happen on the employer&rsquo;s site, not through CockpitHire. We are not a recruitment agency and are not a party to any hiring decision or employment relationship.</li>
      </ul>

      <h2>Match scores and factfiles</h2>
      <p>
        Match percentages, requirement extraction, and airline factfile data (including
        pay ranges and hiring status) are computed from listings and public or
        community-contributed information. They are informational aids, not guarantees.
        Do not rely on them as the sole basis for career or financial decisions.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must provide accurate information and keep your credentials secure. You are responsible for activity on your account.</li>
        <li>You must be legally able to work as a pilot or be pursuing that qualification; the service is not directed at children.</li>
        <li>Community contributions (such as airline intel) must be truthful, lawful, and free of confidential or proprietary information you have no right to share.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>
        You may not scrape, bulk-download, or redistribute the site&rsquo;s data;
        interfere with the service; attempt to access other users&rsquo; data; or use the
        service for anything unlawful.
      </p>

      <h2>Liability</h2>
      <p>
        The service is provided &ldquo;as is&rdquo; without warranties of any kind. To the
        maximum extent permitted by law, CockpitHire is not liable for indirect or
        consequential losses, missed job opportunities, or decisions made in reliance on
        listings, match scores, or factfile data.
      </p>

      <h2>Termination</h2>
      <p>
        You can stop using the service and request account deletion at any time. We may
        suspend accounts that violate these terms.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms; material changes will be reflected in the date above.
        Questions: <a href="mailto:contact@cockpithire.com">contact@cockpithire.com</a>.
      </p>
    </LegalShell>
  );
}
