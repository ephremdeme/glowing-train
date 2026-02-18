import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: {
        '2xl': '1260px'
      }
    },
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        gold: {
          50: '#fefce8',
          100: '#fef9c3',
          200: '#fef08a',
          300: '#fde047',
          400: '#facc15',
          500: '#eab308',
          600: '#ca8a04',
          DEFAULT: 'hsl(var(--primary))',
        },
        surface: {
          DEFAULT: 'hsl(225 16% 7%)',
          raised: 'hsl(225 14% 10%)',
          overlay: 'hsl(225 12% 14%)',
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      boxShadow: {
        soft: '0 1px 3px 0 rgba(0,0,0,0.15), 0 1px 2px -1px rgba(0,0,0,0.1)',
        card: '0 2px 8px -2px rgba(0,0,0,0.2), 0 1px 2px -1px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,255,255,0.03)',
        elevated: '0 8px 32px -8px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04)',
        'depth': '0 24px 80px -16px rgba(0,0,0,0.5)',
        'glow': '0 0 20px hsl(42 92% 56% / 0.15), 0 0 60px hsl(42 92% 56% / 0.08)',
        'glow-sm': '0 0 12px hsl(42 92% 56% / 0.1)',
        'glow-blue': '0 0 20px hsl(220 70% 55% / 0.15), 0 0 60px hsl(220 70% 55% / 0.08)',
        'inner-glass': 'inset 0 1px 0 0 rgba(255,255,255,0.06), inset 0 -1px 0 0 rgba(0,0,0,0.1)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        floaty: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' }
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '33%': { transform: 'translateY(-6px) rotate(1deg)' },
          '66%': { transform: 'translateY(3px) rotate(-0.5deg)' },
        },
        'confetti-pop': {
          '0%': { opacity: '0', transform: 'scale(0.5)' },
          '60%': { opacity: '1', transform: 'scale(1.1)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        'flow-pulse': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
        'shimmer-gold': {
          '0%': { backgroundPosition: '-300% center' },
          '100%': { backgroundPosition: '300% center' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'orbit-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'beam': {
          '0%': { opacity: '0', transform: 'translateX(-100%)' },
          '50%': { opacity: '1' },
          '100%': { opacity: '0', transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 520ms cubic-bezier(0.22, 1, 0.36, 1) both',
        floaty: 'floaty 5s ease-in-out infinite',
        'float-slow': 'float-slow 8s ease-in-out infinite',
        'confetti-pop': 'confetti-pop 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'flow-pulse': 'flow-pulse 2s ease-in-out infinite',
        shimmer: 'shimmer 3s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'shimmer-gold': 'shimmer-gold 6s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 8s ease-in-out infinite',
        'orbit-slow': 'orbit-slow 30s linear infinite',
        'beam': 'beam 2.5s ease-in-out infinite',
      }
    }
  },
  plugins: [tailwindcssAnimate]
};

export default config;
