'use client';

interface CountdownTimerProps {
  timeRemaining: number;
  totalSeconds: number;
}

export default function CountdownTimer({ timeRemaining, totalSeconds }: CountdownTimerProps) {
  const size = 120;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, timeRemaining / totalSeconds));
  const dashOffset = circumference * (1 - progress);

  const isWarning = timeRemaining <= 30 && timeRemaining > 10;
  const isDanger  = timeRemaining <= 10;

  const ringClass = isDanger ? 'danger' : isWarning ? 'warning' : 'safe';
  const numberColor = isDanger ? 'var(--coral)' : isWarning ? 'var(--orange)' : 'var(--black)';

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const display = minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, '0')}`
    : String(seconds);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: 'visible' }}
      >
        {/* Track */}
        <circle
          className="timer-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
        />
        {/* Fill */}
        <circle
          className={`timer-ring-fill ${ringClass}`}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transformOrigin: `${size / 2}px ${size / 2}px` }}
        />
        {/* Time number */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: display.length > 2 ? 22 : 28,
            fill: numberColor,
            transition: 'fill 0.4s ease',
          }}
        >
          {display}
        </text>
      </svg>
      <span style={{
        fontFamily: 'var(--font-body)',
        fontSize: 11,
        fontWeight: 500,
        opacity: 0.5,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        seconds
      </span>
    </div>
  );
}
