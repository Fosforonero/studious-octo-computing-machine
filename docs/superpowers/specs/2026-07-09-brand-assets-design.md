# Official Brand Assets Integration — Design

**Goal:** Replace the placeholder/reconstructed favicon and logo with the two official asset files, and fix the code that hardcodes their old dimensions. No redesign, no new features, no landing publish.

## Context

Two official brand asset files have been delivered:
- `/Users/matteo/Downloads/Lensiq-logo.webp`
- `/Users/matteo/Downloads/lensiq-favicon.webp`

Confirmed via `file` + `sips` (2026-07-09):

| file | dimensions | alpha | space |
|---|---|---|---|
| `lensiq-favicon.webp` | 386×386 | yes | RGB |
| `Lensiq-logo.webp` | 1470×386 | yes | RGB |

Both replace placeholders currently in `public/` (`lensiq-favicon.webp` at 431×430, `lensiq-logo.webp` at 815×655 — different hashes, dated 2026-07-06, confirmed placeholders).

Current touchpoints (found by grepping the full repo, not just `src/`):
- `src/components/brand.tsx` — renders `/lensiq-favicon.webp` inside a white `rounded-xl` badge (`size-10`, `overflow-hidden`, `object-cover`), plus **live text** "lensi" + a CSS-gradient "q" (`bg-gradient-to-br from-[#2f6de1] to-[#8b2bdb]`) — not an image or SVG.
- `src/app/layout.tsx` — `metadata.icons`: references `/lensiq-favicon.webp`, `/icon.png`, and `apple: "/apple-touch-icon.png"`.
- `src/app/manifest.ts` — PWA manifest icons array: `/lensiq-favicon.webp` (`sizes: "431x430"`) and `/apple-touch-icon.png` (`sizes: "180x180"`).
- `src/app/icon.png` — Next.js App Router convention file (static PNG, 431×430), auto-served at `/icon.png`.
- `public/apple-touch-icon.png` — static PNG, 180×180.
- `public/lensiq-logo.webp` (815×655) — **not referenced anywhere in the codebase.** An orphaned placeholder.

No reconstructed SVG logo exists anywhere in the codebase. The only inline SVGs found (`src/components/landing/growth-visual.tsx`, `src/components/report/score-ring.tsx`, an abstract chart illustration in `src/app/page.tsx`) are unrelated decorative/functional graphics, not logo reconstructions. There is nothing to remove on that front.

No `favicon.ico`, no `opengraph-image` route, no `apple-icon.tsx` generator exist in the project.

## Decision: keep `Brand`'s live-text wordmark

The new `Lensiq-logo.webp` is a flattened raster lockup (icon + "lensiq" wordmark, with the final "q" drawn as the icon shape) with fixed dark-navy text. `Brand`'s current architecture (separate icon image + live text, with a gradient "q" that already closely matches the official logo's blue→purple direction) is being kept as-is:

- It supports the `inverted` prop (light-on-dark vs normal), which a flattened raster image cannot.
- Live text stays crisp at any size and remains accessible/selectable, unlike text baked into a raster image.

`Lensiq-logo.webp`'s content is still updated to the official file — it simply remains unreferenced in code, available for future use (e.g., an OG/share image, a footer lockup) as its own follow-up task, not part of this one.

## Visual verification (done during brainstorming, not deferred to implementation)

Rendered the new favicon inside the exact wrapper markup `Brand` uses (`size-10` / `rounded-xl` / `overflow-hidden` / `bg-white` / `object-cover`), at real size (40px) and zoomed (160px), against both the light background and the actual dark hero gradient (`radial-gradient(...) , #06122f` from `globals.css`), via a temporary page served through the project's own dev server and inspected with Playwright.

Findings:
- `object-cover` and `object-contain` render **pixel-identical** — the favicon's aspect ratio (386:386, exactly square) matches the wrapper's aspect ratio (40:40 / 160:160, exactly square) exactly, so no cropping occurs under `object-cover` regardless.
- Against the dark hero background, the icon sits cleanly inside its white rounded badge — no clipped strokes at the rounded corners, no "stuck-on" appearance.

**Conclusion: no micro-fix needed.** `rounded-xl` / `bg-white` / `object-cover` in `brand.tsx` stay unchanged.

## Changes

**1. Asset file content swap (same filenames, no import path changes)**
- `public/lensiq-favicon.webp` ← `/Users/matteo/Downloads/lensiq-favicon.webp`
- `public/lensiq-logo.webp` ← `/Users/matteo/Downloads/Lensiq-logo.webp`
- `src/app/icon.png` ← regenerated from the new favicon (386×386 PNG)
- `public/apple-touch-icon.png` ← regenerated from the new favicon (180×180 PNG, Apple's standard size, unchanged from current)

**2. Code fixes for the dimension change (431×430 → 386×386)**
- `src/components/brand.tsx`: `width={431} height={430}` → `width={386} height={386}`
- `src/app/manifest.ts`: the `/lensiq-favicon.webp` icon entry's `sizes: "431x430"` → `sizes: "386x386"`
- `src/app/layout.tsx`: no changes needed (references files by path only, no hardcoded dimensions)

**3. No changes**
- `Brand`'s structure/styling (verified above, no micro-fix needed)
- `public/apple-touch-icon.png`'s target size (180×180 stays the standard, only its pixel content is regenerated)
- Any legal page, `full-landing-page.tsx`, or other consumer of `Brand` — they inherit the fix automatically since they all render through the shared component

## Out of scope

- OG/social share image wiring (no `openGraph.images` exists today; adding one is a distinct future task)
- Landing page publish state (home page stays coming-soon/`noindex`)
- Any layout/spacing redesign of `Brand`
- Legal pages / cookie banner (separate, next task after this one)

## Verification plan

1. `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"` — green.
2. Visual check in a real browser (Playwright against the dev server): favicon renders correctly in the browser tab, `Brand` renders correctly on the coming-soon page (both the icon badge and the live-text wordmark).
3. Confirm no leftover temp files, clean working tree.
