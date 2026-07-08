# Product principles

## Positioning

Lensiq is the expert second opinion for a website team. It observes the page as a visitor, measures the implementation, and turns both into an evidence-backed action plan.

It is not positioned as a crawler full of warnings or as a generic SEO score. The primary promise is better clarity, trust and conversion.

## Product experience

1. Ask for the URL and the page's intended outcome.
2. Show real progress events while the browser works.
3. Give a useful executive snapshot before asking the user to do more.
4. Attach evidence to every material claim.
5. Rank recommendations by impact and effort.
6. Provide exact copy and placement suggestions where possible.
7. Encourage a re-scan after changes so improvement is measurable.

## Commercial path

No free tier. Every audit is a one-time purchase, no subscription, no account required:

- Founding audit price: $9.99 for the first 100 audits, framed as a private-beta offer ("Help shape Lensiq before public launch"), not a discount. Same complete report as the standard audit. Guarantee: refund if the report doesn't include at least 3 actionable fixes. Manually tracked for now — see the "founder offer cap" follow-up task for a real DB-backed counter.
- Single audit (standard price, once the first 100 founding audits are used up): $29. Complete specialist report, annotated evidence, copy rewrites and implementation plan.
- Three-audit pack: $79 (vs $87 at single-audit price). Useful for homepage/pricing/signup or before/change/after cycles.
- Later team plan: saved sites, scheduled checks, comparisons, tasks and shareable client reports. Requires real accounts (Supabase Auth); deliberately deferred until the single-audit path is validated.

The durable advantage is not a bigger checklist. It is the history of what changed, why it changed and whether the next scan improved.

The durable advantage is not a bigger checklist. It is the history of what changed, why it changed and whether the next scan improved.

## Long-term direction: AI Website Engineer

Lensiq should evolve from diagnosis into a verified improvement loop:

```text
Observe → Diagnose → Propose → Patch → Preview → Verify → Human approval
```

The product should begin with implementation-ready fixes, then add read-only repository context and narrowly scoped pull requests for Next.js projects. Generated code alone is not the differentiator. The differentiator is connecting runtime evidence to the responsible code and proving on a preview deployment that the proposed change improved the targeted outcome without introducing regressions.

Repository writes must remain reviewable, reversible and explicitly authorized. Lensiq must never write directly to a default branch, merge code or deploy to production autonomously in the early product phases.

## Tone

Professional, direct and calm. Findings can be candid without becoming theatrical. Avoid gimmicks, false urgency, unsupported revenue claims, vanity metrics and advice that could apply to any website.

## Evidence standard

Every issue should answer four questions:

1. What did the system observe?
2. Why does it matter for the stated page goal?
3. What exactly should change?
4. How much impact and effort should the team expect?
