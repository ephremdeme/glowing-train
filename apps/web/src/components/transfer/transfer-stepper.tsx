'use client';

import { CheckCircle } from 'lucide-react';

type Step = {
    id: string;
    label: string;
};

const STEPS: Step[] = [
    { id: 'quote', label: 'Quote' },
    { id: 'recipient', label: 'Recipient' },
    { id: 'fund', label: 'Fund' },
    { id: 'complete', label: 'Complete' },
];

interface TransferStepperProps {
    /** Current step id: 'quote' | 'recipient' | 'fund' | 'complete' */
    currentStep: string;
}

export function TransferStepper({ currentStep }: TransferStepperProps) {
    const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

    return (
        <div className="flex items-center gap-0" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemax={STEPS.length}>
            {STEPS.map((step, index) => {
                const isCompleted = index < currentIndex;
                const isCurrent = index === currentIndex;
                const isUpcoming = index > currentIndex;

                return (
                    <div key={step.id} className="flex flex-1 items-center">
                        {/* Step circle */}
                        <div className="flex flex-col items-center gap-1.5">
                            <div
                                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all ${isCompleted
                                        ? 'bg-accent text-accent-foreground'
                                        : isCurrent
                                            ? 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-background'
                                            : 'bg-muted text-muted-foreground'
                                    }`}
                            >
                                {isCompleted ? <CheckCircle className="h-4 w-4" /> : index + 1}
                            </div>
                            <span
                                className={`text-[10px] font-medium uppercase tracking-wider ${isCurrent ? 'text-primary' : isUpcoming ? 'text-muted-foreground/50' : 'text-muted-foreground'
                                    }`}
                            >
                                {step.label}
                            </span>
                        </div>

                        {/* Connector line */}
                        {index < STEPS.length - 1 ? (
                            <div
                                className={`mx-1 h-0.5 flex-1 rounded-full transition-all ${isCompleted ? 'bg-accent' : 'bg-border/60'
                                    }`}
                            />
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}
