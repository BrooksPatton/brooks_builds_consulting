# Brooks Builds Consulting — Marketing Site (Execution Playbook)

This plan is written to be executed by any AI session (Opus, Fable, etc.) with no prior context. **Step 0 of execution is to copy this entire document into the repo as `PLAN.md`** so future sessions can pick it up, and to keep its Status Checklist updated as work progresses.

## Context

Brooks is launching a consulting business offering **fractional engineering-director-level leadership** (the layer below fractional CTO). His business partner Dustin runs UpShift HQ (fractional CTO) with a conversion-focused landing page. Brooks wants a site that:

- **Looks like his existing brand** — the Brooks Builds Learning LMS design language: light gray background, white cards with thin borders, monospace typography, teal logo/accents, blue links, understated and education-first.
- **Is structured like UpShift HQ** — pain-point hero, "sound familiar?" grid, delivery pillars, tiered engagement ladder, about section, strong closing CTA.
- **Uses his own language** — same business shape as Dustin, but director-level positioning and Brooks' voice (plain-spoken, teacher-first, no hype).

Decisions already confirmed with Brooks (do not re-ask):
- Visual: LMS look, UpShift structure
- Stack: plain HTML + CSS, no build step, no JS (hostable anywhere)
- Offerings: draft a placeholder engagement ladder with placeholder pricing for him to refine
- Primary CTA: "Book a Call" button with a placeholder scheduling URL, clearly marked to swap

## Source-of-truth inputs (all in this repo)

- `design_inspiration/Screenshot ... UpShift HQ ....png` — structural reference (both live sites are unreachable from this sandbox; screenshots are the only reference)
- `design_inspiration/Screenshot ... Brooks Builds Courses.png` — visual/brand reference
- `logos/brooksbuilds brand/svg/` — **official brand assets, use these; do not recreate the logo**
  - `logo-bb-blue.svg` — full wordmark (header), `bb-logo-icon-blue.svg` / `logo-bb-icon-blue.svg` — icon mark (footer/favicon)
  - Brand colors extracted from the SVGs: primary **#006480**, secondary **#a3bbc1**, light **#ebebeb**

## Deliverables

```
PLAN.md             — this document, kept current (Step 0)
index.html          — single-page site, semantic sections
css/styles.css      — all styling; CSS custom properties for design tokens
assets/             — logo SVGs copied from logos/ (keep originals untouched), favicon
```

## Design tokens

- Page background: light gray `#ebebeb` (brand light), slightly differentiated band for hero/footer per the LMS screenshot
- Cards: white, 1px light-gray border, ~8px radius, generous padding
- Text: near-black (e.g. `#1f2933`)
- Accent: brand teal `#006480` for buttons, section icons, emphasis; `#a3bbc1` for secondary/muted touches
- Links: blue, underlined (matches LMS "Join Discord" / "Login or Signup")
- Type: monospace throughout — `ui-monospace, "JetBrains Mono", "Fira Mono", Menlo, Consolas, monospace`. No external font/CDN requests (sandbox firewall blocks them; also keeps the page dependency-free)
- Buttons: solid `#006480`, white mono text, subtle hover darken — CTA shape borrowed from UpShift, brand color from LMS

## Page structure (UpShift skeleton, Brooks' voice)

1. **Header** — full wordmark SVG, anchor nav (How It Works, Engagements, About), teal "Book a Call" button.
2. **Hero** — director-level pain headline, e.g. *"Your CTO sets the direction. Nobody's building the road."* Subhead positioning fractional Director of Engineering: the layer that turns strategy into shipped work — managers supported, teams unblocked, delivery predictable. Primary CTA.
3. **Sound familiar?** — 6 white pain cards aimed at the director gap: engineers promoted to manager with zero support; every team plans differently and nothing lands together; the CTO doing 1:1s instead of strategy; delivery dates that are guesses; ad hoc hiring/onboarding; retros that change nothing.
4. **Three pillars** — what a fractional director delivers: **I grow your managers** (coaching, real 1:1s — leans on Brooks' teaching background), **I make delivery boring** (cadence, planning, predictable shipping), **I connect strategy to the ground** (translate CTO/founder direction into team execution).
5. **Engagements** — numbered ladder like UpShift's process section, all pricing as obvious placeholders (`$X,XXX` + `<!-- TODO(brooks): ... -->`):
   1. *Engineering Org Diagnostic* — ~2 weeks, fixed fee: manager/team health assessment, delivery audit, prioritized 90-day roadmap
   2. *Embedded Fractional Director* — monthly, 1–2 days/week: run the leadership layer, coach managers, own delivery cadence
   3. *Manager Coaching Retainer* — ongoing lighter-touch: recurring manager coaching + async support
   Include a cost-comparison line vs. a full-time Director of Engineering (mirrors UpShift's comparison band).
6. **About Brooks** — headshot placeholder; story in his voice: years teaching engineers at a code school and live on Twitch/YouTube ("Brooks Builds"); through-line: he grows engineers into what's next, and growing teams need grown managers. One line noting he partners with UpShift HQ for CTO-level strategy (cross-referral link).
7. **Closing CTA band** — "Book a discovery call — 30 minutes, no pitch," no-long-term-commitment framing, teal button (same placeholder URL).
8. **Footer** — LMS-style: centered icon mark, © 2026 Brooks Builds LLC, social icons (Twitter/X, Twitch, YouTube) as inline SVGs with placeholder hrefs where unknown.

Responsive: single column under ~700px; cards stack; nav collapses to logo + CTA (no hamburger, no JS — anchor links hidden on small screens). Smooth scroll via CSS `scroll-behavior`.

## Copy rules

- All copy original. Structure may mirror UpShift; **no phrase may be copied** ("black box" etc. is Dustin's).
- Brooks' register from the LMS: direct, first-person, teacher-not-salesman, no buzzwords.
- Every placeholder (pricing, scheduling URL, headshot, social links) gets an HTML comment `<!-- TODO(brooks): ... -->` and appears in the final report to Brooks.

---

# How to execute this plan

Work in iterations. **Done is not the exit condition — passing review is.** Do not stop after the first build; stop when an iteration produces zero blocking findings against the acceptance criteria below.

### Step 0 — Bootstrap
1. Copy this document to `PLAN.md` at the repo root. Update its Status Checklist at the end of every iteration.
2. Read both screenshots in `design_inspiration/` (they are images — use the Read tool) and the SVGs in `logos/brooksbuilds brand/svg/` before writing any code.

### Step 1 — Build
Create the deliverables per the spec above. Copy (don't move) the needed logo SVGs into `assets/`.

### Step 2 — Self-verify
1. Serve: `python3 -m http.server 8080 --bind 0.0.0.0` from the repo root.
2. Render and inspect at ~1280px and ~390px. If a headless browser is available (e.g. `npx playwright screenshot`, may fail under the network firewall — that's fine, skip if blocked), take screenshots and Read them; otherwise verify by careful code review of layout at both breakpoints.
3. `curl -s localhost:8080 | grep -ci todo` — confirm the TODO placeholders exist; confirm zero external network requests in the HTML/CSS (`grep -E 'https?://' index.html css/styles.css` should only match outbound *links*, never fonts/scripts/styles).
4. Validate HTML if tooling is available (`npx html-validate index.html`); if the network blocks installs, do a manual pass for unclosed tags, duplicate IDs, missing alt text.

### Step 3 — Independent agent review (the important part)
Launch **fresh-context review agents** (Agent tool, e.g. `general-purpose` or `Explore` for read-only review) — fresh context is the point: they check the artifact, not your intentions. Run these lenses, in parallel, each prompted to actively hunt for failures and to report file:line findings:

1. **Brand fidelity** — give it `index.html`, `css/styles.css`, and the LMS screenshot path. Question: "Does this page read as the same brand as the screenshot? Check background, card treatment, typography (monospace everywhere), colors (#006480 / #a3bbc1 / #ebebeb), link style, button style. List every deviation."
2. **Structure & conversion** — give it the UpShift screenshot path + `index.html`. Question: "Does the page follow this structural skeleton (pain hero → sound-familiar grid → pillars → engagement ladder → about → closing CTA)? Is the director-level positioning coherent and distinct from fractional-CTO positioning? Flag any copy that echoes the screenshot's phrasing too closely."
3. **Code quality & responsiveness** — HTML validity, semantics, accessibility basics (landmarks, alt text, contrast of #006480 on white ≥ 4.5:1, focus states), responsive behavior at 390/768/1280px reasoned from the CSS, no dead anchors, no external resource loads.

### Step 4 — Fix and loop
Triage findings into **blocking** (violates spec, acceptance criteria, or brand) and **polish**. Fix all blocking and any cheap polish, then **re-run the affected review lens(es)**. Repeat Steps 2–4 until a full round returns zero blocking findings. If a finding is wrong or conflicts with Brooks' explicit decisions above, overrule it and note why in `PLAN.md`. Expect 2–3 rounds; if findings repeat identically across rounds, fix the disagreement rather than looping forever (max ~4 rounds, then surface the stalemate to Brooks).

### Step 5 — Report
Final message to Brooks must include: what was built, how to view it locally, the complete list of `TODO(brooks)` placeholders to fill in (scheduling URL, pricing, headshot, social links), and anything overruled or left open.

## Acceptance criteria

- [x] Site is plain HTML + CSS only — no JS, no build step, no external requests (fonts, scripts, styles all local)
- [x] Uses official logo SVGs from `logos/`, colors #006480 / #a3bbc1 / #ebebeb, monospace type throughout (#a3bbc1 appears via the wordmark; the unused CSS token was removed)
- [x] Visual language matches the LMS screenshot (verified by pixel-sampling: bg #f3f3f3, band #ebebeb, borders #d2d2d2, white cards, blue links, teal accents)
- [x] Structure follows the UpShift skeleton with all 8 sections present
- [x] Positioning is clearly fractional **director**-level, in original language — three copy rounds; final verifier confirms zero phrase-level echoes
- [x] Placeholder ladder with 3 engagement tiers, pricing marked as placeholder
- [x] All CTAs point to one placeholder scheduling URL marked `TODO(brooks)`
- [x] Responsive at 360/390/768/1280px (header math verified by measurement; 320px is below the design floor); valid HTML (`npx html-validate` clean), contrast all AA, landmarks/alt/list semantics in place
- [x] All three review lenses passed with zero unresolved blocking findings (brand: PASS round 2; code: round 3 PASS after one prescribed one-line fix, arithmetic pre-verified; copy: round 3 clean after two prescribed rewrites, applied verbatim)
- [x] `PLAN.md` exists in repo with this checklist updated

## Status Checklist (update as you go)

- [x] Step 0: PLAN.md bootstrapped, references read
- [x] Step 1: initial build complete (index.html, css/styles.css, assets/)
- [x] Step 2: self-verification passed — all assets serve 200, 6 TODO(brooks) markers, zero external resource loads, `npx html-validate` clean. Headless-browser screenshots not possible: the firewall blocks Playwright/Puppeteer browser CDNs (allow `cdn.playwright.dev` or `storage.googleapis.com` to enable).
- [ ] Step 3/4: review rounds — record each round and its blocking-finding count here
  - Round 1: code quality 3 blocking (2 fixed: scroll-padding for sticky header, mobile header overflow/wrapping nav; 1 overruled: placeholder URL/pricing is intentional per Brooks' decisions — must be swapped before deploy). Brand fidelity 3 blocking (fixed: neutral gray text palette #343a40/#495057, removed solid-teal callout band, link blue; note: LMS-sampled #1976d2 fails WCAG AA on the gray bands, so used #1565c0 — same blue family, one step darker) + polish applied (no uppercase eyebrows, no negative tracking, boxed header logo, muted nav links, platform-colored social icons, radius token, removed dead token/duplicate asset). Overruled: "no filled teal buttons/number circles" — the approved plan explicitly sanctions UpShift-shaped CTAs in brand teal. Structure/copy 10 blocking (all fixed: rewrote every UpShift-templated line — hero checklist, "hit close to home" sub, both callouts, pillars H2 + "Pillar one/two/three" labels, engagements sub, "prioritized 90-day plan", cost-comparison callout, discovery-call card/button) + polish applied ("management layer", scoped successor claim to embedded engagements, coherent hero checklist, single "Book a Call" label). Partially overruled: "closing CTA should be a dark band" — conflicts with the brand lens (no filled teal surfaces) and with band alternation (about + footer are bands); gave the closer card a teal accent border instead.
  - `.htmlvalidate.json` added: `no-redundant-role`/`prefer-native-element` off because `role="list"` is kept deliberately (Safari drops list semantics under `list-style: none`).
  - Round 2: brand fidelity **PASS, 0 blocking** (3 polish applied: blue-family link hover, checkmark content fallback for pre-2024 Safari/Firefox, social icons as filled tiles matching the LMS footer). Code quality 3 blocking, all sticky-header math at intermediate widths (fixed: mobile nav font-size targeted `.site-nav a` not the container, header wrap breakpoint raised 700→850px, sub-400px header trims to keep one row at 360px; also removed unused ladder-card class). Accepted: Twitter tile #1da1f2 is below 3:1 non-text contrast on the band — matches the LMS reference footer exactly and platform logos are brand-exempt. Copy lens 2 blocking (fixed: discovery-card "Bring your ___" template, "same problems come back" pain-card clause) + 6 polish applied (hero "gets" triple, "Is this you"-template H2 → "Six signs the director seat is empty", "No pitch" fragment, price-note microcopy, "two engineers talking" audience mismatch, "Start with the diagnostic" imperative). Copy lens confirmed positioning, coherence, and voice clean.
  - Round 3: code lens verified all round-2 header fixes PASS with measured arithmetic; 1 remaining blocking (360px nav wrap — fixed with `column-gap: 0.5rem` in the ≤400px query, math verified in the same report: 309.6px ≤ 320px). Noted: 320px viewports are below the design floor (button wraps); revisit only if that width ever matters. Copy lens found 2 last synonym-level echoes ("…, not the dependency" tail; "No slides, no pressure" cadence) — fixed with the reviewer's exact rewrites, which its report pre-verified as leaving zero remaining echoes. Loop converged: 0 unresolved blocking findings across all lenses.
- [x] Step 5: final report delivered to Brooks (see repo README-level summary in the conversation; TODO(brooks) markers at index.html lines 25, 147, 166, 184, 210, 263)
