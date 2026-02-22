import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium tracking-[-0.008em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110 hover:shadow-xl hover:shadow-primary/25',
        premium:
          'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 text-slate-900 font-semibold shadow-lg shadow-amber-500/25 hover:shadow-xl hover:shadow-amber-500/30 hover:brightness-105 bg-[length:200%_100%] hover:bg-right transition-[background-position,box-shadow,filter] duration-500',
        secondary:
          'bg-secondary text-secondary-foreground border border-border/50 hover:bg-muted hover:border-border',
        outline:
          'border border-border/60 bg-transparent text-foreground hover:bg-muted/50 hover:border-border',
        ghost: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg shadow-destructive/20',
        link: 'text-primary underline-offset-4 hover:underline',
        glass:
          'glass-card text-foreground hover:bg-white/[0.06]',
      },
      size: {
        default: 'h-10 px-5',
        sm: 'h-9 px-3.5 text-xs',
        lg: 'h-12 px-7 text-[15px]',
        xl: 'h-14 px-10 text-[15px]',
        icon: 'h-10 w-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
