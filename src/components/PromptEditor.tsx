'use client';

import { useState, useRef, useEffect } from 'react';

const TOKEN_BUDGET = 120;

function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function getBarState(remaining: number, budget: number): 'safe' | 'warning' | 'danger' {
  const pct = remaining / budget;
  if (pct > 0.5) return 'safe';
  if (pct > 0.2) return 'warning';
  return 'danger';
}

interface PromptEditorProps {
  budget?: number;
  onSubmit: (prompt: string, tokensUsed: number) => void;
  disabled?: boolean;
  generating?: boolean;
}

export default function PromptEditor({
  budget = TOKEN_BUDGET,
  onSubmit,
  disabled = false,
  generating = false,
}: PromptEditorProps) {
  const [prompt, setPrompt] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const tokensUsed = countTokens(prompt);
  const tokensRemaining = budget - tokensUsed;
  const barState = getBarState(tokensRemaining, budget);
  const barPct = Math.max(0, Math.min(100, (tokensRemaining / budget) * 100));
  const overBudget = tokensUsed > budget;

  // Shake when over budget
  useEffect(() => {
    if (overBudget && !isShaking) {
      setIsShaking(true);
      const t = setTimeout(() => setIsShaking(false), 500);
      return () => clearTimeout(t);
    }
  }, [overBudget, isShaking]);

  const handleSubmit = () => {
    if (!prompt.trim() || overBudget || disabled || generating) return;
    onSubmit(prompt.trim(), tokensUsed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  const tokenColor = barState === 'safe' ? 'var(--gold)' : barState === 'warning' ? 'var(--orange)' : 'var(--coral)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Token counter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, opacity: 0.7 }}>
          Tokens
        </span>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 900,
          fontSize: 22,
          color: tokenColor,
          transition: 'color 0.3s ease',
          animation: isShaking ? 'shake 0.5s ease forwards' : undefined,
        }}>
          {tokensRemaining}
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13, color: 'var(--black)', opacity: 0.5 }}>
            &nbsp;/ {budget}
          </span>
        </span>
      </div>

      {/* Progress bar */}
      <div className="token-bar-track">
        <div
          className={`token-bar-fill ${barState}`}
          style={{ width: `${barPct}%` }}
        />
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        className="prompt-textarea"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Describe the image you see... be precise but budget your tokens wisely."
        disabled={disabled || generating}
        rows={5}
        style={{
          borderColor: overBudget ? 'var(--coral)' : undefined,
          animation: isShaking ? 'shake 0.5s ease forwards' : undefined,
        }}
      />

      {/* Over budget warning */}
      {overBudget && (
        <div style={{
          padding: '8px 12px',
          background: 'var(--coral)',
          border: 'var(--border)',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          fontSize: 13,
          color: 'var(--white)',
        }}>
          Over budget by {-tokensRemaining} token{-tokensRemaining !== 1 ? 's' : ''}. Trim your prompt!
        </div>
      )}

      {/* Submit button */}
      <button
        className="btn btn-dark"
        onClick={handleSubmit}
        disabled={!prompt.trim() || overBudget || disabled || generating}
        style={{ marginTop: 4 }}
      >
        {generating ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <InlineSpinner color="white" /> Generating image...
          </span>
        ) : (
          <>Generate ▶</>
        )}
      </button>

      <p style={{
        textAlign: 'center',
        fontFamily: 'var(--font-body)',
        fontSize: 12,
        opacity: 0.4,
      }}>
        ⌘ + Enter to submit
      </p>
    </div>
  );
}

function InlineSpinner({ color = 'black' }: { color?: string }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 14,
      height: 14,
      border: `2px solid ${color === 'white' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.2)'}`,
      borderTopColor: color === 'white' ? 'white' : 'black',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
  );
}
