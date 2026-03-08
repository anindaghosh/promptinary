'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/AuthModal';

interface GameHistoryEntry {
  gameId: string;
  roomCode: string;
  completedAt: Date;
  totalRounds: number;
  myScore: number;
  myRank: number;
  totalPlayers: number;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, isAnonymous, loading } = useAuth();

  const [history, setHistory]     = useState<GameHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [showAuthModal, setShowAuthModal]   = useState(false);

  useEffect(() => {
    if (!user || isAnonymous) { setLoadingHistory(false); return; }
    loadHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAnonymous]);

  const loadHistory = async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'gameHistory'),
        where('players', 'array-contains-any', [{ firebaseUid: user.uid }]),
        orderBy('completedAt', 'desc'),
        limit(10),
      );
      const snap = await getDocs(q);
      const entries: GameHistoryEntry[] = snap.docs.map(d => {
        const data = d.data();
        const myResult = (data.finalScores || []).find((s: any) => {
          const player = (data.players || []).find((p: any) => p.firebaseUid === user.uid);
          return player && s.playerId === player.playerId;
        });
        return {
          gameId:       d.id,
          roomCode:     data.roomCode,
          completedAt:  data.completedAt?.toDate?.() ?? new Date(),
          totalRounds:  data.totalRounds,
          myScore:      myResult?.total ?? 0,
          myRank:       (data.finalScores || []).findIndex((s: any) => {
            const player = (data.players || []).find((p: any) => p.firebaseUid === user.uid);
            return player && s.playerId === player.playerId;
          }) + 1,
          totalPlayers: (data.players || []).length,
        };
      });
      setHistory(entries);
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="page-wrapper">
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      <div className="page-content" style={{ paddingTop: 24, paddingBottom: 48 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, opacity: 0.6, padding: '4px 0' }}>
            ← Home
          </button>
        </div>

        {/* Avatar + name */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div className="avatar avatar-lg" style={{ width: 64, height: 64, fontSize: 32, margin: '0 auto 12px' }}>
            {profile?.avatar ?? '🦸'}
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>
            {isAnonymous ? 'Guest Player' : (profile?.displayName ?? 'Player')}
          </h1>
          {!isAnonymous && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, opacity: 0.6 }}>{user?.email}</p>
          )}
        </div>

        {/* Sign-in nudge for anonymous */}
        {isAnonymous && (
          <div style={{ marginBottom: 24, padding: '16px', background: 'var(--gold)', border: 'var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
              Sign in to save your stats and join teams
            </p>
            <button className="btn btn-dark btn-sm btn-auto" onClick={() => setShowAuthModal(true)}>
              Sign In with Google
            </button>
          </div>
        )}

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 28 }}>
          <StatCard label="Games Played" value={profile?.gamesPlayed ?? 0} color="var(--sky)" />
          <StatCard label="Best Score"   value={profile?.bestScore ?? 0}   color="var(--gold)" />
          <StatCard label="Total Score"  value={profile?.totalScore ?? 0}  color="var(--lavender)" />
          <StatCard label="Avg Score"    value={profile?.gamesPlayed ? Math.round((profile.totalScore ?? 0) / profile.gamesPlayed) : 0} color="var(--pink)" />
        </div>

        <div className="stripe-divider" style={{ marginBottom: 24 }} />

        {/* Game history */}
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 16 }}>
          Recent Games
        </h2>

        {isAnonymous ? (
          <div style={{ textAlign: 'center', padding: 24, fontFamily: 'var(--font-body)', fontSize: 13, opacity: 0.5 }}>
            Sign in to see your game history
          </div>
        ) : loadingHistory ? (
          <LoadingScreen small />
        ) : history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 16px', background: 'var(--white)', border: 'var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎮</div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, opacity: 0.7, marginBottom: 16 }}>No games yet. Go play!</p>
            <button className="btn btn-primary btn-sm btn-auto" onClick={() => router.push('/')}>Play Now ▶</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map(entry => (
              <GameHistoryCard key={entry.gameId} entry={entry} />
            ))}
          </div>
        )}

        {/* Teams quick link */}
        <div style={{ marginTop: 28 }}>
          <button className="btn btn-ghost" onClick={() => router.push('/teams')}>
            👥 Manage Teams →
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: '14px 12px', background: color, border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 24 }}>{value}</div>
    </div>
  );
}

function GameHistoryCard({ entry }: { entry: GameHistoryEntry }) {
  const rankMedals = ['🥇', '🥈', '🥉'];
  const medal = entry.myRank >= 1 && entry.myRank <= 3 ? rankMedals[entry.myRank - 1] : `#${entry.myRank}`;
  const dateStr = entry.completedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="player-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>{medal}</span>
          <div>
            <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14 }}>
              Room #{entry.roomCode}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, opacity: 0.5 }}>{dateStr}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20 }}>{entry.myScore}</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, opacity: 0.5 }}>pts</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <span className="badge badge-sky">{entry.totalRounds} rounds</span>
        <span className="badge badge-category">{entry.totalPlayers} players</span>
      </div>
    </div>
  );
}

function LoadingScreen({ small }: { small?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: small ? 32 : '40vh 0', gap: 12 }}>
      <div style={{ width: 24, height: 24, border: '3px solid rgba(0,0,0,0.1)', borderTopColor: 'var(--teal)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
