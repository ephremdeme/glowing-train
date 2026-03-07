import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors', {
  variants: {
    variant: {
      default: 'border-primary/30 bg-primary/15 text-primary dark:bg-primary/20',
      secondary: 'border-secondary/30 bg-secondary/20 text-secondary-foreground',
      outline: 'border-border bg-transparent text-muted-foreground',
      success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/35 dark:bg-emerald-400/18 dark:text-emerald-300',
      warning: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:border-amber-300/35 dark:bg-amber-300/18 dark:text-amber-200',
      destructive: 'border-red-500/25 bg-red-500/10 text-red-700 dark:border-destructive/35 dark:bg-destructive/15 dark:text-red-200'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
