import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex h-11 w-full rounded-xl border border-border/50 bg-muted/30 px-4 py-2 text-sm text-foreground',
      'placeholder:text-muted-foreground/50',
      'transition-all duration-200',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/40 focus-visible:bg-muted/50',
      'hover:border-border/70 hover:bg-muted/40',
      'disabled:cursor-not-allowed disabled:opacity-40',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
