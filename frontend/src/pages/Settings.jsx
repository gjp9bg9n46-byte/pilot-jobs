import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api, { profileApi } from '../services/api';
import { logout } from '../store';

export default function Settings() {
  const pilot = useSelector((s) => s.auth.pilot);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // Change Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState(null);
  const [passwordError, setPasswordError] = useState(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Notifications
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [notifMsg, setNotifMsg] = useState(null);
  const [notifError, setNotifError] = useState(null);
  const [notifLoading, setNotifLoading] = useState(false);

  useEffect(() => {
    if (pilot?.preferences) {
      setEmailAlerts(!!pilot.preferences.emailAlerts);
      setWeeklyDigest(!!pilot.preferences.weeklyDigest);
    }
  }, [pilot]);

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
      await api.post('/api/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setPasswordMsg('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(
        err?.response?.data?.message || 'Failed to change password.'
      );
    } finally {
      setPasswordLoading(false);
    }
  }

  async function handleSaveNotifications() {
    setNotifMsg(null);
    setNotifError(null);
    setNotifLoading(true);
    try {
      await profileApi.patch('/api/profile/preferences', {
        emailAlerts,
        weeklyDigest,
      });
      setNotifMsg('Notification preferences saved.');
    } catch (err) {
      setNotifError(
        err?.response?.data?.message || 'Failed to save preferences.'
      );
    } finally {
      setNotifLoading(false);
    }
  }

  async function handleDeleteAccount() {
    const confirmed = window.confirm(
      'Are you sure? This cannot be undone.'
    );
    if (!confirmed) return;
    try {
      await api.delete('/api/auth/account');
      dispatch(logout());
      navigate('/login');
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to delete account.');
    }
  }

  const inputStyle = {
    width: '100%',
    background: '#1B2B4B',
    border: '1px solid #243050',
    borderRadius: 8,
    padding: '11px 12px',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 13,
    color: '#7A8CA0',
    marginBottom: 6,
    fontWeight: 600,
  };

  const saveButtonStyle = {
    background: 'linear-gradient(135deg, #00B4D8, #0077A8)',
    border: 'none',
    borderRadius: 8,
    padding: '11px 22px',
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
  };

  const cardStyle = {
    background: '#0D1E35',
    border: '1px solid #1E3050',
    borderRadius: 16,
    padding: 28,
    marginBottom: 24,
  };

  const sectionTitleStyle = {
    fontSize: 18,
    fontWeight: 800,
    color: '#fff',
    marginBottom: 4,
  };

  const sectionSubtitleStyle = {
    fontSize: 13,
    color: '#4A6080',
    marginBottom: 20,
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0A1628',
        padding: '40px 20px',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 900,
            color: '#fff',
            marginBottom: 8,
          }}
        >
          Settings
        </h1>
        <p style={{ color: '#7A8CA0', marginBottom: 32, fontSize: 15 }}>
          Manage your account, notifications, and preferences.
        </p>

        {/* Account Card */}
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Account</div>
          <div style={sectionSubtitleStyle}>
            Your login credentials and security settings.
          </div>

          {/* Email (read-only) */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Email Address</label>
            <input
              type="email"
              value={pilot?.email || ''}
              readOnly
              style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }}
            />
          </div>

          {/* Change Password */}
          <div
            style={{
              borderTop: '1px solid #1E3050',
              paddingTop: 20,
              marginTop: 4,
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: '#fff',
                marginBottom: 16,
              }}
            >
              Change Password
            </div>
            <form onSubmit={handleChangePassword}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  placeholder="Enter current password"
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Repeat new password"
                  style={inputStyle}
                />
              </div>

              {passwordMsg && (
                <div
                  style={{
                    background: '#0A2A1A',
                    border: '1px solid #1A5C3A',
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: '#4ADE80',
                    fontSize: 13,
                    marginBottom: 14,
                  }}
                >
                  {passwordMsg}
                </div>
              )}
              {passwordError && (
                <div
                  style={{
                    background: '#2A0A0A',
                    border: '1px solid #5C1A1A',
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: '#F87171',
                    fontSize: 13,
                    marginBottom: 14,
                  }}
                >
                  {passwordError}
                </div>
              )}

              <button
                type="submit"
                disabled={passwordLoading}
                style={{
                  ...saveButtonStyle,
                  opacity: passwordLoading ? 0.7 : 1,
                }}
              >
                {passwordLoading ? 'Saving…' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>

        {/* Notifications Card */}
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Notifications</div>
          <div style={sectionSubtitleStyle}>
            Choose what emails you receive from CockpitHire.
          </div>

          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={emailAlerts}
                onChange={(e) => setEmailAlerts(e.target.checked)}
                style={{
                  marginTop: 2,
                  accentColor: '#00B4D8',
                  width: 16,
                  height: 16,
                  flexShrink: 0,
                  cursor: 'pointer',
                }}
              />
              <div>
                <div
                  style={{ fontSize: 14, color: '#fff', fontWeight: 600 }}
                >
                  Email job alerts
                </div>
                <div style={{ fontSize: 13, color: '#7A8CA0', marginTop: 2 }}>
                  Send me an email when a new job matches my profile
                </div>
              </div>
            </label>
          </div>

          <div style={{ marginBottom: 22 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={weeklyDigest}
                onChange={(e) => setWeeklyDigest(e.target.checked)}
                style={{
                  marginTop: 2,
                  accentColor: '#00B4D8',
                  width: 16,
                  height: 16,
                  flexShrink: 0,
                  cursor: 'pointer',
                }}
              />
              <div>
                <div
                  style={{ fontSize: 14, color: '#fff', fontWeight: 600 }}
                >
                  Weekly digest
                </div>
                <div style={{ fontSize: 13, color: '#7A8CA0', marginTop: 2 }}>
                  Weekly summary of new matching jobs
                </div>
              </div>
            </label>
          </div>

          {notifMsg && (
            <div
              style={{
                background: '#0A2A1A',
                border: '1px solid #1A5C3A',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#4ADE80',
                fontSize: 13,
                marginBottom: 14,
              }}
            >
              {notifMsg}
            </div>
          )}
          {notifError && (
            <div
              style={{
                background: '#2A0A0A',
                border: '1px solid #5C1A1A',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#F87171',
                fontSize: 13,
                marginBottom: 14,
              }}
            >
              {notifError}
            </div>
          )}

          <button
            onClick={handleSaveNotifications}
            disabled={notifLoading}
            style={{
              ...saveButtonStyle,
              opacity: notifLoading ? 0.7 : 1,
            }}
          >
            {notifLoading ? 'Saving…' : 'Save Preferences'}
          </button>
        </div>

        {/* Danger Zone Card */}
        <div
          style={{
            background: '#1A0A0A',
            border: '1px solid #5C2626',
            borderRadius: 16,
            padding: 28,
            marginBottom: 24,
          }}
        >
          <div style={sectionTitleStyle}>Danger Zone</div>
          <div style={{ ...sectionSubtitleStyle, color: '#7A4040' }}>
            Permanent and irreversible actions.
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            <div>
              <div
                style={{ fontSize: 14, color: '#fff', fontWeight: 600 }}
              >
                Delete Account
              </div>
              <div style={{ fontSize: 13, color: '#7A4040', marginTop: 3 }}>
                Permanently remove your account and all associated data.
              </div>
            </div>
            <button
              onClick={handleDeleteAccount}
              style={{
                background: 'transparent',
                border: '1px solid #C0392B',
                borderRadius: 8,
                padding: '10px 20px',
                color: '#E74C3C',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
