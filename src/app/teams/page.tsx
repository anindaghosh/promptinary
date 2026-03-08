'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  arrayUnion, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/AuthModal';

interface Team {
  id: string;
  name: string;
  inviteCode: string;
  createdBy: string;
  memberUids: string[];
  createdAt?: Date;
}

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function TeamsPage() {
  const router = useRouter();
  const { user, profile, isAnonymous, loading } = useAuth();

  const [teams, setTeams]             = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [tab, setTab]                 = useState<'my' | 'create' | 'join'>('my');
  const [teamName, setTeamName]       = useState('');
  const [joinCode, setJoinCode]       = useState('');
  const [busy, setBusy]               = useState(false);
  const [success, setSuccess]         = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const loadTeams = useCallback(async () => {
    if (!profile?.teamIds?.length) { setTeams([]); setLoadingTeams(false); return; }
    setLoadingTeams(true);
    try {
      const ids = profile.teamIds.slice(0, 10);
      const q = query(collection(db, 'teams'), where('__name__', 'in', ids));
      const snap = await getDocs(q);
      setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Team)));
    } catch (e) {
      console.error('Failed to load teams:', e);
    } finally {
      setLoadingTeams(false);
    }
  }, [profile?.teamIds]);

  useEffect(() => {
    if (!loading && !isAnonymous) loadTeams();
    else if (!loading) setLoadingTeams(false);
  }, [loading, isAnonymous, loadTeams]);

  const handleCreateTeam = async () => {
    if (!teamName.trim()) { setError('Please enter a team name'); return; }
    if (!user) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const teamId     = doc(collection(db, 'teams')).id;
      const inviteCode = generateInviteCode();
      const team: Team = {
        id: teamId, name: teamName.trim(), inviteCode,
        createdBy: user.uid, memberUids: [user.uid],
      };
      await setDoc(doc(db, 'teams', teamId), { ...team, createdAt: serverTimestamp() });
      // Add to user's teamIds
      await updateDoc(doc(db, 'users', user.uid), { teamIds: arrayUnion(teamId) });
      setSuccess(`Team "${team.name}" created! Invite code: ${inviteCode}`);
      setTeamName('');
      await loadTeams();
      setTab('my');
    } catch (e: any) {
      setError(e?.message || 'Failed to create team');
    } finally {
      setBusy(false);
    }
  };

  const handleJoinTeam = async () => {
    if (!joinCode.trim()) { setError('Please enter an invite code'); return; }
    if (!user) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const code = joinCode.trim().toUpperCase();
      const q    = query(collection(db, 'teams'), where('inviteCode', '==', code));
      const snap = await getDocs(q);
      if (snap.empty) { setError('No team found with that code'); setBusy(false); return; }
      const teamDoc = snap.docs[0];
      const teamData = teamDoc.data() as Team;
      if (teamData.memberUids.includes(user.uid)) { setError("You're already in this team!"); setBusy(false); return; }

      await updateDoc(doc(db, 'teams', teamDoc.id), { memberUids: arrayUnion(user.uid) });
      await updateDoc(doc(db, 'users', user.uid), { teamIds: arrayUnion(teamDoc.id) });
      setSuccess(`Joined "${teamData.name}"!`);
      setJoinCode('');
      await loadTeams();
      setTab('my');
    } catch (e: any) {
      setError(e?.message || 'Failed to join team');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (isAnonymous) {
    return (
      <div className="page-wrapper">
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
        <div className="page-content" style={{ paddingTop: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, marginBottom: 12 }}>Teams</h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, opacity: 0.7, marginBottom: 24, lineHeight: 1.5 }}>
            Sign in with Google to create and join teams.
          </p>
          <button className="btn btn-primary" onClick={() => setShowAuthModal(true)}>Sign In with Google</button>
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => router.push('/')}>← Back</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      <div className="page-content" style={{ paddingTop: 24, paddingBottom: 48 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, opacity: 0.6, padding: '4px 0' }}>
            ← Home
          </button>
        </div>

        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, marginBottom: 6 }}>Teams</h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, opacity: 0.6, marginBottom: 24 }}>
          Compete within your team or challenge friends
        </p>

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: 'var(--track)', borderRadius: 'var(--radius-pill)', padding: 4, marginBottom: 20, border: 'var(--border)' }}>
          {(['my', 'create', 'join'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setError(null); setSuccess(null); }} style={{
              flex: 1, padding: '9px 0',
              border: tab === t ? 'var(--border)' : '2px solid transparent',
              borderRadius: 'var(--radius-pill)',
              background: tab === t ? 'var(--white)' : 'transparent',
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13,
              cursor: 'pointer', boxShadow: tab === t ? 'var(--shadow-sm)' : 'none',
              color: 'var(--black)',
            }}>
              {t === 'my' ? 'My Teams' : t === 'create' ? 'Create' : 'Join'}
            </button>
          ))}
        </div>

        {/* Feedback */}
        {success && (
          <div style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--teal)', border: 'var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--white)', boxShadow: 'var(--shadow-sm)' }}>
            ✓ {success}
          </div>
        )}
        {error && (
          <div style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--coral)', border: 'var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--white)' }}>
            {error}
          </div>
        )}

        {/* My Teams */}
        {tab === 'my' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {loadingTeams ? (
              <LoadingScreen small />
            ) : teams.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', background: 'var(--white)', border: 'var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>👥</div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, opacity: 0.7, marginBottom: 16 }}>You haven&apos;t joined any teams yet.</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => setTab('create')}>Create Team</button>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setTab('join')}>Join Team</button>
                </div>
              </div>
            ) : (
              teams.map(team => (
                <TeamCard key={team.id} team={team} myUid={user!.uid} />
              ))
            )}
          </div>
        )}

        {/* Create Team */}
        {tab === 'create' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card" style={{ padding: 16 }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, opacity: 0.7, lineHeight: 1.5 }}>
                Create a team and share the invite code with teammates. Team games are private — only members can join.
              </p>
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Team Name</label>
              <input
                className="input"
                type="text"
                placeholder="e.g. Design Squad"
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateTeam()}
                maxLength={32}
              />
            </div>
            <button className="btn btn-primary" onClick={handleCreateTeam} disabled={busy}>
              {busy ? 'Creating...' : 'Create Team ▶'}
            </button>
          </div>
        )}

        {/* Join Team */}
        {tab === 'join' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card" style={{ padding: 16 }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, opacity: 0.7, lineHeight: 1.5 }}>
                Ask your team admin for the 6-character invite code.
              </p>
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Invite Code</label>
              <input
                className="input"
                type="text"
                placeholder="Enter 6-char code..."
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoinTeam()}
                maxLength={6}
                style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}
              />
            </div>
            <button className="btn btn-primary" onClick={handleJoinTeam} disabled={busy}>
              {busy ? 'Joining...' : 'Join Team ▶'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamCard({ team, myUid }: { team: Team; myUid: string }) {
  const [copied, setCopied] = useState(false);
  const isAdmin = team.createdBy === myUid;

  const copy = () => {
    navigator.clipboard.writeText(team.inviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 16 }}>{team.name}</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, opacity: 0.6, marginTop: 2 }}>
            {team.memberUids.length} member{team.memberUids.length !== 1 ? 's' : ''}{isAdmin ? ' · Admin' : ''}
          </div>
        </div>
        <span className="badge badge-sky">{team.memberUids.length}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--track)', borderRadius: 'var(--radius-md)' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, letterSpacing: '0.1em' }}>
          {team.inviteCode}
        </span>
        <button onClick={copy} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--teal)' }}>
          {copied ? '✓ Copied!' : 'Copy Code'}
        </button>
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
