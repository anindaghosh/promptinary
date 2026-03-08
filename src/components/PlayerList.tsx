'use client';

import { Player } from '@/hooks/useGameSocket';

interface PlayerListProps {
  players: Player[];
  myPlayerId: string | null;
  onToggleReady: (isReady: boolean) => void;
  canStart: boolean;
  onStartGame: () => void;
  isHost: boolean;
}

export default function PlayerList({
  players,
  myPlayerId,
  onToggleReady,
  canStart,
  onStartGame,
  isHost,
}: PlayerListProps) {
  const me = players.find(p => p.id === myPlayerId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {players.map((player, i) => {
        const isMe = player.id === myPlayerId;
        return (
          <div
            key={player.id}
            className={`player-row ${isMe ? 'is-you' : ''} animate-slide-up`}
            style={{ animationDelay: `${i * 0.08}s`, opacity: 0, animationFillMode: 'forwards' }}
          >
            {/* Avatar */}
            <div className="avatar">
              {player.avatar}
            </div>

            {/* Name + badges */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 700,
                  fontSize: 14,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {player.name}
                </span>
                {isMe && (
                  <span className="badge badge-sky" style={{ fontSize: 10 }}>You</span>
                )}
                {player.isHost && (
                  <span style={{ fontSize: 14 }} title="Host">👑</span>
                )}
              </div>
            </div>

            {/* Ready status */}
            <div>
              {isMe ? (
                <button
                  className={`btn btn-sm btn-auto ${me?.isReady ? 'btn-primary' : 'btn-coral'}`}
                  onClick={() => onToggleReady(!me?.isReady)}
                >
                  {me?.isReady ? '✓ Ready' : 'Ready Up'}
                </button>
              ) : (
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  fontSize: 13,
                  color: player.isReady ? 'var(--teal)' : 'var(--black)',
                  opacity: player.isReady ? 1 : 0.4,
                }}>
                  {player.isReady ? '✓ Ready' : 'Waiting...'}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Waiting for more players */}
      {players.length < 2 && (
        <div style={{
          textAlign: 'center',
          padding: '16px',
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          opacity: 0.5,
          border: '1.5px dashed var(--black)',
          borderRadius: 'var(--radius-md)',
          marginTop: 4,
        }}>
          Waiting for more players to join...
        </div>
      )}

      {/* Start game button (host only) */}
      {isHost && (
        <button
          className="btn btn-dark"
          onClick={onStartGame}
          disabled={!canStart}
          style={{ marginTop: 8 }}
        >
          {!canStart
            ? `Waiting for players (${players.filter(p => p.isReady).length}/${players.length} ready)`
            : 'Start Game ▶'
          }
        </button>
      )}
    </div>
  );
}
