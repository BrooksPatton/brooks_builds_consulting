# Pulumi Port Plan — remaining work (prod launch)

> Working plan for the infra port phase. Lives while the phase is in flight; folds into
> PRODUCTION.md/README and gets deleted when the phase completes (artifact policy).

## Status

**Phase 1 is complete (2026-07-17): beta.brooksbuilds.com is live on the Pulumi-built
infrastructure and verified end-to-end** (headers incl. CSP + noindex, redirects, styled 404,
cache split). `infra/template.yaml` is deleted — the Pulumi project at `infra/` is the sole
source of truth. What remains: the platform retirement + prod launch below.

## Part 1 — Platform retirement (brooks_builds repo, two sequenced PRs)

Both branches are committed locally in that repo, ready to push: `retire-platform-prep`
(PR A) and `retire-platform` (PR B, stacked on A).

**PR A (prep, tiny):** adds optional `forceDestroy` to the S3 wrapper; sets it on
`platformBucket` + `platformLogBucket`. Merge → auto `pulumi up` records it in state.
Must be a separate deploy from the removal (deletion honors state, and CloudFront keeps writing
log objects until the distribution dies — pre-emptying by hand would race).

**PR B (retirement):** removes from `infrastructure/index.ts`: platformBucket, platformLogBucket,
platformCertificate + its validation records, the platform OAI (LMS has its own),
platformDistribution, both apex/www ALIAS records; prunes unused imports; deletes
`.github/workflows/website.yml`. **Before merging: check the preview's delete list is exactly
those platform resources** — learning.*, hasura.*, MX/TXT untouched. The distribution delete
takes ~10–20 min (CloudFront disables it first).

Optional tidy, your call: later delete the unused GitHub secrets (`PLATFORM_WEB_BUCKET`,
`CLOUDFRONT_DISTRIBUTION_ID`) and the `website/` Rust app source in that repo.

## Part 2 — Your next actions (one checkbox = one action, in order)

Apex is dark between retirement and launch — fine, the old site has no users; do the
retirement whenever, launch when content is ready. Content launch blockers are tracked in
PRODUCTION.md → Release.

### Retirement (do anytime)

- [ ] In the brooks_builds repo: `git push -u origin retire-platform-prep retire-platform`
- [ ] Open PR A from `retire-platform-prep` (base: main)
- [ ] Review PR A's `pulumi preview` on the PR (expect: 2 in-place **updates** — the two
      platform buckets gain forceDestroy; nothing created or deleted)
- [ ] Merge PR A
- [ ] Confirm the auto `pulumi up` run went green (fast)
- [ ] Open PR B from `retire-platform` (base: main)
- [ ] Review PR B's preview **delete list** (expect exactly: platformBucket, platformLogBucket,
      platform certificate + its validation records, the platform OAI, platform_distribution,
      apex + www A records — nothing else; learning/hasura/MX/TXT untouched)
- [ ] Merge PR B
- [ ] Confirm the up finished (~10–20 min; CloudFront disables the distribution first.
      Apex goes dark now — expected, stays dark until launch)

### Prod launch (when content is ready and verified on beta)

- [ ] Actions → Infrastructure → Run workflow, on main (expect: the 19-create prod plan you
      previewed; ~15–25 min. If it errors with alias/record conflicts, retirement PR B hasn't
      finished — that's the deliberate ordering guard, not damage)
- [ ] `cd infra && pulumi stack select prod`
- [ ] Set repo **variable** `PROD_S3_BUCKET` = `pulumi stack output bucketName`
- [ ] Set repo **variable** `PROD_CF_DISTRIBUTION_ID` = `pulumi stack output distributionId`
- [ ] Set repo **variable** `PROD_AWS_DEPLOY_ROLE_ARN` = `pulumi stack output deployRoleArn`
- [ ] Actions → Release → Run workflow, on main (expect: lint gate → sync → invalidation)
- [ ] Smoke-test: `curl -sI https://$(pulumi stack output distributionDomainName)` → 301 to
      `https://brooksbuilds.com`
- [ ] Tell Claude the prod stack is live → I run the post-cutover curl verification
      (PRODUCTION.md section; the wildcard network allow already covers apex + www)
- [ ] Confirm `https://learning.brooksbuilds.com` still serves unchanged
- [ ] Confirm `dig MX brooksbuilds.com` is unchanged
- [ ] Set up the uptime monitor (spec: PRODUCTION.md → Release, last item)
- [ ] Tell Claude the rollout is done → README fold; PLAN.md + PRODUCTION.md get deleted
      (artifact policy)

### Account baseline (from the AWS best-practices review; console tasks, no deadline)

Root MFA ✓ and budget alert ✓ already in place. Remaining:
- [ ] Enable CloudTrail (all regions → protected S3 bucket) — the one unconfirmed SSB item.
- [ ] Check what the IAM user behind the brooks_builds CI access keys can do; post-launch,
      migrate that repo's workflows to OIDC and delete the keys.
- [ ] Post-launch, tracked-not-now: LMS distribution OAI→OAC; optional GuardDuty.

## Live risks / operating notes

1. Cutover out of order → fails loudly by design (see ordering constraint); recovery is
   finish-retirement, re-run.
2. The pulumi CI role can modify itself and write any record in the zone — accepted for a solo
   account, documented in `infra/wrappers/github.ts`; the no-allowOverwrite convention is the
   guard.
3. The CI role is deliberately read-only on the GitHub OIDC provider: if the provider's inputs
   ever change, that one `pulumi up` must run locally with your credentials.
4. `pulumi up --target` resolves skipped resources' outputs to undefined in applies — the
   certificate wrapper is guarded against it; keep the guard if that code is ever reworked.
