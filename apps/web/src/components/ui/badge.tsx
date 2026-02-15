import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors', {
  variants: {
    variant: {
      default: 'border-primary/30 bg-primary/20 text-primary',
      secondary: 'border-secondary/30 bg-secondary/20 text-secondary',
      outline: 'border-border bg-transparent text-muted-foreground',
      success: 'border-emerald-400/35 bg-emerald-400/18 text-emerald-300',
      warning: 'border-amber-300/35 bg-amber-300/18 text-amber-200',
      destructive: 'border-destructive/35 bg-destructive/15 text-red-200'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
