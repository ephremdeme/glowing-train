# Frontend Redesign — Design Brief

> **Direction**: "Cosmic Remittance" — luxury fintech meets playful motion. Premium but approachable.

## Visual Identity

### Palette

| Role | HSL | Hex approx | Usage |
|------|-----|-----------|-------|
| Primary (violet) | `262 83% 64%` | `#8B5CF6` | CTAs, glows, active states |
| Secondary (coral) | `14 90% 65%` | `#F0714A` | Accents, highlights, urgency |
| Accent (mint) | `160 84% 55%` | `#22D98E` | Success, confirmations, PAID state |
| Background | Deep indigo layers | `#08061A` base | Multi-layer gradient mesh |
| Card surface | Glassmorphism | Semi-transparent | `backdrop-filter: blur(24px)` |

### Typography

- **Display**: `Outfit` (geometric, friendly — distinctive without being novelty)
- **Mono**: `JetBrains Mono` (deposit addresses, transfer IDs)
- **Scale**: 7xl hero → 4xl page title → xl section → base body

### Layout System

- Max container `1260px` centered
- 2-column hero on desktop (text left, illustration right), stacked on mobile
- `rounded-[2rem]` cards with glassmorphism
- Generous padding (p-8 to p-10 on hero sections)

## Component Strategy

| Component | Style |
|-----------|-------|
| **Button (default)** | Violet gradient fill + white text + glow shadow + scale on hover |
| **Button (outline)** | Glass border + violet glow on hover |
| **Card** | Glassmorphism panel: blur + semi-transparent + top inner light line |
| **Badge** | Rounded-full, tinted bg matching color intent |
| **Input / Select** | Semi-transparent dark bg, violet focus ring |
| **FlowProgress** | Connected dot-path timeline with animated fill, step icons, confetti on PAID |
| **Alert** | Glass panel with colored left border |

## Illustration Strategy

Three large, bespoke SVG component illustrations:

1. **HeroGlobeScene** (landing `page.tsx`): Abstract wireframe globe with orbiting currency symbols (USDC logo, ETB icon), flowing arc lines, gradient orbs. 400–600px tall. Gentle floating animation.

2. **TransferJourneyScene** (transfer + deposit page): Stylized path from wallet icon → chain bridge → bank building, with animated token dots flowing along the path. Shows the non-custodial journey visually.

3. **StatusCelebrationScene** (status page): Miniature journey path with celebration state — sparkles and confetti burst when PAID, pulsing dots when in-progress.

All illustrations are responsive SVGs with CSS animations, no raster images.

## Motion Strategy

| Where | What | Why |
|-------|------|-----|
| Page load | Staggered fade-up reveals (title → sub → CTA → illustration) | First impression delight |
| Hero illustration | Floating orbs + orbiting elements (4–6s infinite) | Life & energy without distraction |
| Cards | Lift + glow intensify on hover (260ms ease) | Interactive feedback |
| FlowProgress | Sequential step highlight, progress line fill | Visual journey metaphor |
| PAID state | Confetti burst + bounce-scale on badge | Celebratory moment |
| Reduced motion | All animations disabled via `prefers-reduced-motion: reduce` | Accessibility |
