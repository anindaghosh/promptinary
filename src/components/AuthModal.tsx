'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface AuthModalProps {
  onClose: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const { user, profile, isAnonymous, signInWithGoogle, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 20, color: 'var(--black)', opacity: 0.4, lineHeight: 1,
          }}
        >
          ×
        </button>

        {isAnonymous ? (
          <>
            {/* Anonymous → Sign in prompt */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🔐</div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, marginBottom: 8 }}>
                Save Your Progress
              </h2>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, opacity: 0.65, lineHeight: 1.5 }}>
                Sign in with Google to save your scores, join teams, and track your history across sessions.
              </p>
            </div>

            {error && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--coral)', border: 'var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--white)' }}>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={handleGoogleSignIn}
              disabled={loading}
              style={{ marginBottom: 10 }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <InlineSpinner /> Signing in...
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <GoogleIcon /> Continue with Google
                </span>
              )}
            </button>

            <button className="btn btn-ghost" onClick={onClose}>
              Continue as Guest
            </button>
          </>
        ) : (
          <>
            {/* Signed-in account view */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div className="avatar avatar-lg" style={{ margin: '0 auto 12px' }}>
                {profile?.avatar ?? '🦸'}
              </div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, marginBottom: 4 }}>
                {profile?.displayName ?? 'Player'}
              </h2>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, opacity: 0.6 }}>
                {user?.email ?? 'Google Account'}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <StatPill label="Games" value={profile?.gamesPlayed ?? 0} color="var(--sky)" />
              <StatPill label="Best Score" value={profile?.bestScore ?? 0} color="var(--gold)" />
            </div>

            <button className="btn btn-ghost" onClick={handleSignOut}>
              Sign Out
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: '10px 12px', background: color, border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20 }}>{value}</div>
    </div>
  );
}

function InlineSpinner() {
  return (
    <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
