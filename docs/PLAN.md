# SahiSize plan

**Goal:** a free tool that crores of exam applicants need every year, earning from ads enough to
cover the Claude subscription first, then more. Claude builds and maintains it; the owner
approves changes, verifies exam rules and handles accounts (domain, AdSense, Play Store).

## Where we stand (20 Nov 2026)

- Many similar tools already exist (coaching-site resizers, examdetail.in, docset.in,
  onlineresult.in and several vercel.app/pages.dev tools). We need to be clearly better, not just present.
- Our edge:
  1. Verifiably private: no uploads, enforced by the page's security policy.
  2. One-tap signature cleanup.
  3. Exact-KB output that passes either KB definition.
  4. Sizes with sources and a "last checked" date.
  5. Proper Hindi.
  6. Works offline on cheap phones.
- **Trend to plan around:** SSC, RRB and UPSC now capture the photo live through the camera.
  Signatures, thumb impressions, declarations and documents (PDFs) are becoming the main need.
  Banking (IBPS/SBI) and NTA exams still ask for photo uploads.

## Phase 1: MVP (done)

- [x] Resizer: gallery or camera, crop/zoom/rotate, face guide, signature whitening,
      name-and-date strip, exact pixels, KB range, DPI header
- [x] Presets: IBPS, SBI, SSC, RRB, UPSC, NEET UG, JEE Main, CUET UG, CTET, plus custom size
- [x] One page per exam (for search), Hindi/English toggle, offline PWA, privacy page
- [x] Automated test of every preset in headless Chromium
- [x] GitHub Pages deploy workflow

## Phase 2: go live and get indexed (week 1–2)

- [ ] Choose hosting: public repo + GitHub Pages, or Cloudflare Pages (owner)
- [ ] Buy a domain, e.g. a `.in` (owner). AdSense effectively needs your own domain.
- [ ] Google Search Console: verify the site and submit `sitemap.xml` (owner, ~10 min)
- [x] Verify presets against official notifications (20 Nov 2026): IBPS, SBI, JEE Main 2027,
      NEET UG 2026, CUET UG 2026, CTET Sept 2026 are verified and badged on the site.
      This corrected NEET (signature 10–100 KB, no postcard photo, impressions 50–200 KB),
      JEE Main (signature 10–100 KB), CUET (signature 10–50 KB) and CTET (signature 3–30 KB).
- [ ] UPSC, SSC and RRB block automated access to their notices. Verify them by hand, or when
      the owner shares the notice PDF (UPSC CSE/NDA/CDS 2027 notices are due Dec 2026 to Feb 2027).
- [ ] Add a contact email to `data/site.json` (needed for AdSense and Play Store)

## Phase 3: grow traffic (weeks 2–6)

Generic searches like "photo resize 20kb" and "signature 10 to 20 kb" have far more volume
than exam names, so the next pages target them.

- [x] "Compress photo to 10/20/30/50/100/200/500 KB", "20–50 KB" and "signature 10–20 KB" pages
- [x] Image → PDF under a KB limit (A4, multi-page), linked from each exam's PDF rows
      (NEET/JEE certificates 50–300 KB, IBPS 10th certificate up to 500 KB)
- [ ] Compress an existing PDF and merge PDFs (needs a bundled PDF renderer such as pdf.js)
- [ ] More exams, Hindi-belt first:
  - state PSCs (UPPSC, BPSC, MPPSC, RPSC)
  - UP/Bihar police
  - SSC GD and Agniveer
  - IBPS RRB as its own page
  - NEET PG, GATE, CAT
- [ ] Hindi URLs (`/hi/...`) so Hindi searches land on Hindi pages
- [ ] Time updates to exam seasons:
  - JEE Main: Nov and Jan
  - NEET and CUET: Feb–Mar
  - IBPS: Aug
  - SSC/RRB: as notified

## Phase 4: earn (from month 2, once there is steady traffic)

- [ ] Apply for Google AdSense (owner). Approval is not guaranteed and needs real traffic and
      content. Place ads after the result, never between the user and the download.
      Loosen the page's security policy only for the ad domains and update the privacy page first.
- [ ] Android app on the Play Store as a Trusted Web Activity built in GitHub Actions
      (same code). Owner pays the one-time USD 25 developer fee. New personal accounts must run
      a closed test with about 12 testers for 14 days first.
- [ ] Optional: "Support us" UPI link

## Phase 5: low-touch maintenance

- [ ] Weekly scheduled Claude task: check the official sites for new notifications, draft
      changes to `data/exams.json` as a branch or PR, and summarise what changed
- [ ] Owner reviews and merges (about 10 minutes a week, more in exam season)

## What the owner has to do

| Task | When | Time |
|---|---|---|
| Pick hosting and turn on Pages | Once | 5 min |
| Buy a domain and point it at the site | Once | 20 min |
| Search Console + sitemap | Once | 10 min |
| Confirm presets against official notices | Each notification | 5 min per exam |
| AdSense / Play Store accounts and payouts | Once | 1 hour |
| Review weekly update PRs | Weekly | 10 min |

## Measure

- Search Console impressions and clicks per exam page (weekly)
- Which presets people use most, so we know where to add exams (would need privacy-friendly
  analytics; decide before adding any)

## Risks

- **Wrong preset → rejected form.** Show sources and dates, target the overlap when sources
  disagree, push "check your notification", and verify against official PDFs.
- **Live-photo trend shrinks photo demand.** Shift weight to signatures, documents and PDFs.
- **Competition and slow search ranking** (often 3–6+ months). Win on quality, Hindi and
  long-tail pages.
