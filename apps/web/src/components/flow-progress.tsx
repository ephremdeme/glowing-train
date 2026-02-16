'use client';

import type { UiTransferStatus } from '@/lib/contracts';
import { Wallet, Link as LinkIcon, ShieldCheck, Landmark, Clock, PartyPopper } from 'lucide-react';

const STEPS: { key: UiTransferStatus; label: string; icon: typeof Wallet }[] = [
  { key: 'CREATED', label: 'Created', icon: Wallet },
  { key: 'AWAITING_DEPOSIT', label: 'Awaiting Deposit', icon: Clock },
  { key: 'CONFIRMING', label: 'Confirming', icon: LinkIcon },
  { key: 'SETTLED', label: 'Settled', icon: ShieldCheck },
  { key: 'PAYOUT_PENDING', label: 'Payout Pending', icon: Landmark },
  { key: 'PAID', label: 'Paid Out', icon: PartyPopper },
];

const FLOW_KEYS: UiTransferStatus[] = STEPS.map((s) => s.key);

function flowIndex(status: UiTransferStatus): number {
  if (status === 'FAILED') return -1;
  return FLOW_KEYS.indexOf(status);
}

interface FlowProgressProps {
  status: UiTransferStatus;
  className?: string;
}

export function FlowProgress({ status, className = '' }: FlowProgressProps) {
  const currentIdx = flowIndex(status);
  const isFailed = status === 'FAILED';
  const isPaid = status === 'PAID';

  return (
    <div className={`grid gap-4 ${className}`} role="list" aria-label="Transfer timeline">
      {/* Desktop horizontal layout */}
      <div className="hidden md:block">
        <div className="relative flex items-center justify-between">
          {/* Background track */}
          <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-border" />
          {/* Filled track */}
          {currentIdx >= 0 && (
            <div
              className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-primary transition-all duration-700"
              style={{ width: `${(currentIdx / (STEPS.length - 1)) * 100}%` }}
            />
          )}

          {STEPS.map((step, idx) => {
            const isComplete = idx <= currentIdx;
            const isCurrent = idx === currentIdx;
            const StepIcon = step.icon;

            return (
              <div key={step.key} className="relative z-10 flex flex-col items-center gap-2" role="listitem">
                <div
                  className={`
                    flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300
                    ${isFailed && isCurrent
                      ? 'border-destructive bg-destructive/10 text-destructive'
                      : isPaid && step.key === 'PAID'
                        ? 'border-green-500 bg-green-50 text-green-600 celebration-burst'
                        : isComplete
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-muted text-muted-foreground'
                    }
                  `}
                >
                  <StepIcon className="h-4 w-4" />
                </div>
                <span
                  className={`text-[10px] font-medium uppercase tracking-wider transition-colors ${
                    isComplete ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile vertical layout */}
      <div className="grid gap-0 md:hidden">
        {STEPS.map((step, idx) => {
          const isComplete = idx <= currentIdx;
          const isCurrent = idx === currentIdx;
          const isLast = idx === STEPS.length - 1;
          const StepIcon = step.icon;

          return (
            <div key={step.key} className="flex gap-3" role="listitem">
              <div className="flex flex-col items-center">
                <div
                  className={`
                    flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all
                    ${isFailed && isCurrent
                      ? 'border-destructive bg-destructive/10 text-destructive'
                      : isPaid && step.key === 'PAID'
                        ? 'border-green-500 bg-green-50 text-green-600 celebration-burst'
                        : isComplete
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-muted text-muted-foreground'
                    }
                  `}
                >
                  <StepIcon className="h-3.5 w-3.5" />
                </div>
                {!isLast && (
                  <div
                    className={`w-[2px] grow ${isComplete ? 'bg-primary' : 'bg-border'}`}
                    style={{ minHeight: '24px' }}
                  />
                )}
              </div>
              <div className="pb-4">
                <p
                  className={`text-sm font-medium ${
                    isComplete ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {step.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
