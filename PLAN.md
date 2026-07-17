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

## Part 2 — Your runbook (ordered; sandbox does none of this)

Apex is dark between retirement and launch — fine, the old site has no users; do the
retirement whenever, launch when content is ready.

- [ ] 8. brooks_builds PR A (forceDestroy prep): review its `pulumi preview` on the PR, merge,
      auto-up (fast).
- [ ] 9. brooks_builds PR B (retirement): **review the preview's delete list** — exactly the
      platform resources, nothing else. Merge; the up takes ~10–20 min (CloudFront disable +
      delete). Apex goes dark and stays dark until step 10 — no scheduling needed.
- [ ] 10. When content is ready and verified on beta: Actions → Infrastructure → Run workflow
       (prod) — the prod plan was already visible in every PR preview. ~15–25 min.
- [ ] 11. Set `PROD_AWS_DEPLOY_ROLE_ARN` / `PROD_S3_BUCKET` / `PROD_CF_DISTRIBUTION_ID` repo
       variables from prod stack outputs (`cd infra && pulumi stack select prod &&
       pulumi stack output <name>`).
- [ ] 12. Run the Release workflow → site live.
- [ ] 13. Post-cutover verification (PRODUCTION.md) + learning.brooksbuilds.com unchanged +
       `dig MX brooksbuilds.com` unchanged + uptime monitor.

Ordering constraint (the only hard one): prod `up` must come after retirement PR B — CloudFront
rejects duplicate aliases across distributions, and we deliberately fail loudly on Route53
conflicts instead of overwriting. If run out of order it errors cleanly; finish retirement and
re-run.

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
