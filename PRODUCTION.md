# Brooks Builds Consulting — Production Deployment (Execution Playbook, Phase 2)

Phase 1 (building the site) is complete. This plan takes the site to production. Like Phase 1, done is not the exit condition — passing review is.

**Artifact policy (Brooks' rule): the repo keeps only code and actively-used files — no historical plan documents.** Concretely:
- **Step 0 of execution**: write this document to `PRODUCTION.md` (the working checklist while this phase is live) and **delete `PLAN.md`** — the build phase is done; its useful content (brand tokens, review conventions) is already captured here and in memory.
- **When this phase completes**: fold the durable operational content (deploy how-to, Sentry update procedure, cache/CSP notes, runbook) into a lean `README.md` and **delete `PRODUCTION.md`**. End state: no plan files in the repo at all.
- Flag for Brooks: `design_inspiration/` (reference screenshots, including Dustin's site) is no longer actively used — approving this plan approves removing it. `logos/` stays (source brand assets used to generate og-image/favicons).

**Workflow convention (Brooks' rule, encode it): create a repo-level `CLAUDE.md`** containing the project conventions, including: (1) when Brooks asks for a plan, present it and iterate through discussion — do NOT start implementing on plan approval alone; wait for an explicit "build it"-style go-ahead; (2) the no-stale-artifacts rule above; (3) site facts an agent needs (deploy root is `site/`, no-JS/no-external-requests baseline + vendored-Sentry exception, CSP/ingest-host duplication, brand tokens, review-loop convention). Also save the discuss-before-build preference as a feedback memory so it applies beyond this repo.

## Context

The site (plain HTML+CSS, zero JS, zero external requests) is finished and reviewed but lives only in the repo — nothing is deployed and nothing is committed/pushed yet. Brooks wants a production setup with error monitoring (Sentry), linting, CI/CD, and the things a solo operator forgets: SEO/social meta, security & caching headers, uptime monitoring, 404 page.

Decisions confirmed with Brooks (do not re-ask):
- **Host: S3 + CloudFront** — DNS for brooksbuilds.com is in Route53, and Route53 can't point an apex at Cloudflare Pages (ALIAS is AWS-only, CF requires its own DNS for apex). Staying all-AWS avoids a nameserver migration.
- **Domain: brooksbuilds.com (apex, canonical) + www (301 → apex)**. Brooks does all DNS record changes himself. `learning.brooksbuilds.com` (his LMS) is on the same zone and **must not be disturbed**.
- **Sentry: vendored SDK** — pinned copy of `@sentry/browser`'s CDN bundle committed to the repo; only external call is event ingest. No loader snippet, no Sentry CDN at runtime.
- **In scope**: SEO/social pack, security + caching headers, uptime monitoring (manual signup). **Out of scope**: analytics.
- **IaC: one CloudFormation template**, deployed once via `aws cloudformation deploy` from us-east-1 (CloudFront needs the ACM cert there; every other resource works from us-east-1 too — one stack, one region). No Terraform/state backend for a set-once stack.

## Architecture

Private S3 bucket (versioned, public access blocked) → CloudFront with **Origin Access Control**, both aliases on one distribution. A **CloudFront Function** (viewer-request, `cloudfront-js-2.0`, `AutoPublish: true`) does three jobs: 301 any host that isn't `brooksbuilds.com` (catches www AND `*.cloudfront.net`), 301 `/index.html` → `/`, and rewrite `/foo/`-style URLs to `/foo/index.html`. Security headers via a `ResponseHeadersPolicy`. GitHub Actions deploys over **OIDC** (no stored AWS keys).

Key gotchas already pressure-tested (bake these in, don't rediscover them):
- **Deploy root must be `site/`**: the repo root holds `PLAN.md`, `design_inspiration/` (screenshots of Dustin's site), and `logos/` (raw brand files incl. .ai). A root-level `s3 sync` would publish all of it. Move `index.html`, `css/`, `assets/` into `site/` and sync only that.
- **HSTS without `includeSubDomains`** at launch — `includeSubDomains` served from the apex would force HTTPS on `learning.brooksbuilds.com` and everything else on the zone. Flip it later only after verifying every subdomain is HTTPS-only.
- **ACM cert**: both `brooksbuilds.com` + `www` as SANs; `DomainValidationOptions` with `HostedZoneId` parameter so CFN auto-creates the (additive, harmless) validation CNAMEs and the stack doesn't hang. Brooks still creates the real ALIAS records manually.
- **Real 404s under OAC**: grant the CloudFront principal `s3:ListBucket` (not just `GetObject`) so S3 returns 404 instead of 403 for missing keys; then one CustomErrorResponse 404 → `/404.html` (code 404, ErrorCachingMinTTL 60). Bucket policy must be a **separate resource** from the bucket (distribution ARN condition — looks circular, isn't).
- **OIDC**: `AWS::IAM::OIDCProvider` needs a non-empty `ThumbprintList` (`6938fd4d98bab03faadb97b34396831e3780aea1`) even though AWS ignores it; only one provider per URL per account (check none exists). Role trust: `aud=sts.amazonaws.com` AND `sub=repo:BrooksPatton/brooks_builds_consulting:ref:refs/heads/main` (exact, case-sensitive; breaks if the workflow adds `environment:`). Workflow MUST set `permissions: {id-token: write, contents: read}`.
- **CSP + vendored Sentry**: init goes in a local file `site/assets/sentry-init.js` (never inline — avoids `'unsafe-inline'`), loaded with `defer` after `sentry.min.js`. CSP: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src https://<DSN ingest host>; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests`. The ingest host lives in BOTH sentry-init.js and the template — note the duplication in comments. Sentry init: `sampleRate: 1.0`, `allowUrls: [/brooksbuilds\.com/]` to keep extension noise off the free tier.
- **Cache without hashed filenames**: HTML/xml/txt → `public, max-age=0, must-revalidate`; css/assets → `public, max-age=86400`. Two-pass `aws s3 sync` (`--delete` on the assets pass only). `/*` invalidation counts as ONE path — free at this scale. README note: bump `?v=N` on the stylesheet link if a same-day CSS fix ever matters.
- **404.html must use absolute asset paths** (`/css/styles.css`) — it renders at arbitrary URLs.
- **OG image must be raster** (~1200×630 PNG, absolute URL) — SVG doesn't render in Slack/LinkedIn previews. Export/compose from `logos/` assets (ImageMagick or manual).
- Distribution: `Compress: true`, `redirect-to-https`, `http2and3`, IPv6 on (→ **4 ALIAS records**: A+AAAA × apex+www), PriceClass_100, managed CachingOptimized policy, DefaultRootObject `index.html`.

## Deliverables

```
PRODUCTION.md                       — this playbook + living checklist (Step 0; deleted at phase end,
                                      durable content folds into README.md; PLAN.md deleted at Step 0)
CLAUDE.md                           — project conventions: discuss-before-build, artifact policy,
                                      site facts for future agents
site/                               — index.html, css/, assets/ moved here (git mv)
site/404.html                       — new, absolute asset paths, on-brand
site/robots.txt                     — allows all; Sitemap: https://brooksbuilds.com/sitemap.xml
site/sitemap.xml                    — single URL, apex host only
site/favicon.ico                    — generated from the icon PNG (old crawlers request it blindly)
site/assets/apple-touch-icon.png    — 180×180
site/assets/og-image.png            — 1200×630 raster from brand assets
site/assets/sentry.min.js           — vendored pinned @sentry/browser CDN bundle
site/assets/sentry-init.js          — init w/ DSN placeholder, allowUrls filter
infra/template.yaml                 — CloudFormation: bucket, bucket policy, ACM cert, OAC,
                                      CF function, response-headers policy, distribution,
                                      OIDC provider, deploy role, outputs
.github/workflows/ci.yml            — PRs: npm ci; html-validate, stylelint, prettier check;
                                      vendored-Sentry version-drift check
.github/workflows/deploy.yml        — main: lint gate → OIDC assume role → two-pass s3 sync
                                      → cloudfront invalidation
package.json + package-lock.json    — devDeps: html-validate, stylelint(+config-standard),
                                      prettier, @sentry/browser (vendoring source / Dependabot
                                      update reminder); scripts: lint, vendor:sentry
.stylelintrc.json, .prettierrc      — configs matching existing code style
.github/dependabot.yml              — npm + github-actions ecosystems
index.html edits                    — canonical link, OG/Twitter meta (absolute URLs),
                                      favicon/apple-touch links, two deferred Sentry scripts
```

Site stays build-free: nothing in `node_modules` ships; `site/` is the whole deployment.

# How to execute

### Step 0 — Bootstrap
Write this document to `PRODUCTION.md`; delete `PLAN.md`; remove `design_inspiration/` (sanctioned by this plan's approval); create the repo `CLAUDE.md` with the conventions above; save the discuss-before-build feedback memory.

### Step 1 — Repo restructure + new site files (no AWS)
`git mv` the site into `site/`; author all new site files and index.html edits; set up package.json, lint configs, vendoring script; run `npm run vendor:sentry`. Lint must pass locally. Restart the local server with `--directory site` so Brooks' published port keeps working.

### Step 2 — Infra + CI files
Author `infra/template.yaml` and both workflows exactly per the gotchas above. Validate what's validatable offline: `aws cloudformation validate-template` needs credentials — if unavailable, use `npx yaml-lint`/careful review and flag it for the review lenses.

### Step 3 — Independent agent review (loop until zero blocking)
Fresh-context agents, in parallel; fix → re-run affected lens until a clean round (max ~4 rounds, then surface the stalemate):
1. **Infra correctness** — template.yaml + this playbook's gotcha list: OAC policy separation + ListBucket, cert SANs/validation, function logic (host/index/clean-URL cases), header policy vs CSP requirements, OIDC trust exactness, IAM minimality, distribution settings, HSTS scoped without includeSubDomains.
2. **CI/CD correctness** — both workflows: OIDC permissions block, two-pass sync flag order (`--delete` placement!), correct vars, lint gating deploy, dependabot config, drift check between package.json Sentry pin and vendored file.
3. **Site files** — 404 absolute paths, meta/canonical/OG correctness (absolute apex URLs everywhere), robots/sitemap host consistency, Sentry init quality, no regression to Phase-1 brand/copy rules, html-validate/stylelint/prettier clean.

### Step 4 — Commit, push, first CI run
Initial commit (or commits) and push to GitHub — Brooks already sanctioned pushing this repo's work in the session; CI (not deploy) should go green on the push. Deploy will fail until Brooks does his manual steps — expected; say so.

### Step 5 — Report + hand Brooks the manual runbook
Final message: what was built, what CI does, and the ordered manual runbook below. Update PRODUCTION.md checklist.

## Brooks' manual runbook (things only he can do)

1. **Pre-flight**: `dig CAA brooksbuilds.com` (if CAA exists, it must permit `amazon.com` or ACM fails silently); confirm apex/www A/AAAA/CNAME slots in Route53 are free.
2. **Sentry**: create a Browser-JS project; put the DSN in `site/assets/sentry-init.js` AND the ingest host in the CSP in `infra/template.yaml` (must match).
3. **Launch blockers in the page**: real scheduling URL (3 spots), real pricing, headshot, social URLs — grep `TODO(brooks)`.
4. **Deploy the stack** (once): `aws cloudformation deploy --region us-east-1 --template-file infra/template.yaml --stack-name brooksbuilds-site --capabilities CAPABILITY_NAMED_IAM --parameter-overrides DomainName=brooksbuilds.com HostedZoneId=<zone> GitHubRepo=BrooksPatton/brooks_builds_consulting`. Validation CNAMEs are auto-created; no babysitting.
5. **GitHub**: add Actions **variables** (not secrets — none are secret): `AWS_DEPLOY_ROLE_ARN`, `CF_DISTRIBUTION_ID`, `S3_BUCKET` from stack outputs; enable Dependabot alerts; optional branch protection requiring CI.
6. **First deploy**: re-run the deploy workflow; smoke-test `https://<dist>.cloudfront.net` — expect 301 to apex (proves the function).
7. **DNS cutover**: 4 ALIAS records (A+AAAA × apex+www) → distribution domain. Don't touch `learning.*` or MX/TXT.
8. **Uptime monitor** (UptimeRobot/Better Stack free tier): check apex for HTTP 200 **+ a content string** ("Fractional Director"), second check on www expecting 301.
9. **Later**: verify every `*.brooksbuilds.com` subdomain is HTTPS-only → one-line stack update adds `includeSubDomains` (+preload); optional Google Search Console (one DNS TXT) + submit sitemap.

## Verification (end-to-end, after cutover)

- `curl -sI https://brooksbuilds.com` → 200 + all security headers (cross-check securityheaders.com)
- `curl -sI https://www.brooksbuilds.com` and the cloudfront.net domain → 301 to apex; `/index.html` → 301 `/`
- `curl -s https://brooksbuilds.com/nonexistent -o /dev/null -w '%{http_code}'` → 404, styled page
- Browser DevTools: zero CSP violations; `Sentry.captureMessage('test')` from the console arrives in Sentry
- `learning.brooksbuilds.com` still resolves and serves unchanged
- CI: a trivial PR runs lint; merge to main deploys and the change is live after invalidation

## Status checklist

- [x] Step 0: PRODUCTION.md bootstrapped; PLAN.md + design_inspiration/ removed; CLAUDE.md conventions written; feedback memory saved
- [x] Step 1: site/ restructure + SEO/Sentry/lint files complete, lint clean. Notes: Sentry vendored by esbuild-bundling the locked npm package (their CDN is firewalled; also more reproducible) — tree-shaken to init/captureException/captureMessage, 85KB/29KB gz, version banner + CI drift check. Prettier normalized all site files; html-validate configured to accept prettier's void-tag style; stylelint `no-descending-specificity` off (flags non-overlapping selectors).
- [x] Step 2: infra template + workflows authored; cfn-lint clean, workflow YAML parses. `SentryIngestHost` is a template parameter (CSP), `CreateOIDCProvider` toggleable for the one-per-account limit.
- [x] Step 3: review rounds
  - Round 1: **site files PASS** (4 polish applied: absolute asset paths in index.html, favicon.ico linked instead of the 1000px PNG, guarded Sentry.init, sentry-init.js moved to the no-cache sync pass). **Infra PASS** (3 polish applied: redirects preserve query strings, trailing-slash canonicalization with single-hop redirects, SentryIngestHost added to the documented deploy command; new function code verified by executing all 15 host/URI/query cases in node). **CI/CD PASS on workflow logic** (reviewer verified against aws-cli source that the two-pass `--delete` has no mid-deploy outage; fixes applied: `--delete` added to the html pass so removed pages actually disappear, corrected the comment's semantics, ci.yml got `permissions: contents: read` + concurrency). Its one blocking finding was repo state — everything untracked — which is Step 4 itself; the commit below includes every pipeline file it enumerated.
  - Round 2 (targeted): rewritten CloudFront function re-verified by direct execution (15/15 cases correct); cfn-lint clean; full lint suite green. Loop converged: zero unresolved blocking findings.
- [~] Step 4: all pipeline files committed locally (1b033eb + CLAUDE.md convention commits). Pushes are Brooks' job by convention (see CLAUDE.md) — push ready, awaiting his `git push`. CI should go green on the push; the deploy workflow fails until runbook steps 4–5 are done (expected).
- [ ] Step 5: report + runbook delivered; awaiting Brooks' manual steps
- [ ] Post-cutover verification complete (requires Brooks' steps 1–8)
