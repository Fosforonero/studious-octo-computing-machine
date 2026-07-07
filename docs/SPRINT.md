# MVP implementation sprint

## Sprint 1 — foundation

- [x] Import and rebrand the visual template.
- [x] Configure Next.js 16, TypeScript, Tailwind and local shadcn-style primitives.
- [x] Build the landing page and URL/goal form.
- [x] Add audit create/read endpoints and status UI.
- [x] Add PostgreSQL schema and atomic worker claim.
- [x] Add SSRF-aware URL validation.

## Sprint 2 — evidence pipeline

- [x] Desktop and mobile Playwright rendering.
- [x] Content, structure, CTA, form, landmark and trust extraction.
- [x] Safe CTA journey checks.
- [x] Annotated screenshots and object-storage upload.
- [x] Lighthouse categories and key metrics.

## Sprint 3 — intelligence and report

- [x] Eight specialist prompt modules.
- [x] OpenAI/Anthropic provider boundary.
- [x] Structured validation and executive synthesis.
- [x] Full report, priority, copy, evidence and technical views.
- [x] Navigable demo report without external credentials.

## Before production

- [ ] Add Upstash or database-backed rate limits.
- [ ] Add retry count, heartbeat and stale-job recovery.
- [ ] Make screenshot storage private and issue signed URLs.
- [ ] Add structured logging and error monitoring.
- [ ] Add abuse budget, domain/audit quotas and retention cleanup.
- [ ] Test the complete worker against a representative URL corpus.
- [ ] Add billing only after free-to-paid report boundaries are validated.

## Product evolution — AI Website Engineer

### Phase 1 — Implementation-ready fixes

- [ ] Add an `Implementation` area to every report finding.
- [ ] Generate exact HTML, React/Next.js, Tailwind, metadata and JSON-LD examples where relevant.
- [ ] Generate copy-ready tasks for GitHub Issues, Linear and Jira.
- [ ] Generate focused prompts for coding agents without exposing private audit data unnecessarily.
- [ ] Label generated changes by confidence, expected impact, affected surface and verification method.

### Phase 2 — Repository-aware recommendations

- [ ] Add a read-only GitHub App connection with the smallest possible permission scope.
- [ ] Support Next.js repositories first; do not promise universal framework support.
- [ ] Map rendered evidence back to routes, components, styles and metadata files.
- [ ] Build a repository context index containing project conventions, scripts and test commands.
- [ ] Show the likely files affected before offering any generated patch.
- [ ] Keep URL-only audits fully usable without repository access.

### Phase 3 — Reviewable fix generation

- [ ] Generate a narrow patch for one selected finding at a time.
- [ ] Show the complete diff, rationale, assumptions and rollback path before writing externally.
- [ ] Create fixes only on a dedicated branch; never write directly to the default branch.
- [ ] Require explicit human approval before opening a pull request.
- [ ] Attach the original audit evidence and acceptance criteria to each pull request.
- [ ] Add audit logs for repository reads, generated changes and external actions.

### Phase 4 — Verified pull requests

- [ ] Run repository-defined typecheck, lint, tests and production build in an isolated sandbox.
- [ ] Deploy a preview environment for the generated branch.
- [ ] Re-run Playwright, Lighthouse and visual capture against the preview.
- [ ] Compare before/after metrics, screenshots and targeted finding evidence.
- [ ] Reject or flag patches that introduce regressions outside the selected finding.
- [ ] Publish a verification summary on the pull request.

The signature outcome is not merely generated code. It is a reviewable pull request with visual and technical evidence that the website improved.

### Phase 5 — Improvement loop

- [ ] Add baseline and re-scan comparison across releases.
- [ ] Track which recommendations were accepted, rejected or reverted.
- [ ] Learn site-specific conventions and previously approved decisions.
- [ ] Add scheduled regression checks for performance, accessibility, SEO and conversion paths.
- [ ] Notify teams only about material regressions, with evidence and an optional proposed fix.
- [ ] Introduce agency workflows: multiple sites, branded reports, approvals and client-safe sharing.

### Explicitly deferred

- Automatic merges or direct production deployments.
- Unreviewed form, checkout, authentication or payment changes.
- Universal WordPress/CMS/framework remediation.
- Competitor monitoring before the core improvement loop has demonstrated retention.
- Claims of conversion lift without customer analytics or controlled experimentation.
