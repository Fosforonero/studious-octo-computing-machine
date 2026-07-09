# Official Brand Assets Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder favicon/logo with the two official asset files, fix every place their old dimensions are hardcoded, and verify nothing else needs touching.

**Architecture:** Pure asset swap + two numeric edits. Same filenames throughout, so no import paths change. Two derived PNGs (`icon.png`, `apple-touch-icon.png`) are regenerated from the new favicon via `sips`. No new components, no new routes, no dependency changes.

**Tech Stack:** Next.js 16 App Router, TypeScript, `sips` (macOS image tool, host-level — this is a one-off asset-generation step, not a language build/test/lint/run, so it's exempt from the project's Docker-only runtime policy), Docker Compose for the app itself, Playwright for the live visual check.

## Global Constraints

- Only these two files are the source of truth for new asset content: `/Users/matteo/Downloads/Lensiq-logo.webp` (1470×386) and `/Users/matteo/Downloads/lensiq-favicon.webp` (386×386). Do not modify them.
- No redesign of `Brand`'s layout/spacing/styling — confirmed unnecessary during brainstorming (visual check already done, `object-cover`/`rounded-xl`/`bg-white` stay as-is).
- No OG image, no landing publish, no legal pages — out of scope, per the approved spec at `docs/superpowers/specs/2026-07-09-brand-assets-design.md`.
- All app verification (typecheck/lint/build, dev server) goes through `docker-compose`, per this project's Docker-only policy. Only the `sips` image-conversion commands run on the host, since they're not a language runtime.
- Working tree must be clean and typecheck/lint/build green before the plan is considered done.

---

### Task 1: Replace the two official asset files

**Files:**
- Modify: `public/lensiq-favicon.webp` (binary content replacement)
- Modify: `public/lensiq-logo.webp` (binary content replacement)

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: `public/lensiq-favicon.webp` at 386×386 (was 431×430) and `public/lensiq-logo.webp` at 1470×386 (was 815×655) — Task 2 depends on the new favicon's exact dimensions (386×386) to regenerate the derived PNGs correctly.

- [ ] **Step 1: Copy the two official files over the placeholders**

```bash
cd "/Volumes/LOS ANGELES/Matteo/Dev Roba Mia/SEO Analisi"
cp "/Users/matteo/Downloads/lensiq-favicon.webp" public/lensiq-favicon.webp
cp "/Users/matteo/Downloads/Lensiq-logo.webp" public/lensiq-logo.webp
```

- [ ] **Step 2: Verify the new dimensions landed correctly**

```bash
sips -g pixelWidth -g pixelHeight public/lensiq-favicon.webp
sips -g pixelWidth -g pixelHeight public/lensiq-logo.webp
```

Expected:
```
public/lensiq-favicon.webp
  pixelWidth: 386
  pixelHeight: 386
public/lensiq-logo.webp
  pixelWidth: 1470
  pixelHeight: 386
```

- [ ] **Step 3: Commit**

```bash
git add public/lensiq-favicon.webp public/lensiq-logo.webp
git commit -m "Replace placeholder favicon and logo with official brand assets"
```

---

### Task 2: Regenerate the derived PNG icons from the new favicon

**Files:**
- Modify: `src/app/icon.png` (regenerated, binary)
- Modify: `public/apple-touch-icon.png` (regenerated, binary)

**Interfaces:**
- Consumes: `public/lensiq-favicon.webp` at 386×386 (from Task 1).
- Produces: `src/app/icon.png` at 386×386 PNG, `public/apple-touch-icon.png` at 180×180 PNG. Task 5's live browser check depends on both existing and being valid PNGs.

- [ ] **Step 1: Regenerate `src/app/icon.png` (386×386 PNG) from the new favicon**

```bash
cd "/Volumes/LOS ANGELES/Matteo/Dev Roba Mia/SEO Analisi"
sips -s format png -z 386 386 public/lensiq-favicon.webp --out src/app/icon.png
```

- [ ] **Step 2: Regenerate `public/apple-touch-icon.png` (180×180 PNG) from the new favicon**

```bash
sips -s format png -z 180 180 public/lensiq-favicon.webp --out public/apple-touch-icon.png
```

- [ ] **Step 3: Verify both outputs are real PNGs at the expected dimensions**

```bash
file src/app/icon.png public/apple-touch-icon.png
sips -g pixelWidth -g pixelHeight src/app/icon.png
sips -g pixelWidth -g pixelHeight public/apple-touch-icon.png
```

Expected:
```
src/app/icon.png:            PNG image data, 386 x 386, ...
public/apple-touch-icon.png: PNG image data, 180 x 180, ...
src/app/icon.png
  pixelWidth: 386
  pixelHeight: 386
public/apple-touch-icon.png
  pixelWidth: 180
  pixelHeight: 180
```

- [ ] **Step 4: Commit**

```bash
git add src/app/icon.png public/apple-touch-icon.png
git commit -m "Regenerate icon.png and apple-touch-icon.png from the official favicon"
```

---

### Task 3: Fix `Brand`'s hardcoded image dimensions

**Files:**
- Modify: `src/components/brand.tsx:8`

**Interfaces:**
- Consumes: nothing new (this is a pure dimension-literal fix; the image path itself, `/lensiq-favicon.webp`, is unchanged).
- Produces: no new interface — `Brand` continues to export the same `{ inverted }` prop signature.

- [ ] **Step 1: Update the hardcoded width/height**

Current (`src/components/brand.tsx:8`):
```tsx
        <Image src="/lensiq-favicon.webp" alt="" width={431} height={430} priority className="h-full w-full object-cover" />
```

New:
```tsx
        <Image src="/lensiq-favicon.webp" alt="" width={386} height={386} priority className="h-full w-full object-cover" />
```

- [ ] **Step 2: Confirm the change**

```bash
grep -n "width={386} height={386}" src/components/brand.tsx
```

Expected: one match, on the `<Image>` line.

- [ ] **Step 3: Commit**

```bash
git add src/components/brand.tsx
git commit -m "Update Brand's favicon dimensions to match the official 386x386 asset"
```

---

### Task 4: Fix the manifest's hardcoded icon size

**Files:**
- Modify: `src/app/manifest.ts:16`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new interface — `manifest()` continues to return the same `MetadataRoute.Manifest` shape.

- [ ] **Step 1: Update the hardcoded `sizes` field**

Current (`src/app/manifest.ts`):
```ts
      {
        src: "/lensiq-favicon.webp",
        sizes: "431x430",
        type: "image/webp",
      },
```

New:
```ts
      {
        src: "/lensiq-favicon.webp",
        sizes: "386x386",
        type: "image/webp",
      },
```

- [ ] **Step 2: Confirm the change**

```bash
grep -n "386x386" src/app/manifest.ts
```

Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add src/app/manifest.ts
git commit -m "Update manifest icon sizes to match the official 386x386 favicon"
```

---

### Task 5: Full verification — typecheck/lint/build + live browser check, then cleanup

**Files:**
- None modified (verification-only task). May temporarily create `docker-compose.override.yml` and remove it before finishing.

**Interfaces:**
- Consumes: every artifact from Tasks 1–4 (`public/lensiq-favicon.webp`, `public/lensiq-logo.webp`, `src/app/icon.png`, `public/apple-touch-icon.png`, `src/components/brand.tsx`, `src/app/manifest.ts`).
- Produces: nothing new — this task is the final gate before the branch is done.

- [ ] **Step 1: Run typecheck, lint, and build**

```bash
cd "/Volumes/LOS ANGELES/Matteo/Dev Roba Mia/SEO Analisi"
docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"
```

Expected: all three succeed, ending with the Next.js route table printed and no errors.

- [ ] **Step 2: Start the dev server on a free port for the live check**

Port 3000 is occupied by an unrelated container on this machine. Create a temporary override:

```bash
cat > docker-compose.override.yml <<'EOF'
services:
  web:
    ports: !override
      - "3100:3000"
EOF
docker-compose up -d web
```

Poll until ready:
```bash
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/)
  if [ "$code" = "200" ]; then echo "ready ($code)"; break; fi
  echo "waiting... ($code)"
  sleep 2
done
```

- [ ] **Step 3: Verify every asset URL serves correctly**

```bash
for path in /lensiq-favicon.webp /lensiq-logo.webp /icon.png /apple-touch-icon.png /manifest.webmanifest; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3100$path")
  ctype=$(curl -s -o /dev/null -w "%{content_type}" "http://localhost:3100$path")
  echo "$path -> $code ($ctype)"
done
```

Expected: all five return `200`, with content types `image/webp` (the two `.webp` paths), `image/png` (`/icon.png`, `/apple-touch-icon.png`), and `application/manifest+json` (`/manifest.webmanifest`).

- [ ] **Step 4: Confirm the manifest's icon sizes are correct at the served URL**

```bash
curl -s http://localhost:3100/manifest.webmanifest | grep -o '"sizes":"[^"]*"'
```

Expected: `"sizes":"386x386"` and `"sizes":"180x180"` (in some order), no `431x430`.

- [ ] **Step 5: Visual check — navigate to the coming-soon home page and confirm `Brand` renders correctly**

Use the Playwright MCP tools:
1. `browser_navigate` to `http://localhost:3100/`
2. `browser_snapshot` to confirm the page loaded and the `Brand` link (icon + "lensiq" text with the gradient "q") is present
3. `browser_take_screenshot` to visually confirm: the icon badge shows the new magnifying-glass mark cleanly inside its white rounded box, with no cropping/cut-off/distortion, and the "lensiq" text renders normally next to it

- [ ] **Step 6: Confirm the `<head>` icon links resolve to the right paths**

```js
// via browser_evaluate, function: () => Array.from(document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')).map(l => ({ rel: l.rel, href: l.href }))
```

Expected: entries for `/lensiq-favicon.webp`, `/icon.png`, `/apple-touch-icon.png` (as `apple-touch-icon`), and `/manifest.webmanifest`, no stale references.

- [ ] **Step 7: Tear down and clean up**

```bash
docker-compose down
rm -f docker-compose.override.yml
rm -rf .playwright-mcp
git status --short
```

Expected: `git status --short` shows only the benign, pre-existing `next-env.d.ts` churn (if any) — discard it:

```bash
git checkout -- next-env.d.ts 2>/dev/null; git status --short
```

Expected: no output (fully clean working tree).

- [ ] **Step 8: Confirm the branch is ready**

```bash
git log --oneline main..HEAD
git status --short
```

Expected: 4 commits ahead of `main` (Tasks 1–4; the design-spec commit from brainstorming is already on the branch too, so 5 total ahead of `main`), clean working tree. Report this as ready for the finishing-a-development-branch step.
