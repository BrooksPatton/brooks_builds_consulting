# Pulumi Port Plan — CloudFormation → Pulumi for the consulting site

> Working plan for the infra port phase. Lives while the phase is in flight; folds into
> PRODUCTION.md/README and gets deleted when the phase completes (artifact policy).

## TL;DR

Replace `infra/template.yaml` (CloudFormation, never deployed) with a **new standalone Pulumi
project** in this repo at `infra/`, two stacks (`beta`, `prod`), same Pulumi Cloud org as your
`brooks_builds` project. Retire the platform web app in the `brooks_builds` repo to free the
apex. OIDC for every deploy path (no long-lived AWS keys). Pulumi manages the site's DNS.
Nothing deploys from the sandbox. Every infra change is inspected as a `pulumi preview` on its
PR and applied by `pulumi up` on merge; your only local action is a one-time identity bootstrap
(OIDC provider + CI role), previewed first.

## Decisions this plan encodes (already agreed — flag if any look wrong)

| Decision | Choice |
|---|---|
| Where infra code lives | This repo, `infra/` (replaces template.yaml) |
| Project/stack shape | One project `brooks_builds_consulting`, stacks `beta` + `prod` |
| Platform app at apex | Retires (removed from brooks_builds repo) |
| CI auth | GitHub OIDC everywhere; `PULUMI_ACCESS_TOKEN` is the only stored secret |
| DNS | Pulumi-managed (A+AAAA ALIAS + cert validation); zone itself is a lookup, never managed |
| Code style | Intent-altitude wrappers: Pulumi calls only in `infra/wrappers/*`; `index.ts` reads as intent; your idioms (named options, resources-as-params, required tags) inside |
| Spec | `infra/template.yaml` semantics carry over 1:1; site deploy workflows unchanged |
| Cadence | Beta infra auto-applies on main push; prod infra manual `workflow_dispatch` only |
| Sandbox | Never gets AWS/Pulumi credentials; offline validation only |

---

## Part 1 — New `infra/` Pulumi project (this repo)

### Scaffolding

Start from the official boilerplate, not hand-authored files: `pulumi new typescript
--generate-only` in `infra/` (no backend login or AWS creds needed — it only writes
Pulumi.yaml/package.json/tsconfig/index.ts), then reshape into the layout below. The Pulumi CLI
isn't in the sandbox yet; install it from the GitHub release tarball (github.com is
firewall-allowed). If the release download is blocked, fallback: Brooks runs the scaffold
command himself and the sandbox builds on it.

`package.json` pins the toolchain: `"engines": { "node": "22.x" }` (matches the workflow's
node 22 and the sandbox's v22.22.1), plus an `.nvmrc` with `22` (same convention as
brooks_builds' stripe_webhook project) so every environment agrees on the Node version.

### Layout

```
infra/
  Pulumi.yaml                 # name: brooks_builds_consulting, runtime: nodejs
  Pulumi.beta.yaml            # committed — nothing secret in config
  Pulumi.prod.yaml
  package.json / package-lock.json / tsconfig.json / .gitignore
  index.ts                    # main() — one intent call per concept
  wrappers/
    utils.ts                  # Tags {Name, project, stack}, requireStack() → "beta"|"prod"
    certificates.ts           # createValidatedCertificate
    static_site.ts            # createStaticSite — bucket, OAC, function, headers, distribution, policy
    redirect_function.ts      # redirectFunctionCode(host) — the verified function, verbatim
    dns.ts                    # lookupZone, createAliasRecords (A+AAAA)
    github.ts                 # ensureGithubOidcProvider, createSiteDeployRole, createPulumiCiRole
  tests/
    redirect_function.test.ts # 15-case matrix × both hosts, runs offline in CI
```

Deps: latest `@pulumi/pulumi` + `@pulumi/aws` v7, TypeScript 5 strict. Scripts: `typecheck`, `test`.

### Per-stack config (all committed, non-secret)

| key | beta | prod |
|---|---|---|
| `aws:region` | us-east-1 | us-east-1 |
| `domain_name` | beta.brooksbuilds.com | brooksbuilds.com |
| `zone_name` | brooksbuilds.com | brooksbuilds.com |
| `github_repo` | BrooksPatton/brooks_builds_consulting | same |
| `sentry_ingest_host` | o1079394.ingest.us.sentry.io | same |
| `create_github_oidc_provider` | **true** | false (looks it up) |
| `create_pulumi_ci_role` | **true** | false |

Environment (www SAN, noindex header) derives from the stack name — no config key that could
contradict it. Beta owns the account-level singletons (OIDC provider, CI role); prod looks them up.

### main() shape

```
requireStack() → lookupZone → createValidatedCertificate → createStaticSite
→ createAliasRecords → ensureGithubOidcProvider → createSiteDeployRole
→ (beta only) createPulumiCiRole
```

Stack outputs map 1:1 onto the GitHub Actions variables you'll set: `bucketName`,
`distributionId`, `deployRoleArn`, `distributionDomainName`, `pulumiCiRoleArn` (beta only).

### Wrapper details that matter

- **certificates.ts** — ACM cert (www SAN prod-only) + one validation record per *statically
  known* domain (no resources created inside `.apply()` — fixes the preview-blindness
  anti-pattern in the old repo) + `CertificateValidation` so the distribution waits for issuance.
- **static_site.ts** — versioned private bucket (deterministic name prefix
  `brooksbuilds-site-${stack}-`; the CI role's S3 permissions are scoped to that prefix), OAC,
  the viewer-request function (verbatim, `publish: true`), headers policy (CSP
  character-identical to the template incl. Sentry ingest host; HSTS **without**
  includeSubDomains — learning.brooksbuilds.com; beta-only `X-Robots-Tag: noindex`),
  distribution (http2and3, IPv6, PriceClass_100, managed CachingOptimized, 404→/404.html code
  404 TTL 60, TLS1.2_2021), bucket policy with GetObject **and** ListBucket (real 404s not
  403s) conditioned on the distribution ARN.
- **dns.ts** — A+AAAA ALIAS per hostname (beta: 2 records; prod: 4). **Deliberately no
  `allowOverwrite`** anywhere (deviates from your legacy wrapper): if the platform stack still
  owns apex records, prod `up` fails loudly instead of silently hijacking them. This is the
  sequencing guard for cutover.
- **github.ts** —
  - Site deploy role per stack (`brooksbuilds-site-${stack}-deploy`): trust
    `aud=sts.amazonaws.com` + `sub=repo:…:ref:refs/heads/main` exactly; policy is just
    ListBucket + Put/DeleteObject + CreateInvalidation. Your existing site workflows consume
    these ARNs unchanged.
  - Pulumi CI role (`brooksbuilds-site-pulumi-ci`, created once in beta): trust covers
    `ref:refs/heads/main` (up) **and** `pull_request` (preview). Policy pragmatically scoped:
    S3 to the `brooksbuilds-site-*` prefix, Route53 to your one zone, IAM to
    `role/brooksbuilds-site-*`, CloudFront/ACM service-wide (their ARNs are opaque IDs),
    OIDC provider **read-only** (changing the account singleton stays a you-only, local
    operation). Known accepted risk, documented in code: it can modify itself and write any
    record in the zone — fine for a solo account; the no-allowOverwrite convention is the guard.

### New workflow: `.github/workflows/infra.yml`

- `check` (every PR/push, no AWS): `npm ci` + `typecheck` + the redirect-function test matrix.
- `preview` (PRs touching `infra/**`): matrix over both stacks, OIDC via `PULUMI_CI_ROLE_ARN`
  variable + `PULUMI_ACCESS_TOKEN` secret, `pulumi preview`.
- `up-beta` (push to main): `pulumi up` beta, no-cancel concurrency group.
- `up-prod` (manual dispatch from main only): `pulumi up` prod.
- All AWS jobs skip green until `PULUMI_CI_ROLE_ARN` is set (same convention as Deploy Beta).
- **No `environment:` key anywhere** — it changes the OIDC sub claim and breaks role trust
  (commented in the file, same as release.yml).

### Other changes in this repo (same PR)

- Root `package.json`: prettier globs gain `infra/**/*.ts` so existing CI lints the new code.
- `PRODUCTION.md`: HANDOFF header collapses to "port landed"; beta/release checklists rewritten
  around the runbook below (manual beta-DNS step deleted — Pulumi owns DNS now); account-baseline
  checklist added (below).
- `CLAUDE.md`: "mid-port" paragraph replaced; CSP coupling note now points at
  `Pulumi.*.yaml` `sentry_ingest_host` ↔ `site/assets/sentry-init.js`.
- `infra/template.yaml`: **kept in this PR** — deleted in a one-line follow-up commit after your
  first successful beta `pulumi up` + verification (until Pulumi has provisioned once, the
  reviewed template is the proven fallback). Runbook item so it can't linger.

---

## Part 2 — Platform retirement (brooks_builds repo, two sequenced PRs)

**PR A (prep, tiny):** add optional `forceDestroy` to the S3 wrapper; set it on
`platformBucket` + `platformLogBucket`. Merge → auto `pulumi up` records it in state.
Must be a separate deploy from the removal (deletion honors state, and CloudFront keeps writing
log objects until the distribution dies — pre-emptying by hand would race).

**PR B (retirement):** remove from `infrastructure/index.ts`: platformBucket, platformLogBucket,
platformCertificate + its validation records, the platform OAI (LMS has its own),
platformDistribution, both apex/www ALIAS records; prune unused imports. Delete
`.github/workflows/website.yml`. **Before merging: check the preview's delete list is exactly
those platform resources** — learning.*, hasura.*, MX/TXT untouched. The distribution delete
takes ~10–20 min (CloudFront disables it first).

Optional tidy, your call: drop the two platform config keys; later delete the unused GitHub
secrets and the `website/` Rust app source.

---

## Part 3 — Your runbook (ordered; sandbox does none of this)

The rule you asked for, encoded throughout: **every infra change is inspected as a `pulumi
preview` on a PR before `pulumi up` applies it on merge.** The only exception is a one-time
identity bootstrap (the OIDC provider + CI role) — CI can't assume a role that doesn't exist
yet — and even that gets a local `pulumi preview` first.

### Phase 1 — beta live (no downtime risk, do anytime)

- [ ] 1. The port lands as a PR (sandbox commits, you push the branch). Don't merge yet —
      the `check` job (typecheck + function tests) runs; AWS jobs skip green.
- [ ] 2. Pre-flight: `aws iam list-open-id-connect-providers` — if a GitHub provider already
      exists, set `create_github_oidc_provider: false` on beta first.
- [ ] 3. On the PR branch: `cd infra && npm ci && pulumi login && pulumi stack init beta &&
      pulumi stack init prod` (same org as brooks_builds).
- [ ] 4. Identity bootstrap, preview first: `pulumi stack select beta && pulumi preview` —
      inspect the whole beta plan. Then apply ONLY the identity pieces:
      `pulumi up --target '**github_oidc_provider**' --target '**pulumi_ci_role**'`
      (the trailing `**` glob also matches the CI role's inline policy; exact URNs are shown
      by the preview). Deliberately NO `--target-dependents` — that would drag in the deploy
      role, whose policy needs the not-yet-created bucket/distribution, and the plan errors.
      Everything else stays unapplied.
- [ ] 5. GitHub repo settings: secret `PULUMI_ACCESS_TOKEN`; variable `PULUMI_CI_ROLE_ARN`.
      Re-run the PR's checks → the `preview` job now runs both stacks under the OIDC role.
      Inspect the previews on the PR.
- [ ] 6. Merge → `up-beta` applies the rest automatically (bucket, cert, distribution, beta
      DNS, deploy role; ~10–20 min).
- [ ] 7. Set `BETA_AWS_DEPLOY_ROLE_ARN`, `BETA_S3_BUCKET`, `BETA_CF_DISTRIBUTION_ID` variables
      from `pulumi stack output`; re-run Deploy Beta → verify beta (CSP + noindex headers,
      cloudfront.net 301s, styled 404). Then the template.yaml deletion commit.

### Phase 2 — platform retirement + prod launch (apex is dark in between — fine, the old
### site has no users; do the retirement whenever, launch when content is ready)

- [ ] 8. brooks_builds PR A (forceDestroy prep): review its `pulumi preview` on the PR, merge,
      auto-up (fast).
- [ ] 9. brooks_builds PR B (retirement): **review the preview's delete list** — exactly the
      platform resources, nothing else. Merge; the up takes ~10–20 min (CloudFront disable +
      delete). Apex goes dark and stays dark until step 10 — no scheduling needed.
- [ ] 10. When content is ready and verified on beta: Actions → Infrastructure → Run workflow
       (prod) — the prod plan was already visible in every PR preview. ~15–25 min.
- [ ] 11. Set `PROD_AWS_DEPLOY_ROLE_ARN` / `PROD_S3_BUCKET` / `PROD_CF_DISTRIBUTION_ID` from
       prod stack outputs.
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

---

## Verification before anything reaches you (offline, in the sandbox)

1. `tsc --noEmit` in `infra/` (also catches any @pulumi/aws v7 API-name drift).
2. Root `npm run lint` (prettier now covers infra; site checks unchanged).
3. Redirect-function test matrix: execute the generated function code in `node:vm` for **both**
   hosts against the 15 verified cases (rewrites, single-hop 301s, query preservation incl.
   multi-value keys). Exact-match assertions.
4. Parity review: fresh-context agent lenses per repo convention, looped until zero blocking —
   lens 1: template.yaml ↔ Pulumi parity line-by-line + IAM trust/scoping;
   lens 2: infra.yml triggers/guards/concurrency + retirement diff completeness + forceDestroy
   sequencing.

## Risks (all mitigated, none blocking)

1. Pulumi v7 API naming drift → caught by tsc + your first preview; not semantic.
2. Pre-existing OIDC provider → runbook step 2 + config flag.
3. Cutover out of order → fails loudly by design; recovery is finish-retirement, re-run.
4. CI-role permission gaps → flushed out in phase 1: the port PR's own preview and up-beta run
   under the CI role while local `pulumi up` remains a fallback.
5. CI role can self-modify / write in the zone → accepted for solo account, documented in code.
6. `pulumi up --target` bootstrap is fiddly (URN syntax) → preview output shows the exact URNs;
   worst case, a full local `pulumi up` on beta is an acceptable fallback (it just moves the
   first apply off CI — every later change still goes preview-on-PR → up-on-merge).
