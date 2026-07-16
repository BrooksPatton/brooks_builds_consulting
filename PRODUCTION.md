# Brooks Builds Consulting — Production Deployment (Execution Playbook, Phase 2)

> ## ⚠ HANDOFF — READ THIS FIRST (written 2026-07-16 for a fresh session)
>
> **Decision made with Brooks:** the site's infrastructure will be **ported from
> `infra/template.yaml` (CloudFormation) to Pulumi**, building on Brooks' EXISTING Pulumi
> setup (private repo, deploys his LMS + its lambdas; it was not visible to the previous
> session). Brooks recreated the sandbox specifically to add that repo. Do not create a
> second IaC system — extend his.
>
> **First moves for the new session:**
> 1. Read this file fully, then `CLAUDE.md` (conventions: discuss-before-build, Brooks
>    pushes — never push or touch git config, announce commits at message end, no stale
>    artifacts, review-loop-until-zero-blocking).
> 2. Locate and read Brooks' Pulumi repo. He recreated the sandbox intending to add it —
>    if it isn't at an obvious path, **ask him where it is as your first question; don't
>    go filesystem-hunting**. Learn: language, project/stack layout, state backend,
>    how it auto-deploys, naming/tagging conventions, and **whether it already creates a
>    GitHub OIDC provider** (one per account — the port must look it up, not recreate it).
> 3. Discuss the port plan with Brooks (plan mode), mirroring his Pulumi conventions.
>
> **What the port must preserve from `infra/template.yaml`** (every line of it was
> pressure-tested + agent-reviewed; treat as the spec, then delete it per artifact policy):
> - Private versioned S3 + CloudFront **OAC**; bucket policy grants `s3:GetObject` AND
>   `s3:ListBucket` (ListBucket = real 404s instead of 403s) conditioned on the
>   distribution ARN; CustomErrorResponse 404 → `/404.html` (code 404, TTL 60).
> - The **CloudFront viewer-request function verbatim** (host canonicalization incl.
>   *.cloudfront.net, query-string-preserving single-hop 301s, trailing-slash canonical,
>   directory→index.html rewrite). It was verified by executing 15+ cases in node.
> - Headers policy: CSP (`connect-src` = Sentry ingest host, see below), HSTS **without**
>   includeSubDomains (learning.brooksbuilds.com shares the zone), nosniff,
>   referrer-policy, frame DENY, permissions-policy; **beta adds X-Robots-Tag noindex**.
> - Two environments: beta = `beta.brooksbuilds.com`, single hostname; production =
>   apex + `www` (301 → apex). ACM certs in **us-east-1** (explicit provider in Pulumi).
> - GitHub OIDC deploy role per env: trust `aud=sts.amazonaws.com` +
>   `sub=repo:BrooksPatton/brooks_builds_consulting:ref:refs/heads/main`; minimal policy
>   (ListBucket on bucket, Put/DeleteObject on bucket/*, CreateInvalidation on the dist).
> - Distribution: Compress, redirect-to-https, http2and3, IPv6 (→ A **and** AAAA ALIAS
>   records), PriceClass_100, managed CachingOptimized, DefaultRootObject index.html.
>
> **Values that must carry over:**
> - Sentry ingest host for the CSP: **`o1079394.ingest.us.sentry.io`** (the real DSN is
>   already committed in `site/assets/sentry-init.js` — DSNs are public by design).
> - GitHub Actions variables the workflows consume: `BETA_/PROD_` + `AWS_DEPLOY_ROLE_ARN`,
>   `S3_BUCKET`, `CF_DISTRIBUTION_ID`. **The workflows themselves need no changes** —
>   they only consume those three values per environment, whatever tool created them.
>
> **Open questions to settle with Brooks during port planning:**
> - Should Pulumi manage the site's DNS records (ACM validation + ALIAS for beta/apex/www)
>   or does he keep DNS manual? (Undecided; he never answered — his caution is about the
>   zone also hosting learning.brooksbuilds.com.)
> - Whether beta + prod become two Pulumi stacks of one project (mirroring his LMS layout)
>   or whatever shape his existing setup suggests.
>
> **Where Brooks is in his checklist below:** CAA verified clean; Sentry project created;
> real DSN committed. Next after the port: deploy beta infra → BETA_* variables → beta DNS.
>
> **Also:** check `git log --oneline origin/main..main` early — the handoff-era commits
> may be unpushed (Brooks pushes; never push from the sandbox). Everything in this file
> below the two checklists is pre-execution planning history — the HANDOFF and the
> checklists are the live truth; the history mentions files that were since deleted
> (PLAN.md, design_inspiration/) by design.

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
- **IaC: one CloudFormation template, two stacks** (`brooksbuilds-site-beta` at beta.brooksbuilds.com with X-Robots-Tag noindex, auto-deployed on pushes to main; `brooksbuilds-site-prod` at apex+www, deployed via the manual Release workflow), both via `aws cloudformation deploy` from us-east-1 (CloudFront needs the ACM cert there). No Terraform/state backend for set-once stacks.

## Architecture

Private S3 bucket (versioned, public access blocked) → CloudFront with **Origin Access Control**, both aliases on one distribution. A **CloudFront Function** (viewer-request, `cloudfront-js-2.0`, `AutoPublish: true`) does three jobs: 301 any host that isn't `brooksbuilds.com` (catches www AND `*.cloudfront.net`), 301 `/index.html` → `/`, and rewrite `/foo/`-style URLs to `/foo/index.html`. Security headers via a `ResponseHeadersPolicy`. GitHub Actions deploys over **OIDC** (no stored AWS keys).

Key gotchas already pressure-tested (bake these in, don't rediscover them):
- **Deploy root must be `site/`**: the repo root holds `PLAN.md`, `design_inspiration/` (screenshots of Dustin's site), and `logos/` (raw brand files incl. .ai). A root-level `s3 sync` would publish all of it. Move `index.html`, `css/`, `assets/` into `site/` and sync only that.
- **HSTS without `includeSubDomains`** at launch — `includeSubDomains` served from the apex would force HTTPS on `learning.brooksbuilds.com` and everything else on the zone. Flip it later only after verifying every subdomain is HTTPS-only.
- **ACM cert**: both `brooksbuilds.com` + `www` as SANs; `DomainValidationOptions` with `HostedZoneId` parameter so CFN auto-creates the (additive, harmless) validation CNAMEs and the stack doesn't hang. Brooks still creates the real ALIAS records manually.
- **Real 404s under OAC**: grant the CloudFront principal `s3:ListBucket` (not just `GetObject`) so S3 returns 404 instead of 403 for missing keys; then one CustomErrorResponse 404 → `/404.html` (code 404, ErrorCachingMinTTL 60). Bucket policy must be a **separate resource** from the bucket (distribution ARN condition — looks circular, isn't).
- **OIDC**: `AWS::IAM::OIDCProvider` needs a non-empty `ThumbprintList` (`6938fd4d98bab03faadb97b34396831e3780aea1`) even though AWS ignores it; only one provider per URL per account (check none exists). Role trust: `aud=sts.amazonaws.com` AND `sub=repo:BrooksPatton/brooks_builds_consulting:ref:refs/heads/main` (exact, case-sensitive; breaks if the workflow adds `environment:`). Workflow MUST set `permissions: {id-token: write, contents: read}`.
- **CSP + vendored Sentry**: init goes in a local file `site/assets/sentry-init.js` (never inline — avoids `'unsafe-inline'`), loaded with `defer` after `sentry.min.js`. CSP: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src https://<DSN ingest host>; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests`. The ingest host lives in BOTH sentry-init.js and the template — note the duplication in comments. Sentry init: `sampleRate: 1.0`, anchored `allowUrls` matching apex/www/beta hosts to keep extension noise off the free tier, and an `environment` tag (production vs beta) derived from the hostname.
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
.github/workflows/deploy-reusable.yml — shared deploy logic (workflow_call): lint gate → OIDC
                                      → two-pass s3 sync → cloudfront invalidation
.github/workflows/deploy.yml        — Deploy Beta: push to main, BETA_* vars, calls reusable
.github/workflows/release.yml       — Release: manual dispatch, PROD_* vars, calls reusable
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
Initial commit (or commits); **Brooks pushes** (convention: never push from the sandbox — end the message with a push-ready callout). CI (not deploy) should go green on his push. Deploy skips until Brooks does his manual steps — expected; say so.

### Step 5 — Report + hand Brooks the manual runbook
Final message: what was built, what CI does, and the ordered manual runbook below. Update PRODUCTION.md checklist.

## Brooks' checklist (things only you can do — check them off as you go)

Two environments: **beta** (`beta.brooksbuilds.com`, auto-deployed by every push to main, serves `X-Robots-Tag: noindex`) and **production** (apex + www, deployed only by manually running the **Release** workflow). Exact stack commands live in the header comment of `infra/template.yaml`.

### Beta — do now, in order

- [x] **Pre-flight CAA check**: run `dig CAA brooksbuilds.com`. Empty result = fine. If records exist, one must permit `amazon.com`, or the ACM certificate silently fails to issue.
- [x] **Create a Sentry project** (type: Browser JavaScript) and copy its DSN.
- [x] **Put the DSN in `site/assets/sentry-init.js`** (replacing the placeholder marked `TODO(brooks)`), commit, push.
- [ ] **Deploy the beta infra** — ⚠ superseded by the Pulumi port (see HANDOFF at top): this becomes `pulumi up` on the beta stack once the port lands. The CloudFormation command in `infra/template.yaml`'s header remains a working fallback.
- [ ] **Set the beta GitHub Actions variables** (repo Settings → Secrets and variables → Actions → **Variables** tab — they're not secrets): `BETA_AWS_DEPLOY_ROLE_ARN`, `BETA_S3_BUCKET`, `BETA_CF_DISTRIBUTION_ID`, values from the beta stack's Outputs.
- [ ] **Trigger a beta deploy**: push anything to main (or re-run the latest Deploy Beta run) and confirm the Deploy Beta workflow actually deploys instead of skipping.
- [ ] **Beta DNS**: in Route53, create A **and** AAAA ALIAS records for `beta.brooksbuilds.com` pointing at the beta stack's `DistributionDomainName` output.
- [ ] **Verify beta**: `https://beta.brooksbuilds.com` serves the site (placeholders are fine here); response headers include the CSP and `X-Robots-Tag: noindex`; the raw `*.cloudfront.net` URL 301s to the beta host; a made-up path shows the styled 404.

### Release — when the content is ready

- [ ] **Fill the launch blockers** (grep `TODO(brooks)` to find them all): real scheduling URL (3 places in `site/index.html` + `BOOKING_URL` in `tests/links.spec.js`), real pricing, headshot, confirm social URLs.
- [ ] **Verify the content on beta** — it auto-deploys on push; click through everything once.
- [ ] **Deploy the prod stack** (second command in `infra/template.yaml`'s header — note `CreateOIDCProvider=false`).
- [ ] **Set the prod GitHub Actions variables**: `PROD_AWS_DEPLOY_ROLE_ARN`, `PROD_S3_BUCKET`, `PROD_CF_DISTRIBUTION_ID` from the prod stack's Outputs.
- [ ] **Run the Release workflow** (Actions tab → Release → Run workflow, on main).
- [ ] **Smoke-test the prod distribution**: `https://<prod-dist>.cloudfront.net` should 301 to `https://brooksbuilds.com`.
- [ ] **DNS cutover**: 4 ALIAS records (A + AAAA for both `brooksbuilds.com` and `www.brooksbuilds.com`) → prod `DistributionDomainName`. Don't touch `learning.*` or any MX/TXT records.
- [ ] **Run the post-cutover verification** (section below).
- [ ] **Uptime monitor** (UptimeRobot/Better Stack free tier): check `https://brooksbuilds.com` for HTTP 200 **plus** the string "Fractional Director"; second check on `https://www.brooksbuilds.com` expecting a 301.

### Post-launch, no rush

- [ ] Once every `*.brooksbuilds.com` subdomain is verified HTTPS-only, add `includeSubDomains` to HSTS (one-line change in `infra/template.yaml`, redeploy the prod stack).
- [ ] Optional: Google Search Console (verifies via one DNS TXT record) and submit `sitemap.xml`.
- [ ] Tell Claude the rollout is done → PRODUCTION.md gets folded into a lean README and deleted (artifact policy).

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
- [x] Phase 3 (beta/prod split): template environment-aware (beta = single host + X-Robots-Tag noindex; conditionals verified for both parameter sets), deploy split into reusable workflow + Deploy Beta (push to main) + Release (manual dispatch), Sentry events tagged by hostname with anchored allowUrls. Delta review: PASS, 0 blocking; polish applied (anchored allowUrls, per-stack output descriptions, all-vars + main-ref guards on both callers, convention-vs-IAM note in CLAUDE.md). cfn-lint clean, function matrix re-verified for beta domain, lint + 9 tests green.
- [ ] Post-cutover verification complete (requires Brooks' runbook)
