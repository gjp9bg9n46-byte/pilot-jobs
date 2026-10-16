import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import CvSheet from '../components/cv/CvSheet';
import { cvApi } from '../services/api';
import '../components/cv/cvBuilder.css';

/**
 * The read-only CV an airline opens. PUBLIC — no account, no app chrome, and
 * never a phone number or an email: the server builds it with audience
 * 'share', so the contact details are masked before they leave the backend.
 * The pilot can turn the link off, after which this 404s.
 */
export default function CvShare() {
  const { token } = useParams();
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    cvApi.shared(token)
      .then(({ data }) => { if (alive) setDoc(data.document); })
      .catch((e) => { if (alive) setErr(e?.response?.status === 404 ? 'This CV link is no longer available.' : 'Could not open this CV.'); });
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    if (doc) document.title = `${doc.header.name} — CV`;
  }, [doc]);

  if (err) {
    return (
      <div className="cvb" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <p style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 600 }}>{err}</p>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 6 }}>Ask the pilot for a new link.</p>
        </div>
      </div>
    );
  }
  if (!doc) return <div className="cvb" style={{ padding: 40, color: 'var(--accent)' }}>Loading…</div>;

  return (
    <div className="cvb cv-share-page" style={{ minHeight: '100vh' }}>
      <div className="cv-stage" style={{ padding: '28px 16px 60px' }}>
        <div className="sheetbox"><CvSheet doc={doc} /></div>
      </div>
      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-faint, #8592A3)', paddingBottom: 40 }}>
        Shared via CockpitHire · contact details are withheld
      </p>
    </div>
  );
}
