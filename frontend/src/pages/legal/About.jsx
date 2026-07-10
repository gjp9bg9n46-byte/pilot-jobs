import React from 'react';
import { Link } from 'react-router-dom';
import LegalShell from './LegalShell';

export default function About() {
  return (
    <LegalShell title="About CockpitHire" updated={null}>
      <p>
        CockpitHire is a career platform built for one profession: pilots. Instead of a
        generic job board where cockpit roles drown among thousands of unrelated ads,
        CockpitHire matches every listing against a pilot&rsquo;s actual credentials —
        licences, issuing authority, flight hours, type ratings, and medical class — and
        alerts them the moment a role they qualify for goes live.
      </p>
      <h2>What we do</h2>
      <p>
        We aggregate fixed-wing pilot vacancies from airline career sites, government job
        boards, and licensed job APIs, refresh them several times a day, and remove
        expired or duplicate postings automatically. Alongside the jobs, we maintain
        airline factfiles — fleet composition, bases, hiring status, and pilot-contributed
        intel — for hundreds of carriers worldwide. Pilots also get a digital logbook and
        a CV builder, free.
      </p>
      <h2>What we don&rsquo;t do</h2>
      <p>
        We never sit between a pilot and an employer. Every listing links back to the
        original posting, and applications happen on the employer&rsquo;s own site. A
        pilot&rsquo;s profile is private by default and is never shown to anyone without
        their choice.
      </p>
      <h2>Contact</h2>
      <p>
        Questions, feedback, or partnership enquiries:{' '}
        <a href="mailto:contact@cockpithire.com">contact@cockpithire.com</a>. Pilots can
        also reach us through the <Link to="/support">support page</Link>.
      </p>
    </LegalShell>
  );
}
