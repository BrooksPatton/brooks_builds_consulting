# Brooks Builds Consulting — Project Conventions

Marketing site for Brooks' fractional Director of Engineering consulting business.
Two environments on S3 + CloudFront: **beta** (beta.brooksbuilds.com, auto-deployed on every
push to main, noindex) and **production** (brooksbuilds.com apex canonical + www redirect,
deployed only via the manual `Release` workflow in the Actions tab).

**Infra is the Pulumi project at `infra/`** — TypeScript, stacks `beta` + `prod`, same Pulumi
Cloud org as Brooks' `brooks_builds` repo (his LMS/platform infra; often mounted in the sandbox).
CI model: `pulumi preview` on PRs touching `infra/**` (both stacks), `pulumi up` on beta at merge,
prod only via manual workflow_dispatch (`infra.yml`). **Style rule**: raw Pulumi calls live only
in `infra/wrappers/*` (intent-level wrappers — one function per concept, not per AWS resource);
`infra/index.ts` reads as intent. **The sandbox never gets AWS/Pulumi credentials or any deploy
path** — Brooks runs all cloud commands himself. While the rollout phase is in flight, `PLAN.md`
is the working plan/runbook; read it before touching infrastructure. (`infra/template.yaml` is
the retired CloudFormation spec, kept only until the first verified beta `pulumi up`.)

## How to work with Brooks

- **Plans are for discussion, not tripwires.** When Brooks asks for a plan, present it and iterate
  through back-and-forth. Do NOT start implementing just because a plan exists or was acknowledged —
  wait for an explicit go-ahead ("build it", "go", plan-mode approval).
- **No stale artifacts.** The repo keeps only code and actively-used files. Plan/checklist documents
  live only while their phase is in flight, then their durable content folds into README.md and the
  plan file is deleted. Don't create historical logs, archives, or "for context" documents.
- **Review loop convention.** Nontrivial changes get reviewed by fresh-context agents (brand, copy,
  code/infra lenses as relevant), findings fixed and re-reviewed until a round has zero blocking
  findings. Done is not the exit condition — passing review is.
- **Announce commits at the end of the message.** Brooks' terminal may not scroll up; if a turn
  made a git commit, the last lines of the reply must say so explicitly (hash + one-line summary).
- **Never push from the sandbox — Brooks pushes.** No push credentials are set up in the sandbox
  and that's intentional. Commit locally, then end the message with a "push ready" callout listing
  the unpushed commits; Brooks runs `git push` from his own terminal. Don't modify his git
  remotes/config.

## Site facts

- **Deploy root is `site/`** — only that directory syncs to S3. Repo root holds infra, configs, and
  `logos/` (source brand assets; never deploy or delete them).
- **Baseline: no JS, no external requests**, with exactly one sanctioned exception: the vendored
  Sentry SDK (`site/assets/sentry.min.js`, pinned via package.json + `npm run vendor:sentry`) whose
  only network call is event ingest. Never add CDN scripts/fonts/styles; the CSP will block them.
- **CSP coupling**: the Sentry ingest host appears in `site/assets/sentry-init.js` AND in
  `sentry_ingest_host` in `infra/Pulumi.beta.yaml` + `infra/Pulumi.prod.yaml` (consumed by the CSP
  in `infra/wrappers/static_site.ts`) — change them together.
- **No build step.** HTML/CSS ship as-authored. Cache: HTML/xml/txt no-cache, css/assets 1 day; if a
  same-day CSS fix must propagate, bump the `?v=N` query on the stylesheet link.
- **Brand tokens**: teal #006480, secondary #a3bbc1, light #ebebeb; page bg #f3f3f3, borders #d2d2d2,
  text #343a40/#495057, link #1565c0; monospace everywhere; official logo SVGs from `logos/` only.
- **Copy rule**: structure may parallel UpShift HQ (Dustin's fractional-CTO site, business partner);
  wording must never echo it — phrase-level originality is a hard requirement.
- **HSTS**: served WITHOUT `includeSubDomains` on purpose (learning.brooksbuilds.com shares the
  zone). Only add it after verifying every subdomain is HTTPS-only.
- **Beta/prod separation is by convention, not IAM**: both deploy roles trust the same OIDC claim
  (`refs/heads/main`), so any main-branch workflow could technically assume the prod role.
  Acceptable for a solo repo; the hard-enforcement upgrade is a GitHub `environment:` on the
  release job + matching `:environment:` sub claim in the prod role's trust policy. Until then,
  **never add `environment:` to any workflow job** — it changes the OIDC sub claim's shape and
  breaks role trust (the pulumi CI role additionally trusts the `pull_request` claim for previews).

## Commands

- Serve locally: `python3 -m http.server 8080 --bind 0.0.0.0 --directory site`
- Lint: `npm run lint` (html-validate + stylelint + prettier check)
- Test: `npm test` (Playwright link-contract tests; starts its own server on :4173).
  Try it directly first — the browser may already be installed. If it's missing:
  `npx playwright install chromium` (and if THAT is firewall-blocked, Brooks runs
  `sbx policy allow network cdn.playwright.dev,playwright.download.prss.microsoft.com`
  on the host once — though these allows persist across sandboxes and were already granted).
- Re-vendor Sentry after a version bump: `npm run vendor:sentry`
- Infra (in `infra/`): `npm run typecheck` (tsc), `npm test` (executes the CloudFront
  viewer-request function against its behavior matrix — run after any edit to it). No
  `pulumi preview`/`up` from the sandbox — those are CI's and Brooks' jobs.
