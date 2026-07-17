# Brooks Builds Consulting — Production Rollout (living checklist)

> ## Status (updated 2026-07-17)
>
> **Beta is live**: `beta.brooksbuilds.com` runs on the Pulumi project at `infra/` (stacks
> `beta` + `prod`) and is verified end-to-end. `infra/template.yaml` is deleted — Pulumi is
> the sole source of truth. **`PLAN.md` holds the remaining runbook** (platform retirement +
> prod launch); this file holds Brooks' checklists and the post-cutover verification.
>
> When the rollout completes, the durable content here (deploy how-to, verification, notes
> below) folds into a lean `README.md` and this file is deleted (artifact policy).
>
> Coupling reminder: the Sentry ingest host `o1079394.ingest.us.sentry.io` lives in
> `site/assets/sentry-init.js` AND `sentry_ingest_host` in `infra/Pulumi.*.yaml` — change
> together.

Two environments: **beta** (`beta.brooksbuilds.com`, auto-deployed by every push to main,
serves `X-Robots-Tag: noindex`) and **production** (apex + www, deployed only by manually
running the **Release** workflow). Infra changes: `pulumi preview` on PRs, `up-beta` on merge,
`up-prod` manual. The remaining infra commands are in `PLAN.md` Part 2.

## Brooks' checklist (things only you can do — check them off as you go)

### Beta — ✅ complete (2026-07-17)

CAA clean; Sentry project + DSN committed; identity bootstrap done; PR previewed/merged;
`up-beta` applied; `BETA_*` variables set; content deployed; headers/redirects/404 verified;
template.yaml deleted.

### Release — when the content is ready

- [ ] **Fill the launch blockers** (grep `TODO(brooks)` to find them all): real scheduling URL (3 places in `site/index.html` + `BOOKING_URL` in `tests/links.spec.js`), real pricing, headshot, confirm social URLs.
- [ ] **Verify the content on beta** — it auto-deploys on push; click through everything once.
- [ ] **Retire the old platform app + launch prod: work through `PLAN.md` Part 2 — "Your next actions"** (atomic checkboxes; retirement PRs first, then the prod apply — DNS included, no manual records).
- [ ] **Set the prod GitHub Actions variables**: `PROD_AWS_DEPLOY_ROLE_ARN`, `PROD_S3_BUCKET`, `PROD_CF_DISTRIBUTION_ID` from `pulumi stack output` on the prod stack.
- [ ] **Run the Release workflow** (Actions tab → Release → Run workflow, on main).
- [ ] **Smoke-test the prod distribution**: `https://<prod-dist>.cloudfront.net` should 301 to `https://brooksbuilds.com`.
- [ ] **Run the post-cutover verification** (section below) — including that `learning.brooksbuilds.com` and MX/TXT records are untouched.
- [ ] **Uptime monitor** (UptimeRobot/Better Stack free tier): check `https://brooksbuilds.com` for HTTP 200 **plus** the string "Fractional Director"; second check on `https://www.brooksbuilds.com` expecting a 301.

### Post-launch, no rush

- [ ] Once every `*.brooksbuilds.com` subdomain is verified HTTPS-only, add `includeSubDomains` to HSTS (`strictTransportSecurity` in `infra/wrappers/static_site.ts`; merging the PR redeploys beta, prod via Run workflow).
- [ ] Optional: Google Search Console (verifies via one DNS TXT record) and submit `sitemap.xml`.
- [ ] Tell Claude the rollout is done → PLAN.md + PRODUCTION.md fold into a lean README and are deleted (artifact policy).

### Account baseline (from the AWS best-practices review — console tasks, no deadline)

Root MFA and a budget alert are already in place. Remaining:

- [ ] **Enable CloudTrail** (all regions → a protected S3 bucket) — the one unconfirmed AWS Startup Security Baseline item.
- [ ] **Audit the IAM user behind the brooks_builds repo's CI access keys** (its permission scope is unknown); then migrate that repo's workflows to OIDC like this repo and delete the long-lived keys.
- [ ] Optional follow-ups: LMS distribution OAI → OAC; GuardDuty (a few $/month at this scale).

## Verification (end-to-end, after cutover)

- `curl -sI https://brooksbuilds.com` → 200 + all security headers (cross-check securityheaders.com)
- `curl -sI https://www.brooksbuilds.com` and the cloudfront.net domain → 301 to apex; `/index.html` → 301 `/`
- `curl -s https://brooksbuilds.com/nonexistent -o /dev/null -w '%{http_code}'` → 404, styled page (extensionless paths 301 to their `/`-form first — expected)
- Browser DevTools: zero CSP violations; `Sentry.captureMessage('test')` from the console arrives in Sentry
- `learning.brooksbuilds.com` still resolves and serves unchanged
- CI: a trivial PR runs lint; merge to main deploys and the change is live after invalidation

## Notes to carry into the README at fold time

- **404.html must keep absolute asset paths** (`/css/styles.css`) — it renders at arbitrary URLs.
- **OG image must stay raster** (~1200×630 PNG, absolute URL) — SVG doesn't render in Slack/LinkedIn previews; source assets in `logos/`.

## History (condensed; details in git log)

- Site build phase complete; production pipeline (site/ deploy root, SEO/Sentry/lint files,
  CloudFormation template, CI/CD workflows) built and review-looped to zero blocking (1b033eb).
- Beta/prod environment split added (reusable deploy workflow + Deploy Beta + Release).
- CloudFormation → Pulumi port (2026-07-16/17): `infra/` project, review loop round 1 found
  2 blocking (CI-role prod OIDC lookup permission; bootstrap over-targeting) → fixed →
  re-review PASS. Beta provisioned via PR-preview → merge-up flow; verified live; template
  deleted. Platform-retirement branches prepared in the brooks_builds repo.
