# Brooks Builds Consulting — Project Conventions

Marketing site for Brooks' fractional Director of Engineering consulting business.
Production: brooksbuilds.com (apex canonical, www redirects) on S3 + CloudFront, deployed by GitHub Actions.

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
- **CSP coupling**: the Sentry ingest host appears in BOTH `site/assets/sentry-init.js` and the CSP
  in `infra/template.yaml` — change them together.
- **No build step.** HTML/CSS ship as-authored. Cache: HTML/xml/txt no-cache, css/assets 1 day; if a
  same-day CSS fix must propagate, bump the `?v=N` query on the stylesheet link.
- **Brand tokens**: teal #006480, secondary #a3bbc1, light #ebebeb; page bg #f3f3f3, borders #d2d2d2,
  text #343a40/#495057, link #1565c0; monospace everywhere; official logo SVGs from `logos/` only.
- **Copy rule**: structure may parallel UpShift HQ (Dustin's fractional-CTO site, business partner);
  wording must never echo it — phrase-level originality is a hard requirement.
- **HSTS**: served WITHOUT `includeSubDomains` on purpose (learning.brooksbuilds.com shares the
  zone). Only add it after verifying every subdomain is HTTPS-only.

## Commands

- Serve locally: `python3 -m http.server 8080 --bind 0.0.0.0 --directory site`
- Lint: `npm run lint` (html-validate + stylelint + prettier check)
- Re-vendor Sentry after a version bump: `npm run vendor:sentry`
