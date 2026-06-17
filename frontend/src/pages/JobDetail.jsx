import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import DOMPurify from 'dompurify';
import { MapPin, AlertTriangle, ArrowLeft } from 'lucide-react';
import { jobApi, profileApi, airlineApi } from '../services/api';
import { LightPage, Card, Button } from '../components/primitives';
import AirlineLogo from '../components/AirlineLogo';
import MatchScore from '../components/MatchScore';
import { computeMatchCount, matchLabel, matchStyle, postedAgo, formatSalary } from '../lib/jobMatch';
import { fetchAirlineMap, resolveAirline } from '../lib/airlineLookup';
import { MatchCountBadge, ReqRow } from './Jobs';

// Semantic status colors remapped to light-AA shades (meaning preserved) — mirrors Jobs.jsx.
const SEM = { green: '#166534', amber: '#92400E', red: '#991B1B' };

// Scraped descriptions arrive as raw HTML. Whitelist safe formatting tags only;
// DOMPurify strips everything else (script/iframe/inline handlers, etc).
const DESC_ALLOWED_TAGS = ['p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'a', 'h2', 'h3', 'h4'];
const DESC_ALLOWED_ATTR = ['href', 'target', 'rel'];

// Force every surviving <a> to open externally (scraped links shouldn't nav within
// the app). DOMPurify's default href sanitization already drops javascript: URIs.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noreferrer noopener');
  }
});

function sanitizeDescription(raw) {
  const clean = DOMPurify.sanitize(raw || '', { ALLOWED_TAGS: DESC_ALLOWED_TAGS, ALLOWED_ATTR: DESC_ALLOWED_ATTR });
  // Plain text (no markup survived) — preserve the line breaks pre-wrap used to show.
  if (!/<[a-z][\s\S]*>/i.test(clean)) return clean.replace(/\n/g, '<br>');
  return clean;
}

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
    fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600,
    letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8,
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

// Collapse long scraped descriptions behind a "Show more" fade. Below the height
// threshold (400px desktop / 320px on ≤640px viewports) it renders fully with no
// control; at/above it, it clamps with a soft fade-to-bg overlay + toggle.
function CollapsibleText({ id, children, style }) {
  const innerRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [collapsible, setCollapsible] = useState(false);
  const [threshold, setThreshold] = useState(400);

  // Measure full content height before paint (no flash of expanded → collapsed).
  useLayoutEffect(() => {
    const th = (typeof window !== 'undefined' && window.innerWidth <= 640) ? 320 : 400;
    setThreshold(th);
    const h = innerRef.current?.scrollHeight ?? 0;
    setCollapsible(h >= th);
  }, [children]);

  const collapsed = collapsible && !expanded;

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    // Re-collapse → bring the description top back into view.
    if (!next) requestAnimationFrame(() => innerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <div
          id={id}
          ref={innerRef}
          style={{ ...style, maxHeight: collapsed ? threshold : 'none', overflow: collapsed ? 'hidden' : 'visible' }}
        >
          {children}
        </div>
        {collapsed && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, height: 60,
              // --bg is #F8F6F1; rgba avoids the grey tinge bare "transparent" gives.
              background: 'linear-gradient(to bottom, rgba(248,246,241,0) 0%, var(--bg) 100%)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      {collapsible && (
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            aria-controls={id}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px',
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--accent)',
            }}
          >
            {expanded ? 'Show less ↑' : 'Show more ↓'}
          </button>
        </div>
      )}
    </div>
  );
}

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
  const mapped = resolveAirline(airlineMap, job?.company);
  const airlineId = mapped?.id || job?.airlineId || null;
  // Canonical name from the map (available the moment the id resolves, so the CTA
  // doesn't flicker the scraped variant); fall back to the fetched record / company.
  const airlineName = mapped?.name || airline?.name || job?.company;

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

  // Sanitized HTML for the body; a tag-stripped, truncated version for SEO meta.
  const descHtml = useMemo(() => sanitizeDescription(job?.description), [job?.description]);
  const descText = useMemo(
    () => DOMPurify.sanitize(job?.description || '', { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).replace(/\s+/g, ' ').trim().slice(0, 160),
    [job?.description],
  );
  useSeo({
    title: job ? `${job.title} — ${job.company} | CockpitHire` : null,
    description: descText,
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
  const hasReqs = matchCount && matchCount.total > 0;
  const serverMatch = matchLabel(job.matchScore);

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
          {/* Typography pilot: Inter 700 (sans, technical) instead of Fraunces display.
              Scoped to JobDetail only — other pilot pages keep Fraunces h1s. */}
          <h1 style={{ fontFamily: 'var(--font-body)', fontSize: 32, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)', margin: '6px 0 8px' }}>
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

      {/* Prominent factfile CTA — sits in the slot the old Apply/Save row held.
          Apply + Save live once, at the bottom. */}
      {airlineId && (
        <div style={{ marginBottom: 24 }}>
          <Link to={`/airlines/${airlineId}`} style={{ textDecoration: 'none' }}>
            <Button variant="secondary">View {airlineName} factfile →</Button>
          </Link>
        </div>
      )}

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
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '0 12px' }}>
                {matchCount.requirements.map((r) => <ReqRow key={r.label} req={r} />)}
              </div>
            )}
          </>
        ) : (
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            Complete your pilot profile to see your match against this role.
          </p>
        )}
      </Card>

      {/* Description */}
      {job.description && (
        <div style={{ marginBottom: 24 }}>
          <div style={css.sectionLabel}>Job Description</div>
          <CollapsibleText id="job-description" style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8 }}>
            <div className="job-desc-html" dangerouslySetInnerHTML={{ __html: descHtml }} />
          </CollapsibleText>
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
