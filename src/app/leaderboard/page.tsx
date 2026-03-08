'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

interface LeaderboardEntry {
  uid: string;
  displayName: string;
  avatar: string;
  isAnonymous: boolean;
  totalScore: number;
  bestScore: number;
  gamesPlayed: number;
}

type SortKey = 'totalScore' | 'bestScore';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function LeaderboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [tab, setTab]             = useState<SortKey>('totalScore');
  const [entries, setEntries]     = useState<LeaderboardEntry[]>([]);
  const [loadingData, setLoading] = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const loadLeaderboard = useCallback(async (sortKey: SortKey) => {
    setLoading(true);
    setError(null);
    try {
      const q = query(
        collection(db, 'users'),
        orderBy(sortKey, 'desc'),
        limit(50),
      );
      const snap = await getDocs(q);
      const rows: LeaderboardEntry[] = snap.docs
        .map(d => {
          const data = d.data();
          return {
            uid:         d.id,
            displayName: data.displayName || 'Anonymous',
            avatar:      data.avatar      || '🦸',
            isAnonymous: data.isAnonymous ?? true,
            totalScore:  data.totalScore  || 0,
            bestScore:   data.bestScore   || 0,
            gamesPlayed: data.gamesPlayed || 0,
          };
        })
        // Only show users who have actually played
        .filter(r => r.gamesPlayed > 0);
      setEntries(rows);
    } catch (e: any) {
      setError('Could not load leaderboard. Try again shortly.');
      console.error('[Leaderboard]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) loadLeaderboard(tab);
  }, [tab, authLoading, loadLeaderboard]);

  const myRank = entries.findIndex(e => e.uid === user?.uid) + 1;

  return (
    <div className="page-wrapper">
      <div className="page-content" style={{ paddingTop: 24, paddingBottom: 48 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <button
            onClick={() => router.push('/')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, opacity: 0.6, padding: '4px 0' }}
          >
            ← Home
          </button>
          <button
            onClick={() => loadLeaderboard(tab)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--teal)', padding: '4px 0' }}
          >
            ↻ Refresh
          </button>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 24 }} className="animate-slide-up">
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, letterSpacing: '-0.02em', marginBottom: 6 }}>
            Global Leaderboard
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, opacity: 0.6 }}>
            Top 50 players worldwide
          </p>
        </div>

        {/* Your rank banner (if you're on the board) */}
        {myRank > 0 && !loadingData && (
          <div style={{
            marginBottom: 16, padding: '12px 16px',
            background: 'var(--lavender)', border: 'var(--border)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14 }}>
              Your rank
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22 }}>
              #{myRank}
            </span>
          </div>
        )}

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: 'var(--track)', borderRadius: 'var(--radius-pill)', padding: 4, marginBottom: 20, border: 'var(--border)' }}>
          <TabButton active={tab === 'totalScore'} onClick={() => setTab('totalScore')}>Total Score</TabButton>
          <TabButton active={tab === 'bestScore'}  onClick={() => setTab('bestScore')}>Best Game</TabButton>
        </div>

        {/* Content */}
        {loadingData ? (
          <LoadingSpinner />
        ) : error ? (
          <div style={{ padding: '16px', background: 'var(--coral)', border: 'var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--white)' }}>
            {error}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.map((entry, i) => (
              <LeaderboardRow
                key={entry.uid}
                entry={entry}
                rank={i + 1}
                isMe={entry.uid === user?.uid}
                sortKey={tab}
              />
            ))}
          </div>
        )}

        {/* Not on the board nudge */}
        {!loadingData && myRank === 0 && entries.length > 0 && (
          <div style={{ marginTop: 20, textAlign: 'center', padding: '14px 16px', background: 'var(--white)', border: 'var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, opacity: 0.7, marginBottom: 10 }}>
              You&apos;re not on the board yet. Play a game to appear here!
            </p>
            <button className="btn btn-primary btn-sm btn-auto" onClick={() => router.push('/')}>
              Play Now ▶
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function LeaderboardRow({ entry, rank, isMe, sortKey }: {
  entry: LeaderboardEntry;
  rank: number;
  isMe: boolean;
  sortKey: SortKey;
}) {
  const medal  = rank <= 3 ? MEDALS[rank - 1] : null;
  const score  = sortKey === 'totalScore' ? entry.totalScore : entry.bestScore;
  const label  = sortKey === 'totalScore' ? 'pts total' : 'pts best';

  return (
    <div
      className={`player-row ${isMe ? 'is-you' : ''} animate-slide-up`}
      style={{ alignItems: 'center', gap: 12 }}
    >
      {/* Rank */}
      <div style={{ minWidth: 32, textAlign: 'center' }}>
        {medal ? (
          <span style={{ fontSize: 20 }}>{medal}</span>
        ) : (
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, opacity: 0.5 }}>
            #{rank}
          </span>
        )}
      </div>

      {/* Avatar */}
      <div className="avatar" style={{ flexShrink: 0 }}>{entry.avatar}</div>

      {/* Name + badges */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {entry.displayName}
            {entry.isAnonymous && (
              <span style={{ fontWeight: 400, opacity: 0.5, fontSize: 12 }}> (guest)</span>
            )}
          </span>
          {isMe && <span className="badge badge-sky" style={{ fontSize: 10 }}>You</span>}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, opacity: 0.5, marginTop: 1 }}>
          {entry.gamesPlayed} game{entry.gamesPlayed !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Score */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20 }}>{score}</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      </div>
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
      color: 'var(--black)', transition: 'all 120ms ease',
    }}>
      {children}
    </button>
  );
}

function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 12 }}>
      <div style={{ width: 24, height: 24, border: '3px solid rgba(0,0,0,0.1)', borderTopColor: 'var(--teal)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, opacity: 0.6 }}>Loading rankings...</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 16px', background: 'var(--white)', border: 'var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>🌍</div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, opacity: 0.7, marginBottom: 4 }}>
        No scores yet — be the first!
      </p>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, opacity: 0.4 }}>
        Scores appear here after completing a game.
      </p>
    </div>
  );
}
