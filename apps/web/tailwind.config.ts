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
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(58, 224, 255, 0.16), 0 22px 56px -30px rgba(58, 224, 255, 0.65)',
        panel: '0 34px 70px -42px rgba(0, 0, 0, 0.9)',
        neon: '0 0 0 1px rgba(132, 204, 22, 0.2), 0 16px 36px -20px rgba(132, 204, 22, 0.6)'
      },
      backgroundImage: {
        'hero-grid':
          'radial-gradient(circle at 8% -15%, rgba(56, 189, 248, 0.24), transparent 40%), radial-gradient(circle at 96% 0%, rgba(132, 204, 22, 0.19), transparent 34%), linear-gradient(160deg, rgba(17, 29, 67, 0.93), rgba(8, 14, 37, 0.94) 58%, rgba(4, 8, 24, 0.96))'
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        floaty: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' }
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 0 1px rgba(56, 189, 248, 0.2), 0 0 0 rgba(56, 189, 248, 0)' },
          '50%': { boxShadow: '0 0 0 1px rgba(56, 189, 248, 0.4), 0 0 28px rgba(56, 189, 248, 0.35)' }
        }
      },
      animation: {
        'fade-up': 'fade-up 480ms ease-out both',
        floaty: 'floaty 4.8s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2.6s ease-in-out infinite'
      }
    }
  },
  plugins: [tailwindcssAnimate]
};

export default config;
