import React, { useState } from 'react';
import { Badge, Input, Modal, Card } from '../../components/primitives';
import '../../styles/design-tokens.css';

// Internal showcase / living documentation for the design primitives.
// Public route /dev/primitives, not linked anywhere. No user data.
const SectionTitle = ({ children }) => (
  <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 28, letterSpacing: '-0.01em', margin: '0 0 4px' }}>{children}</h2>
);
const Sub = ({ children }) => (
  <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 20px' }}>{children}</p>
);
const Row = ({ children }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>{children}</div>
);

export default function Primitives() {
  const [modalOpen, setModalOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [text, setText] = useState('');

  const section = { maxWidth: 880, margin: '0 auto', padding: '40px 24px', borderBottom: '1px solid var(--border)' };

  return (
    <div className="app-light" style={{ minHeight: '100vh', fontFamily: 'var(--font-body)' }}>
      <header style={{ maxWidth: 880, margin: '0 auto', padding: '48px 24px 8px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 40, letterSpacing: '-0.02em', margin: 0 }}>Design Primitives — internal showcase</h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-secondary)', marginTop: 10 }}>
          Reusable building blocks for the app-wide light-theme migration. See <code>components/primitives/README.md</code>.
        </p>
      </header>

      {/* Badge */}
      <section style={section}>
        <SectionTitle>Badge</SectionTitle>
        <Sub>Semantic status pill. Variants enforce the correct color — never hand-type status hex.</Sub>
        <Row>
          <Badge variant="success">Approved</Badge>
          <Badge variant="warning">Pending Review</Badge>
          <Badge variant="error">Rejected</Badge>
          <Badge variant="info">In Progress</Badge>
          <Badge variant="neutral">Inactive</Badge>
          <Badge>Default (neutral)</Badge>
        </Row>
      </section>

      {/* Input */}
      <section style={section}>
        <SectionTitle>Input</SectionTitle>
        <Sub>Light form control. <code>as</code> = input | textarea | select. Focus shows a blue ring; <code>error</code> shows a red border + helper text.</Sub>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
          <Input type="email" label="Email" placeholder="you@example.com" value={text} onChange={(e) => setText(e.target.value)} />
          <Input type="text" label="Title" placeholder="First Officer — A320" />
          <Input as="textarea" label="Description" rows={3} placeholder="Free text…" />
          <Input as="select" label="Country" defaultValue="">
            <option value="" disabled>Select…</option>
            <option>United Arab Emirates</option>
            <option>Germany</option>
            <option>United States</option>
          </Input>
          <Input label="Phone" defaultValue="abc" error="Invalid phone number" />
          <Input label="Disabled" placeholder="Read only" disabled />
        </div>
      </section>

      {/* Modal */}
      <section style={section}>
        <SectionTitle>Modal</SectionTitle>
        <Sub>Centered dialog above 640px, bottom-sheet below. Closes via X, backdrop click, or Escape; body scroll locks while open.</Sub>
        <Row>
          <button type="button" onClick={() => setModalOpen(true)} style={btn}>Open modal</button>
          <button type="button" onClick={() => setSheetOpen(true)} style={btn}>Open a long modal (scroll test)</button>
        </Row>
        <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Approve employer?">
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 0 }}>
            This will approve their account and unlock job posting.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button type="button" onClick={() => setModalOpen(false)} style={btn}>Confirm</button>
            <button type="button" onClick={() => setModalOpen(false)} style={btnGhost}>Cancel</button>
          </div>
        </Modal>
        <Modal isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="Long content">
          {Array.from({ length: 12 }).map((_, i) => (
            <p key={i} style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Paragraph {i + 1} — verifies internal scroll on small viewports (max-height 90vh).
            </p>
          ))}
        </Modal>
      </section>

      {/* Card */}
      <section style={{ ...section, borderBottom: 'none', paddingBottom: 80 }}>
        <SectionTitle>Card</SectionTitle>
        <Sub>White surface on warm bg. <code>hover</code> opts into a subtle shadow lift (no translate).</Sub>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          <Card>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20, margin: '0 0 8px' }}>Static card</h3>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0 }}>No shadow at rest, no hover.</p>
          </Card>
          <Card hover>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20, margin: '0 0 8px' }}>Hover card</h3>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0 }}>Hover me for a subtle shadow.</p>
          </Card>
          <Card as="article" hover>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20, margin: '0 0 8px' }}>as=&quot;article&quot;</h3>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0 }}>Renders a semantic element.</p>
          </Card>
        </div>
      </section>
    </div>
  );
}

const btn = { fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, padding: '10px 18px', cursor: 'pointer' };
const btnGhost = { fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500, background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--text-primary)', borderRadius: 4, padding: '10px 18px', cursor: 'pointer' };
