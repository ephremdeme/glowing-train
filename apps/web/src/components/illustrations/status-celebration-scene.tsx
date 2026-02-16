'use client';

interface StatusCelebrationSceneProps {
  className?: string;
  status?: 'CREATED' | 'AWAITING_DEPOSIT' | 'CONFIRMING' | 'SETTLED' | 'PAYOUT_PENDING' | 'PAID' | 'FAILED';
}

export function StatusCelebrationScene({ className = '', status = 'AWAITING_DEPOSIT' }: StatusCelebrationSceneProps) {
  const isPaid = status === 'PAID';
  const isFailed = status === 'FAILED';

  return (
    <div className={`relative select-none ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 400 120"
        className="h-full w-full"
        role="img"
        aria-label={isPaid ? 'Transfer completed celebration' : 'Transfer in progress'}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Journey path */}
        <line x1="40" y1="50" x2="360" y2="50" stroke="#E5E7EB" strokeWidth="2" strokeLinecap="round" />
        <line
          x1="40"
          y1="50"
          x2="360"
          y2="50"
          stroke={isPaid ? '#16A34A' : isFailed ? '#DC2626' : '#4F46E5'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={isPaid ? 'none' : '6 4'}
        />

        {/* Step dots */}
        {['CREATED', 'AWAITING_DEPOSIT', 'CONFIRMING', 'SETTLED', 'PAYOUT_PENDING', 'PAID'].map((step, i) => {
          const x = 40 + (i * 64);
          const FLOW = ['CREATED', 'AWAITING_DEPOSIT', 'CONFIRMING', 'SETTLED', 'PAYOUT_PENDING', 'PAID'];
          const currentIdx = FLOW.indexOf(status ?? 'AWAITING_DEPOSIT');
          const isComplete = i <= currentIdx;
          const isCurrent = step === status;

          return (
            <g key={step}>
              <circle
                cx={x}
                cy={50}
                r={isCurrent ? 7 : 5}
                fill={
                  isPaid && step === 'PAID'
                    ? '#16A34A'
                    : isComplete
                      ? '#4F46E5'
                      : '#D1D5DB'
                }
              />
              <text
                x={x}
                y={80}
                textAnchor="middle"
                fill={isComplete ? '#374151' : '#9CA3AF'}
                fontSize="7"
                fontWeight={isCurrent ? '600' : '400'}
              >
                {step === 'AWAITING_DEPOSIT' ? 'DEPOSIT' : step === 'PAYOUT_PENDING' ? 'PAYOUT' : step}
              </text>
            </g>
          );
        })}

        {/* Confetti particles when PAID */}
        {isPaid && (
          <g className="celebration-burst">
            {[
              { cx: 320, cy: 20, r: 2.5, color: '#4F46E5' },
              { cx: 350, cy: 15, r: 2, color: '#F97316' },
              { cx: 360, cy: 30, r: 1.5, color: '#16A34A' },
              { cx: 330, cy: 12, r: 1.5, color: '#EAB308' },
              { cx: 370, cy: 35, r: 2, color: '#4F46E5' },
              { cx: 345, cy: 10, r: 1.5, color: '#16A34A' },
            ].map((p, i) => (
              <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={p.color} fillOpacity="0.7" />
            ))}
          </g>
        )}

        {/* Start label */}
        <rect x="20" y="92" width="40" height="18" rx="4" fill="#EEF2FF" />
        <text x="40" y="104" textAnchor="middle" fill="#4F46E5" fontSize="7" fontWeight="600">SEND</text>

        {/* End label */}
        <rect x="340" y="92" width="40" height="18" rx="4" fill={isPaid ? '#DCFCE7' : '#F3F4F6'} />
        <text x="360" y="104" textAnchor="middle" fill={isPaid ? '#16A34A' : '#6B7280'} fontSize="7" fontWeight="600">{isPaid ? 'DONE' : 'ETB'}</text>
      </svg>
    </div>
  );
}
