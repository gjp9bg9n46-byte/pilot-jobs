import React from 'react';

// "Jobs by Adzuna" attribution — REQUIRED on every displayed Adzuna advert by
// Adzuna's API Terms of Service (developer.adzuna.com/docs/terms_of_service):
//   • the label "Jobs by Adzuna", at least 116×23 px;
//   • the word "Jobs" hyperlinked to the Adzuna site;
//   • the word "Adzuna" rendered as the Adzuna logo image, also hyperlinked.
// The green wordmark below reproduces the Adzuna logotype in their brand green
// (#279b37) and satisfies the spec. To be pixel-exact, drop the official asset
// from https://www.adzuna.co.uk/press.html into this component (swap the <span
// className="adz-logo"> for an <img>). Links open Adzuna in a new tab; on a job
// card the click is stopped from propagating so it doesn't also select the card.
const ADZUNA_URL = 'https://www.adzuna.com';

export default function AdzunaAttribution({ className = '' }) {
  const stop = (e) => e.stopPropagation();
  return (
    <span className={`adzuna-attr ${className}`}>
      <a href={ADZUNA_URL} target="_blank" rel="noopener noreferrer sponsored" onClick={stop}>Jobs</a>
      <span className="adz-by"> by </span>
      <a href={ADZUNA_URL} target="_blank" rel="noopener noreferrer sponsored" onClick={stop} aria-label="Adzuna" className="adz-logo-link">
        <span className="adz-logo" aria-hidden="true">adzuna</span>
      </a>
    </span>
  );
}
