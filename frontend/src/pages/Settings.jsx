import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api, { profileApi, flightLogApi, authApi } from '../services/api';
import { logout } from '../store';
import { Card, Input, Button, Badge, Modal, LightPage } from '../components/primitives';

// ── Components defined OUTSIDE Settings to prevent remount-on-keypress ────────
function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 12, background: value ? 'var(--accent)' : 'var(--border)', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(15,20,25,0.2)', transition: 'left 0.2s' }} />
    </div>
  );
}

function Chip({ label, active, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: active ? 'rgba(0,63,136,0.08)' : 'var(--surface)', border: `1px solid ${active ? 'var(--accent)' : (hover ? 'rgba(0,63,136,0.4)' : 'var(--border)')}`, borderRadius: 20, padding: '6px 14px', color: active ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.15s, border-color 0.15s, color 0.15s' }}>
      {label}
    </button>
  );
}

function Tag({ label, onRemove }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(0,63,136,0.08)', border: '1px solid var(--accent)', borderRadius: 20, padding: '4px 12px', fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
      {label}
      <span onClick={onRemove} style={{ cursor: 'pointer', lineHeight: 1, color: 'var(--text-secondary)', fontSize: 14 }}>✕</span>
    </span>
  );
}

function TagInput({ inputVal, setInputVal, tags, setTags, placeholder }) {
  const handleAdd = () => {
    const val = inputVal.trim();
    if (val && !tags.includes(val)) setTags((prev) => [...prev, val]);
    setInputVal('');
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <Input type="text" value={inputVal} onChange={(e) => setInputVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }} placeholder={placeholder} />
        </div>
        <Button type="button" onClick={handleAdd} style={{ whiteSpace: 'nowrap' }}>Add</Button>
      </div>
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {tags.map((t) => <Tag key={t} label={t} onRemove={() => setTags((prev) => prev.filter((v) => v !== t))} />)}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const pilot = useSelector((s) => s.auth.pilot);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // ── Account / Change Password ─────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState(null);
  const [passwordError, setPasswordError] = useState(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // ── Job Preferences ───────────────────────────────────────────────────
  const [countryInput, setCountryInput] = useState('');
  const [preferredCountries, setPreferredCountries] = useState([]);
  const [aircraftInput, setAircraftInput] = useState('');
  const [preferredAircraft, setPreferredAircraft] = useState([]);
  const [contractTypes, setContractTypes] = useState([]);
  const [routePreferences, setRoutePreferences] = useState([]);
  const [minSalary, setMinSalary] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState('USD');
  const [salaryPeriod, setSalaryPeriod] = useState('Per month');
  const [salaryNegotiable, setSalaryNegotiable] = useState(false);
  const [prefSaved, setPrefSaved] = useState(false);
  const [prefLoading, setPrefLoading] = useState(false);

  const CONTRACT_OPTIONS = ['Full-time', 'Part-time', 'Contract', 'ACMI', 'Wet Lease'];
  const ROUTE_OPTIONS = ['Short-haul', 'Long-haul', 'Ultra-long-haul', 'Regional', 'Cargo', 'Charter'];

  // ── Notifications ─────────────────────────────────────────────────────
  const [allEmailOn, setAllEmailOn] = useState(true);
  const [notifMatrix, setNotifMatrix] = useState({
    newJobMatch: true,
    alertDigest: true,
    applicationUpdate: true,
    certificateExpiry: true,
    medicalExpiry: true,
    productUpdates: false,
  });
  const [quietHours, setQuietHours] = useState(false);
  const [quietFrom, setQuietFrom] = useState('22:00');
  const [quietTo, setQuietTo] = useState('07:00');
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifMsg, setNotifMsg] = useState(null);
  const [notifError, setNotifError] = useState(null);

  const NOTIF_ROWS = [
    { key: 'newJobMatch', label: 'New Job Match' },
    { key: 'alertDigest', label: 'Alert Digest' },
    { key: 'applicationUpdate', label: 'Application Update' },
    { key: 'certificateExpiry', label: 'Certificate Expiry' },
    { key: 'medicalExpiry', label: 'Medical Expiry' },
    { key: 'productUpdates', label: 'Product Updates' },
  ];

  // ── Privacy ───────────────────────────────────────────────────────────
  const [visibleToRecruiters, setVisibleToRecruiters] = useState(true);
  const [anonymousBrowsing, setAnonymousBrowsing] = useState(false);
  const [showSeniority, setShowSeniority] = useState(true);

  // ── Delete account confirmation ───────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);

  // ── Load preferences on mount ─────────────────────────────────────────
  useEffect(() => {
    profileApi.get().then((res) => {
      const p = res.data?.preferences || {};
      setPreferredCountries(p.preferredCountries || []);
      setPreferredAircraft(p.preferredAircraft || []);
      setContractTypes(p.contractTypes || []);
      setRoutePreferences(p.routePreferences || []);
      setMinSalary(p.minSalary ?? '');
      setSalaryCurrency(p.salaryCurrency || 'USD');
      setSalaryPeriod(p.salaryPeriod || 'Per month');
      setSalaryNegotiable(!!p.salaryNegotiable);
      setAllEmailOn(p.allEmailOn !== false);
      setNotifMatrix({
        newJobMatch: p.newJobMatch !== false,
        alertDigest: p.alertDigest !== false,
        applicationUpdate: p.applicationUpdate !== false,
        certificateExpiry: p.certificateExpiry !== false,
        medicalExpiry: p.medicalExpiry !== false,
        productUpdates: !!p.productUpdates,
      });
      setQuietHours(!!p.quietHours);
      setQuietFrom(p.quietFrom || '22:00');
      setQuietTo(p.quietTo || '07:00');
      setVisibleToRecruiters(p.visibleToRecruiters !== false);
      setAnonymousBrowsing(!!p.anonymousBrowsing);
      setShowSeniority(p.showSeniority !== false);
    }).catch(() => {});
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────
  async function handleChangePassword(e) {
    e.preventDefault();
    setPasswordMsg(null);
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    setPasswordLoading(true);
    try {
      await api.patch('/auth/change-password', { currentPassword, newPassword });
      setPasswordMsg('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err?.response?.data?.message || 'Failed to change password.');
    } finally {
      setPasswordLoading(false);
    }
  }

  function toggleChip(value, list, setList) {
    setList((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]);
  }

  async function handleSavePreferences() {
    setPrefLoading(true);
    try {
      await profileApi.updatePreferences({
        preferredCountries,
        preferredAircraft,
        contractTypes,
        routePreferences,
        minSalary: salaryNegotiable ? null : minSalary,
        salaryCurrency,
        salaryPeriod,
        salaryNegotiable,
      });
      setPrefSaved(true);
      setTimeout(() => setPrefSaved(false), 2000);
    } catch (_) {}
    finally { setPrefLoading(false); }
  }

  async function handleSaveNotifications() {
    setNotifMsg(null);
    setNotifError(null);
    setNotifLoading(true);
    try {
      await profileApi.updatePreferences({
        allEmailOn,
        ...notifMatrix,
        quietHours,
        quietFrom,
        quietTo,
      });
      setNotifMsg('Notification preferences saved.');
    } catch (err) {
      setNotifError(err?.response?.data?.message || 'Failed to save preferences.');
    } finally {
      setNotifLoading(false);
    }
  }

  async function handlePrivacyToggle(key, value) {
    if (key === 'visibleToRecruiters') setVisibleToRecruiters(value);
    if (key === 'anonymousBrowsing') setAnonymousBrowsing(value);
    if (key === 'showSeniority') setShowSeniority(value);
    try {
      await profileApi.updatePreferences({ [key]: value });
    } catch (_) {}
  }

  async function handleExport(format) {
    try {
      let res;
      if (format === 'JSON') {
        res = await authApi.exportData ? authApi.exportData() : api.get('/auth/export');
      } else {
        res = await flightLogApi.export
          ? flightLogApi.export(format)
          : api.get(`/flight-logs/export?format=${format}`, { responseType: 'blob' });
      }
      const data = res.data;
      const mimeType = format === 'JSON' ? 'application/json' : 'text/csv';
      const ext = format === 'JSON' ? 'json' : 'csv';
      const filename = format === 'FOREFLIGHT' ? 'foreflight_export.csv' : `export.${ext}`;
      const blob = data instanceof Blob ? data : new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (_) {}
  }

  // Deletion logic preserved verbatim — only the confirmation UI changed
  // (window.confirm → <Modal>).
  async function confirmDelete() {
    try {
      await api.delete('/auth/account');
      dispatch(logout());
      navigate('/login');
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to delete account.');
    }
  }

  // ── Shared styles ─────────────────────────────────────────────────────
  const cardStyle = { padding: 28, marginBottom: 24 };
  const labelStyle = { display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 };
  const sectionTitleStyle = { fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, letterSpacing: '-0.01em' };
  const sectionSubtitleStyle = { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 };
  const successBanner = { background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 6, padding: '10px 14px', color: '#166534', fontSize: 13, marginTop: 14 };
  const errorBanner = { background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 14px', color: '#991B1B', fontSize: 13, marginTop: 14 };
  const divider = { borderTop: '1px solid var(--border)', margin: '20px 0' };

  return (
    <LightPage style={{ fontFamily: 'var(--font-body)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 8 }}>
          Settings
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 32, fontSize: 15 }}>
          Manage your account, preferences, notifications, and data.
        </p>

        {/* ── Account Card ─────────────────────────────────────────────── */}
        <Card style={cardStyle}>
          <div style={sectionTitleStyle}>Account</div>
          <div style={sectionSubtitleStyle}>Your login credentials and security settings.</div>

          <div style={{ marginBottom: 20 }}>
            <Input label="Email Address" type="email" value={pilot?.email || ''} readOnly style={{ opacity: 0.6, cursor: 'not-allowed' }} />
          </div>

          <div style={divider} />

          <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
            Change Password
          </div>
          <form onSubmit={handleChangePassword}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input label="Current Password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required placeholder="Enter current password" />
              <Input label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters" />
              <Input label="Confirm New Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="Repeat new password" />
            </div>
            {passwordMsg && <div style={successBanner}>{passwordMsg}</div>}
            {passwordError && <div style={errorBanner}>{passwordError}</div>}
            <Button type="submit" disabled={passwordLoading} style={{ marginTop: 16 }}>
              {passwordLoading ? 'Saving…' : 'Update Password'}
            </Button>
          </form>
        </Card>

        {/* ── Job Preferences Card ──────────────────────────────────────── */}
        <Card style={cardStyle}>
          <div style={sectionTitleStyle}>Job Preferences</div>
          <div style={sectionSubtitleStyle}>Tell us what kinds of opportunities you are looking for.</div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Preferred Countries</label>
            <TagInput inputVal={countryInput} setInputVal={setCountryInput} tags={preferredCountries} setTags={setPreferredCountries} placeholder="e.g. UAE, Germany, USA" />
          </div>

          <div style={divider} />

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Preferred Aircraft Types</label>
            <TagInput inputVal={aircraftInput} setInputVal={setAircraftInput} tags={preferredAircraft} setTags={setPreferredAircraft} placeholder="e.g. B737, A320, B777" />
          </div>

          <div style={divider} />

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Contract Types</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CONTRACT_OPTIONS.map((opt) => (
                <Chip key={opt} label={opt} active={contractTypes.includes(opt)} onClick={() => toggleChip(opt, contractTypes, setContractTypes)} />
              ))}
            </div>
          </div>

          <div style={divider} />

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Route Preferences</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ROUTE_OPTIONS.map((opt) => (
                <Chip key={opt} label={opt} active={routePreferences.includes(opt)} onClick={() => toggleChip(opt, routePreferences, setRoutePreferences)} />
              ))}
            </div>
          </div>

          <div style={divider} />

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Minimum Salary</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ flex: '1 1 120px', minWidth: 100 }}>
                <Input type="number" value={minSalary} onChange={(e) => setMinSalary(e.target.value)} disabled={salaryNegotiable} placeholder="Amount" style={{ opacity: salaryNegotiable ? 0.4 : 1 }} />
              </div>
              <div style={{ flex: '0 0 90px' }}>
                <Input as="select" value={salaryCurrency} onChange={(e) => setSalaryCurrency(e.target.value)}>
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                  <option>AED</option>
                </Input>
              </div>
              <div style={{ flex: '1 1 120px', minWidth: 120 }}>
                <Input as="select" value={salaryPeriod} onChange={(e) => setSalaryPeriod(e.target.value)}>
                  <option>Per month</option>
                  <option>Per year</option>
                </Input>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={salaryNegotiable} onChange={(e) => setSalaryNegotiable(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 15, height: 15 }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Negotiable</span>
            </label>
          </div>

          <Button type="button" onClick={handleSavePreferences} disabled={prefLoading}>
            {prefSaved ? 'Saved ✓' : prefLoading ? 'Saving…' : 'Save Preferences'}
          </Button>
        </Card>

        {/* ── Notifications Card ────────────────────────────────────────── */}
        <Card style={cardStyle}>
          <div style={sectionTitleStyle}>Notifications</div>
          <div style={sectionSubtitleStyle}>Choose what emails you receive from CockpitHire.</div>

          {/* Master toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, padding: '14px 16px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 700 }}>All email notifications</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Master switch — disabling this overrides all per-category settings
              </div>
            </div>
            <Toggle value={allEmailOn} onChange={setAllEmailOn} />
          </div>

          {/* Per-category matrix */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0 16px', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Category</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>Email</span>
            </div>
            {NOTIF_ROWS.map((row) => (
              <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0 16px', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{row.label}</span>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <input
                    type="checkbox"
                    checked={notifMatrix[row.key]}
                    disabled={!allEmailOn}
                    onChange={(e) => setNotifMatrix((prev) => ({ ...prev, [row.key]: e.target.checked }))}
                    style={{ accentColor: 'var(--accent)', width: 16, height: 16, cursor: allEmailOn ? 'pointer' : 'not-allowed', opacity: allEmailOn ? 1 : 0.4 }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Quiet Hours */}
          <div style={divider} />
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: quietHours ? 14 : 0 }}>
              <div>
                <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>Enable quiet hours</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Pause notifications during specified hours
                </div>
              </div>
              <Toggle value={quietHours} onChange={setQuietHours} />
            </div>
            {quietHours && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginTop: 12 }}>
                <div style={{ flex: 1 }}>
                  <Input label="From" type="time" value={quietFrom} onChange={(e) => setQuietFrom(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <Input label="To" type="time" value={quietTo} onChange={(e) => setQuietTo(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {notifMsg && <div style={successBanner}>{notifMsg}</div>}
          {notifError && <div style={errorBanner}>{notifError}</div>}
          <Button type="button" onClick={handleSaveNotifications} disabled={notifLoading} style={{ marginTop: 16 }}>
            {notifLoading ? 'Saving…' : 'Save Notification Preferences'}
          </Button>
        </Card>

        {/* ── Privacy Card ──────────────────────────────────────────────── */}
        <Card style={cardStyle}>
          <div style={sectionTitleStyle}>Privacy</div>
          <div style={sectionSubtitleStyle}>Control how your profile and activity are visible.</div>

          {[
            { key: 'visibleToRecruiters', value: visibleToRecruiters, label: 'Profile visible to recruiters', desc: 'Allow airlines and recruiters to view your profile' },
            { key: 'anonymousBrowsing', value: anonymousBrowsing, label: 'Anonymous browsing', desc: 'Browse jobs without leaving a trace' },
            { key: 'showSeniority', value: showSeniority, label: 'Show seniority publicly', desc: 'Display your total hours and seniority on your public profile' },
          ].map((item, i, arr) => (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: i < arr.length - 1 ? 18 : 0, marginBottom: i < arr.length - 1 ? 18 : 0, borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div>
                <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{item.desc}</div>
              </div>
              <Toggle value={item.value} onChange={(v) => handlePrivacyToggle(item.key, v)} />
            </div>
          ))}
        </Card>

        {/* ── Data Card ─────────────────────────────────────────────────── */}
        <Card style={cardStyle}>
          <div style={sectionTitleStyle}>Data</div>
          <div style={sectionSubtitleStyle}>Export your data or create a backup.</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Export Logbook (CSV)', format: 'CSV' },
              { label: 'Export for ForeFlight (CSV)', format: 'FOREFLIGHT' },
              { label: 'Export All Data (JSON)', format: 'JSON' },
            ].map((item) => (
              <Button
                key={item.format}
                variant="ghost"
                onClick={() => handleExport(item.format)}
                style={{ width: '100%', justifyContent: 'space-between', padding: '13px 18px', border: '1px solid var(--border)', fontWeight: 600 }}
              >
                {item.label}
                <span style={{ fontSize: 12, color: 'var(--accent)' }}>Download</span>
              </Button>
            ))}

            {/* Cloud Backup — coming soon */}
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: 0.7 }}>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600 }}>Cloud Backup</span>
              <Badge variant="neutral">Coming soon</Badge>
            </div>
          </div>
        </Card>

        {/* ── Danger Zone Card ──────────────────────────────────────────── */}
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: 28, marginBottom: 24 }}>
          <div style={{ ...sectionTitleStyle, color: '#991B1B' }}>Danger Zone</div>
          <div style={{ fontSize: 13, color: '#991B1B', opacity: 0.85, marginBottom: 20 }}>
            Permanent and irreversible actions.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, color: '#991B1B', fontWeight: 700 }}>Delete Account</div>
              <div style={{ fontSize: 13, color: '#991B1B', opacity: 0.85, marginTop: 3 }}>
                Permanently remove your account and all associated data.
              </div>
            </div>
            <Button variant="danger" onClick={() => setDeleteOpen(true)} style={{ whiteSpace: 'nowrap' }}>
              Delete Account
            </Button>
          </div>
        </div>
      </div>

      {/* Delete confirmation (replaces window.confirm) */}
      <Modal isOpen={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete account?">
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 0 }}>
          Are you sure? This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <Button variant="danger" onClick={() => { setDeleteOpen(false); confirmDelete(); }}>Delete account</Button>
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
        </div>
      </Modal>
    </LightPage>
  );
}
