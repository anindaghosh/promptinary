'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/AuthModal';

interface Team {
  id: string;
  name: string;
  inviteCode: string;
  memberCount: number;
}

export default function LandingPage() {
  const router = useRouter();
  const { user, profile, loading, isAnonymous } = useAuth();

  const [playerName, setPlayerName]   = useState('');
  const [joinCode, setJoinCode]       = useState('');
  const [tab, setTab]                 = useState<'create' | 'join'>('create');
  const [playMode, setPlayMode]       = useState<'global' | 'team'>('global');
  const [teams, setTeams]             = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Sync name from profile
  useEffect(() => {
    if (profile?.displayName) {
      setPlayerName(profile.displayName);
    } else {
      const saved = localStorage.getItem('promptinary_name');
      if (saved) setPlayerName(saved);
    }
  }, [profile]);

  // Load user's teams when switching to team mode
  useEffect(() => {
    if (playMode !== 'team' || !user || !profile?.teamIds?.length) return;
    setLoadingTeams(true);
    loadTeams().finally(() => setLoadingTeams(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playMode, user, profile?.teamIds]);

  const loadTeams = async () => {
    if (!profile?.teamIds?.length) return;
    try {
      const q = query(collection(db, 'teams'), where('__name__', 'in', profile.teamIds.slice(0, 10)));
      const snap = await getDocs(q);
      setTeams(snap.docs.map(d => ({
        id: d.id,
        name: d.data().name,
        inviteCode: d.data().inviteCode,
        memberCount: (d.data().memberUids || []).length,
      })));
    } catch (e) {
      console.error('Failed to load teams:', e);
    }
  };

  const saveName = (name: string) => {
    setPlayerName(name);
    localStorage.setItem('promptinary_name', name);
  };

  const handleCreateRoom = () => {
    if (!playerName.trim()) { setError('Please enter your name first'); return; }
    if (playMode === 'team' && !selectedTeam) { setError('Select a team to play with'); return; }
    setError(null);
    localStorage.setItem('promptinary_name', playerName.trim());
    if (playMode === 'team' && selectedTeam) {
      localStorage.setItem('promptinary_teamId', selectedTeam.id);
    } else {
      localStorage.removeItem('promptinary_teamId');
    }
    router.push('/room/new');
  };

  const handleJoinRoom = () => {
    if (!playerName.trim()) { setError('Please enter your name first'); return; }
    if (!joinCode.trim()) { setError('Please enter a room code'); return; }
    setError(null);
    localStorage.setItem('promptinary_name', playerName.trim());
    router.push(`/room/${joinCode.trim().toUpperCase()}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (tab === 'create') handleCreateRoom();
      else handleJoinRoom();
    }
  };

  if (loading) {
    return (
      <div className="page-wrapper" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(0,0,0,0.1)', borderTopColor: 'var(--teal)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="page-wrapper" style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      <SparkleField />

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      <div className="page-content" style={{ paddingTop: 48, paddingBottom: 48, display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Top bar: auth status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 32, gap: 10 }}>
          {profile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="avatar" style={{ width: 32, height: 32, fontSize: 16 }}>{profile.avatar}</div>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600 }}>
                {isAnonymous ? 'Guest' : profile.displayName}
              </span>
            </div>
          )}
          <button
            className="btn btn-ghost btn-sm btn-auto"
            onClick={() => setShowAuthModal(true)}
          >
            {isAnonymous ? 'Sign In' : 'Account'}
          </button>
        </div>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 36 }} className="animate-slide-up">
          <div style={{ fontSize: 52, marginBottom: 8, lineHeight: 1 }}>🎨</div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 900,
            fontSize: 'clamp(30px, 8vw, 42px)', letterSpacing: '-0.03em',
            color: 'var(--black)', lineHeight: 1.05, marginBottom: 10,
          }}>
            Promptinary
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--black)', opacity: 0.6, maxWidth: 260, margin: '0 auto', lineHeight: 1.5 }}>
            Race to recreate images using AI prompts. Every token counts.
          </p>
        </div>

        {/* Name input */}
        <div style={{ marginBottom: 20 }} className="animate-slide-up stagger-1">
          <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Your Name
          </label>
          <input
            className="input"
            type="text"
            placeholder="Enter your display name..."
            value={playerName}
            onChange={e => saveName(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={20}
            autoFocus
          />
        </div>

        {/* Play Mode selector */}
        <div style={{ marginBottom: 20 }} className="animate-slide-up stagger-2">
          <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Play Mode
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <ModeCard
              active={playMode === 'global'}
              icon="🌍"
              title="Play Globally"
              desc="Open to all players"
              color="var(--sky)"
              onClick={() => { setPlayMode('global'); setSelectedTeam(null); }}
            />
            <ModeCard
              active={playMode === 'team'}
              icon="👥"
              title="Play with Team"
              desc="Compete within your team"
              color="var(--lavender)"
              onClick={() => {
                if (isAnonymous) { setShowAuthModal(true); return; }
                setPlayMode('team');
              }}
            />
          </div>
        </div>

        {/* Team picker */}
        {playMode === 'team' && (
          <div style={{ marginBottom: 20 }} className="animate-slide-up">
            {loadingTeams ? (
              <div style={{ textAlign: 'center', padding: 16, opacity: 0.5, fontFamily: 'var(--font-body)', fontSize: 13 }}>Loading teams...</div>
            ) : teams.length === 0 ? (
              <div style={{ padding: '14px 16px', background: 'var(--white)', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, opacity: 0.7, marginBottom: 10 }}>You haven&apos;t joined any teams yet.</p>
                <button className="btn btn-primary btn-sm btn-auto" onClick={() => router.push('/teams')}>
                  Create or Join a Team
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {teams.map(team => (
                  <div
                    key={team.id}
                    onClick={() => setSelectedTeam(team)}
                    style={{
                      padding: '12px 16px',
                      background: selectedTeam?.id === team.id ? 'var(--lavender)' : 'var(--white)',
                      border: selectedTeam?.id === team.id ? 'var(--border-thick)' : 'var(--border)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: 'var(--shadow-sm)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 120ms ease',
                    }}
                  >
                    <div>
                      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14 }}>{team.name}</div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, opacity: 0.6 }}>{team.memberCount} members</div>
                    </div>
                    {selectedTeam?.id === team.id && <span style={{ fontSize: 18 }}>✓</span>}
                  </div>
                ))}
                <button className="btn btn-ghost btn-sm" onClick={() => router.push('/teams')} style={{ marginTop: 4 }}>
                  Manage Teams →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Create / Join tab switcher */}
        <div style={{ display: 'flex', background: 'var(--track)', borderRadius: 'var(--radius-pill)', padding: 4, marginBottom: 16, border: 'var(--border)' }} className="animate-slide-up stagger-3">
          <TabButton active={tab === 'create'} onClick={() => setTab('create')}>Create Room</TabButton>
          <TabButton active={tab === 'join'}   onClick={() => setTab('join')}>Join Room</TabButton>
        </div>

        {tab === 'create' && (
          <div className="animate-slide-up" key="create">
            <div className="card" style={{ marginBottom: 14, textAlign: 'center', padding: 14 }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, opacity: 0.7 }}>
                {playMode === 'team' && selectedTeam
                  ? `Creating a team room for ${selectedTeam.name}`
                  : 'A 6-character code will be generated. Share it with friends!'}
              </p>
            </div>
            <button className="btn btn-primary" onClick={handleCreateRoom}>
              Create Room ▶
            </button>
          </div>
        )}

        {tab === 'join' && (
          <div className="animate-slide-up" key="join">
            <input
              className="input"
              type="text"
              placeholder="Enter room code (e.g. ABC123)"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              maxLength={6}
              style={{ marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}
            />
            <button className="btn btn-primary" onClick={handleJoinRoom}>
              Join Room ▶
            </button>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--coral)', border: 'var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: 'var(--white)', boxShadow: 'var(--shadow-sm)' }}>
            {error}
          </div>
        )}

        {/* Quick links */}
        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => router.push('/teams')}>
            👥 Teams
          </button>
          <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => router.push('/profile')}>
            👤 Profile
          </button>
        </div>

        {/* How to play */}
        <div style={{ marginTop: 36 }} className="animate-slide-up stagger-4">
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, marginBottom: 14, letterSpacing: '-0.01em' }}>
            How to Play
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { icon: '👁️', text: 'See a reference image you need to recreate' },
              { icon: '✍️', text: 'Write an AI prompt within your token budget' },
              { icon: '⚡', text: 'Submit — an AI generates your image' },
              { icon: '🏆', text: 'Score points for similarity, efficiency & speed' },
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--white)', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
                <span style={{ fontSize: 18 }}>{step.icon}</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 13 }}>{step.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function ModeCard({ active, icon, title, desc, color, onClick }: {
  active: boolean; icon: string; title: string; desc: string; color: string; onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '14px 12px',
        background: active ? color : 'var(--white)',
        border: active ? 'var(--border-thick)' : 'var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: active ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'all 120ms ease',
        transform: active ? 'translate(-1px, -1px)' : undefined,
      }}
    >
      <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13 }}>{title}</div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, opacity: 0.6, marginTop: 2 }}>{desc}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '10px 0',
      border: active ? 'var(--border)' : '2px solid transparent',
      borderRadius: 'var(--radius-pill)',
      background: active ? 'var(--white)' : 'transparent',
      fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14,
      cursor: 'pointer', boxShadow: active ? 'var(--shadow-sm)' : 'none',
      transition: 'all 120ms ease', color: 'var(--black)',
    }}>
      {children}
    </button>
  );
}

function SparkleField() {
  const sparkles = [
    { top: '6%',  left: '5%',  size: 20, delay: 0   },
    { top: '12%', right: '7%', size: 14, delay: 0.7 },
    { top: '32%', left: '3%',  size: 10, delay: 1.3 },
    { top: '26%', right: '4%', size: 18, delay: 0.4 },
  ];
  return (
    <>
      <style>{`
        @keyframes sparkle-float {
          0%, 100% { opacity: 0.5; transform: scale(0.9) rotate(0deg); }
          50%       { opacity: 1;   transform: scale(1.15) rotate(15deg); }
        }
      `}</style>
      {sparkles.map((s, i) => (
        <span key={i} style={{
          position: 'fixed',
          ...(s.top   ? { top:   s.top   } : {}),
          ...(s.left  ? { left:  s.left  } : {}),
          ...((s as any).right  ? { right:  (s as any).right  } : {}),
          ...((s as any).bottom ? { bottom: (s as any).bottom } : {}),
          fontSize: s.size, color: 'var(--gold)',
          animation: `sparkle-float 2.5s ease-in-out ${s.delay}s infinite`,
          userSelect: 'none', pointerEvents: 'none',
        }}>✦</span>
      ))}
    </>
  );
}
