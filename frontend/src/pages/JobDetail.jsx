import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { MapPin, AlertTriangle, ArrowLeft } from 'lucide-react';
import { jobApi, profileApi, airlineApi } from '../services/api';
import { LightPage, Card, Button } from '../components/primitives';
import AirlineLogo from '../components/AirlineLogo';
import MatchScore from '../components/MatchScore';
import { computeMatchCount, matchLabel, matchStyle, postedAgo, formatSalary } from '../lib/jobMatch';
import { fetchAirlineMap, resolveAirlineId } from '../lib/airlineLookup';
import { MatchCountBadge, ReqRow } from './Jobs';

// Semantic status colors remapped to light-AA shades (meaning preserved) — mirrors Jobs.jsx.
const SEM = { green: '#166534', amber: '#92400E', red: '#991B1B' };

// Job IDs are UUIDs (they contain hyphens), so we extract the trailing UUID from
// the slug via regex — NOT split('-').pop().
function extractUuid(slugId) {
  return slugId?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)?.[0] ?? null;
}

// react-helmet-async is NOT a dependency, so we set document.title + inject the
// meta/canonical tags manually, cleaning up on unmount.
function useSeo({ title, description, image, canonical }) {
  useEffect(() => {
    if (!title) return undefined;
    const prevTitle = document.title;
    document.title = title;

    const created = [];
    const setMeta = (selector, attrs) => {
      let el = document.head.querySelector(selector);
      if (!el) {
        el = document.createElement(selector.startsWith('link') ? 'link' : 'meta');
        document.head.appendChild(el);
        created.push(el);
      }
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      return el;
    };

    if (description) setMeta('meta[name="description"]', { name: 'description', content: description });
    setMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    if (description) setMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    if (image) setMeta('meta[property="og:image"]', { property: 'og:image', content: image });
    if (canonical) setMeta('link[rel="canonical"]', { rel: 'canonical', href: canonical });

    return () => {
      document.title = prevTitle;
      created.forEach((el) => el.remove());
    };
  }, [title, description, image, canonical]);
}

const css = {
  salary: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 6,
    padding: '5px 12px', fontSize: 13, fontWeight: 700, color: SEM.amber,
  },
  sectionLabel: {
    fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8,
  },
  disclaimer: {
    fontSize: 12, fontStyle: 'italic', color: 'var(--text-secondary)', marginTop: 8,
  },
  primaryCta: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 14,
    padding: '11px 20px', borderRadius: 4, border: '1px solid transparent',
    background: 'var(--accent)', color: '#fff', cursor: 'pointer', textDecoration: 'none',
  },
};

export default function JobDetail() {
  const { slugId } = useParams();
  const token = useSelector((s) => s.auth.token);
  const jobId = extractUuid(slugId);

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [pilotProfile, setPilotProfile] = useState(null);
  const [pilotTotals, setPilotTotals] = useState(null);

  const [airline, setAirline] = useState(null);
  const [airlineMap, setAirlineMap] = useState(null);
  const [saved, setSaved] = useState(false);

  // Fetch the job (public — optional auth). 404 / bad slug → not-found state.
  useEffect(() => {
    if (!jobId) { setNotFound(true); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setNotFound(false);
    jobApi.get(jobId)
      .then(({ data }) => {
        if (!alive) return;
        setJob(data);
        setSaved(!!data.isSaved);
      })
      .catch(() => { if (alive) setNotFound(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [jobId]);

  // Airline factfile lookup. The backend's job.airlineId is an exact name match
  // and misses scraped variants ("aircairo" vs "Air Cairo"), so we resolve the
  // company against the normalised airline map and prefer that, falling back to
  // the backend id. Drives both the factfile link and the header logo/country.
  useEffect(() => { fetchAirlineMap().then(setAirlineMap).catch(() => {}); }, []);
  const airlineId = resolveAirlineId(airlineMap, job?.company) || job?.airlineId || null;

  useEffect(() => {
    if (!airlineId) { setAirline(null); return; }
    let alive = true;
    airlineApi.get(airlineId).then(({ data: a }) => { if (alive) setAirline(a); }).catch(() => {});
    return () => { alive = false; };
  }, [airlineId]);

  // Logged-in: fetch profile + totals for the client-side match.
  useEffect(() => {
    if (!token) return;
    Promise.all([profileApi.get(), profileApi.getTotals()])
      .then(([profileRes, totalsRes]) => {
        setPilotProfile(profileRes.data);
        setPilotTotals(totalsRes.data);
      })
      .catch(() => {}); // non-fatal — match section just won't show
  }, [token]);

  const description = (job?.description || '').slice(0, 160);
  useSeo({
    title: job ? `${job.title} — ${job.company} | CockpitHire` : null,
    description,
    image: airline?.logoUrl || undefined,
    canonical: typeof window !== 'undefined' ? `${window.location.origin}/jobs/${slugId}` : undefined,
  });

  const handleSaveToggle = async () => {
    if (!token) return;
    const currentlySaved = saved;
    setSaved(!currentlySaved);
    try {
      if (currentlySaved) await jobApi.unsaveJob(jobId);
      else await jobApi.saveJob(jobId);
    } catch {
      setSaved(currentlySaved); // revert on error
    }
  };

  if (loading) {
    return (
      <LightPage style={{ fontFamily: 'var(--font-body)' }}>
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--accent)', fontSize: 15 }}>Loading job…</div>
      </LightPage>
    );
  }

  if (notFound || !job) {
    return (
      <LightPage style={{ fontFamily: 'var(--font-body)' }}>
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-secondary)' }}>
          <div style={{ marginBottom: 16 }}><AlertTriangle size={48} color={SEM.amber} /></div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 8 }}>Job not found</div>
          <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>This role may have been removed or the link is incorrect.</div>
          <Link to="/jobs" style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>← Back to jobs</Link>
        </div>
      </LightPage>
    );
  }

  const matchCount = pilotProfile && pilotTotals ? computeMatchCount(job, pilotProfile, pilotTotals) : null;
  const missing = matchCount?.requirements.filter((r) => !r.matched) ?? [];
  const hasReqs = matchCount && matchCount.total > 0;
  const serverMatch = matchLabel(job.matchScore);

  // The public requirements list (label + reqValue only — the matched/pilot bits
  // are the auth-gated part shown inside the match section). Built from the same
  // computeMatchCount shape using an empty profile so we get every req row.
  const publicReqs = computeMatchCount(job, { certificates: [], ratings: [], medicals: [], rightToWork: [] }, {}).requirements;

  const roleLabel = job.role
    ? ({ CAPTAIN: 'Captain', FIRST_OFFICER: 'First Officer', INSTRUCTOR: 'Instructor', FLIGHT_ENGINEER: 'Flight Engineer' }[job.role] || job.role)
    : null;

  // Expired/inactive detection — guard on whatever fields the payload exposes.
  const expired =
    (job.status && ['CLOSED', 'EXPIRED', 'INACTIVE', 'ARCHIVED'].includes(String(job.status).toUpperCase())) ||
    (job.isActive === false) ||
    (job.expiresAt && new Date(job.expiresAt).getTime() < Date.now());

  const ago = postedAgo(job.postedAt);
  const salaryStr = formatSalary(job);

  const ApplyButton = () => (
    expired ? (
      <Button variant="primary" disabled>Applications closed</Button>
    ) : (
      <a href={job.applyUrl} target="_blank" rel="noreferrer noopener" style={css.primaryCta}>
        View Full Posting &amp; Apply →
      </a>
    )
  );

  const SaveButton = () => (
    token ? (
      <Button variant="secondary" onClick={handleSaveToggle}>
        {saved ? '✓ Saved' : 'Save job'}
      </Button>
    ) : (
      <Link to="/login" style={{ textDecoration: 'none' }}>
        <Button variant="secondary">Sign in to save</Button>
      </Link>
    )
  );

  const CtaCluster = () => (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <ApplyButton />
        <SaveButton />
      </div>
      <div style={css.disclaimer}>Never share bank or credit card details when applying.</div>
    </div>
  );

  return (
    <LightPage style={{ fontFamily: 'var(--font-body)' }}>
      <div style={{ marginBottom: 20 }}>
        <Link to="/jobs" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
          <ArrowLeft size={14} /> Back to jobs
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
        <AirlineLogo logoUrl={airline?.logoUrl} iataCode={airline?.iataCode} name={job.company} box={56} maxW={96} font={16} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, color: 'var(--accent)', fontWeight: 600 }}>{job.company}</span>
            {airline?.country && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>· {airline.country}</span>}
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)', margin: '6px 0 8px' }}>
            {roleLabel || job.title}
          </h1>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)' }}>
            {job.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MapPin size={13} /> {job.location}</span>}
            {job.reqAircraftTypes?.[0] && <span>{job.reqAircraftTypes.join(', ')}</span>}
            {ago && <span>{ago}</span>}
          </div>
        </div>
      </div>

      {salaryStr && (
        <div style={{ marginBottom: 16 }}>
          <span style={css.salary}>$ {salaryStr}</span>
        </div>
      )}

      {job.sourcePlatform === 'EMPLOYER_DIRECT' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 10px', marginBottom: 16 }}>
          Posted directly by employer
        </div>
      )}

      {expired && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: SEM.red, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} color={SEM.red} /> This role is no longer accepting applications.
        </div>
      )}

      {/* Top CTAs */}
      <div style={{ marginBottom: 24 }}>
        <CtaCluster />
        {airlineId && (
          <div style={{ marginTop: 12 }}>
            <Link to={`/airlines/${airlineId}`} style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
              View {airline?.name || job.company} factfile →
            </Link>
          </div>
        )}
      </div>

      {/* Match section */}
      <Card style={{ marginBottom: 24 }}>
        <div style={css.sectionLabel}>Your Match</div>
        {!token ? (
          <div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 14px' }}>
              Sign in to see your match against this role.
            </p>
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <Button>Sign in</Button>
            </Link>
          </div>
        ) : matchCount ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginBottom: hasReqs ? 16 : 0 }}>
              {serverMatch ? (
                <MatchScore size="lg" score={job.matchScore} label={matchStyle(job.matchScore).label} />
              ) : null}
              <MatchCountBadge matched={matchCount.matched} total={matchCount.total} hideIfEmpty={false} />
            </div>

            {hasReqs && (
              <>
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '0 12px' }}>
                  {matchCount.requirements.map((r) => <ReqRow key={r.label} req={r} />)}
                </div>
                {missing.length > 0 && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: SEM.red, fontWeight: 700, marginBottom: 6 }}>WHAT YOU&apos;RE MISSING</div>
                    {missing.map((r) => (
                      <div key={r.label} style={{ fontSize: 12, color: SEM.red, marginBottom: 3 }}>
                        • {r.label}: {r.reqValue}{r.pilotValue ? ` (you have: ${r.pilotValue})` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            Complete your pilot profile to see your match against this role.
          </p>
        )}
      </Card>

      {/* Public requirements list (label + reqValue) */}
      {publicReqs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={css.sectionLabel}>Requirements</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 10 }}>
            {publicReqs.map((r) => (
              <div key={r.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>{r.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.reqValue}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      {job.description && (
        <div style={{ marginBottom: 24 }}>
          <div style={css.sectionLabel}>Job Description</div>
          <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
            {job.description}
          </div>
        </div>
      )}

      {/* Notes / Benefits */}
      {job.notes && (
        <div style={{ marginBottom: 24 }}>
          <div style={css.sectionLabel}>Notes / Benefits</div>
          <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
            {job.notes}
          </div>
        </div>
      )}

      {/* Bottom CTAs */}
      <div style={{ marginTop: 8, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
        <CtaCluster />
      </div>
    </LightPage>
  );
}
