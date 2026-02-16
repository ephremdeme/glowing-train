# Frontend Redesign — Execution Plan

## Milestone 1 — Design System & Landing Page (immediate)
1. Update `globals.css` — new palette, glassmorphism, gradient blobs, utility classes
2. Update `tailwind.config.ts` — new keyframes, shadows, background images
3. Update `layout.tsx` — switch to Outfit font
4. Update `card.tsx` and `button.tsx` — new glass-panel / violet theme
5. Create `hero-globe-scene.tsx` — large SVG illustration
6. Create `transfer-journey-scene.tsx` — transfer page illustration
7. Create `status-celebration-scene.tsx` — status page illustration
8. Create `flow-progress.tsx` — playful journey timeline
9. Redesign landing `page.tsx` — bold hero, large illustration, gradient blobs
10. Update `app-shell.tsx` — refined nav, gradient logo badge
11. **Verify**: browser-open landing, check layout + console

## Milestone 2 — Quote & Transfer Pages
1. Restyle `/quote/page.tsx` — glass cards, illustration accent
2. Restyle `/transfer/page.tsx` — premium deposit layout
3. Redesign `deposit-instructions.tsx` — big visuals, badges, safety tips
4. **Verify**: browser-open quote + transfer flow

## Milestone 3 — Status, History, Auth & Polish
1. Redesign `/transfers/[id]/page.tsx` — FlowProgress, celebration scene
2. Restyle `/history/page.tsx` — glass cards
3. Restyle `/login` + `/signup` — gradient blob accents
4. Micro-animation polish pass
5. **Verify**: browser-open status, auth pages

## Milestone 4 — E2E & Validation
1. Update e2e test selectors if any label text changed
2. Run `pnpm dev` build check
3. Run Playwright happy-path test
4. Create walkthrough.md with screenshots
