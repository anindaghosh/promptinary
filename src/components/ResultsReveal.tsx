'use client';

import { useEffect, useRef, useState } from 'react';
import { PlayerResult, ReferenceImage } from '@/hooks/useGameSocket';

interface ResultsRevealProps {
  results: PlayerResult[];
  referenceImage: ReferenceImage | null;
  myPlayerId: string | null;
}

export default function ResultsReveal({ results, referenceImage, myPlayerId }: ResultsRevealProps) {
  const [visibleCount, setVisibleCount] = useState(0);

  // Stagger reveal each player's card
  useEffect(() => {
    setVisibleCount(0);
    const reveal = (idx: number) => {
      if (idx >= results.length) return;
      setTimeout(() => {
        setVisibleCount(idx + 1);
        reveal(idx + 1);
      }, 600);
    };
    const initial = setTimeout(() => reveal(0), 300);
    return () => clearTimeout(initial);
  }, [results]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 24,
        textAlign: 'center',
      }}>
        Round Results
      </h2>

      {results.map((result, i) => (
        <div
          key={result.playerId}
          style={{
            opacity: i < visibleCount ? 1 : 0,
            transform: i < visibleCount ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
            transition: 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <PlayerResultCard
            result={result}
            referenceImage={referenceImage}
            isMe={result.playerId === myPlayerId}
          />
        </div>
      ))}
    </div>
  );
}

function PlayerResultCard({
  result,
  referenceImage,
  isMe,
}: {
  result: PlayerResult;
  referenceImage: ReferenceImage | null;
  isMe: boolean;
}) {
  const isWinner = result.rank === 1;

  return (
    <div
      className="card"
      style={{
        background: isMe ? 'var(--lavender)' : isWinner ? 'var(--gold)' : 'var(--white)',
        position: 'relative',
        overflow: 'visible',
      }}
    >
      {/* Rank + winner badge */}
      {isWinner && (
        <div style={{
          position: 'absolute',
          top: -12,
          left: 16,
          background: 'var(--teal)',
          color: 'var(--white)',
          border: 'var(--border)',
          borderRadius: 'var(--radius-pill)',
          padding: '3px 12px',
          fontFamily: 'var(--font-body)',
          fontWeight: 700,
          fontSize: 12,
          boxShadow: 'var(--shadow-sm)',
        }}>
          🏆 Winner
        </div>
      )}

      {/* Player header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 'var(--radius-pill)',
          border: 'var(--border)',
          background: 'var(--white)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          flexShrink: 0,
          boxShadow: 'var(--shadow-sm)',
        }}>
          {result.avatar}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15 }}>
            {result.playerName} {isMe && <span style={{ opacity: 0.6, fontWeight: 400 }}>(You)</span>}
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, opacity: 0.6, marginTop: 1 }}>
            {result.tokensUsed} tokens used
          </div>
        </div>
        <AnimatedScore value={result.totalScore} />
      </div>

      {/* Image comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <ImageCard label="Target" src={referenceImage?.url} />
        <ImageCard label="Your AI" src={result.imageData || undefined} placeholder={!result.imageData} />
      </div>

      {/* Similarity score */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.6)',
        border: 'var(--border)',
        borderRadius: 'var(--radius-md)',
        marginBottom: 12,
      }}>
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13 }}>
          Similarity
        </span>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 900,
          fontSize: 22,
          color: result.similarityScore >= 70 ? 'var(--teal)' : result.similarityScore >= 40 ? 'var(--orange)' : 'var(--coral)',
        }}>
          {result.similarityScore}%
        </span>
      </div>

      {/* Score breakdown chips */}
      {result.scoreBreakdown && Object.keys(result.scoreBreakdown).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {[
            { label: 'Composition', value: result.scoreBreakdown.composition },
            { label: 'Color',       value: result.scoreBreakdown.colorPalette },
            { label: 'Content',     value: result.scoreBreakdown.subjectContent },
            { label: 'Style',       value: result.scoreBreakdown.styleAtmosphere },
          ].map(dim => (
            <div key={dim.label} style={{
              padding: '4px 10px',
              background: 'var(--white)',
              border: '1.5px solid var(--black)',
              borderRadius: 'var(--radius-pill)',
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              fontWeight: 600,
            }}>
              {dim.label}: <strong>{dim.value ?? '—'}</strong>
            </div>
          ))}
        </div>
      )}

      {/* Prompt used */}
      <div style={{
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.5)',
        border: '1.5px dashed var(--black)',
        borderRadius: 'var(--radius-md)',
      }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, opacity: 0.6, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Prompt used
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.5 }}>
          &ldquo;{result.prompt}&rdquo;
        </div>
      </div>

      {/* Reasoning */}
      {result.reasoning && (
        <div style={{ marginTop: 10, fontFamily: 'var(--font-body)', fontSize: 12, opacity: 0.65, lineHeight: 1.5 }}>
          {result.reasoning}
        </div>
      )}
    </div>
  );
}

function ImageCard({ label, src, placeholder }: { label: string; src?: string; placeholder?: boolean }) {
  return (
    <div style={{
      border: 'var(--border)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
      background: 'var(--track)',
    }}>
      <div style={{
        padding: '4px 8px',
        background: 'var(--black)',
        color: 'var(--white)',
        fontFamily: 'var(--font-body)',
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </div>
      {src && !placeholder ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={label}
          style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{
          width: '100%',
          aspectRatio: '1 / 1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          opacity: 0.4,
          flexDirection: 'column',
          gap: 4,
        }}>
          <span style={{ fontSize: 24 }}>🖼️</span>
          <span>No image</span>
        </div>
      )}
    </div>
  );
}

function AnimatedScore({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 1200;
    const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      setDisplay(Math.round(easeOutExpo(t) * value));
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value]);

  return (
    <div style={{
      fontFamily: 'var(--font-display)',
      fontWeight: 900,
      fontSize: 28,
      lineHeight: 1,
      textAlign: 'right',
    }}>
      {display}
      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 11, opacity: 0.5, textAlign: 'center' }}>
        pts
      </div>
    </div>
  );
}
