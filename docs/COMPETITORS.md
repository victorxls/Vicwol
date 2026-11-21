# Competitor study (21 Nov 2026)

How the main exam photo resizers and iLovePDF behave for a phone user, compared with SahiSize.
Done with **REA 6.10.1** ("Reverse Engineer Anything", MIT, [morluto/rea](https://github.com/morluto/rea)),
using only its passive website observation, plus a normal browser.

## Method and limits (what we did and did not do)

- REA was installed locally from npm (no install scripts ran; its `setup` command was not run).
- `rea capture-browser-scenario`: one visit per page at phone size (390 × 844), 7 seconds to settle;
  recorded requests, console errors, page HTML and a screenshot.
- `rea inspect-web-page`: passive observation while a synthetic 3.5 MB test photo was selected and the
  site's main button pressed, to see whether the photo leaves the phone. REA keeps only the site's own
  domain by default, so the browser's own request log (all destinations) was used as a cross-check.
- Not done: no analysis of competitors' scripts or source code (`analyze-web-bundle` and script-source
  capture were not used), no bulk crawling, nothing behind a login, no uploads to iLovePDF (its robots.txt
  disallows `/upload/`). robots.txt allowed every page visited.
- CareerPower blocks automated browsers (HTTP 403), so it was skipped. photosarkari.vercel.app no longer exists.

## Results

| | SahiSize | ExamDetail | DocSet | OnlineResult | ExamResizer | iLovePDF |
|---|---|---|---|---|---|---|
| Page tested | /exam/sbi | SBI PO | SBI Clerk | RRB | IBPS | Compress PDF |
| Requests on load | **8** | 72 | 148 | 25 | 52 | 40 |
| Scripts | **2** | 26 | 48 | 10 | 17 | 8 |
| Third-party hosts | **0** | 13 | 11 | 10 | 5 | 13 |
| Ads | none | AdSense | AdSense | AdSense | AdSense | Google Ad Manager, OpenX, Criteo, Amazon |
| Tracking | none | Google Analytics, Microsoft Clarity (session recording) | Google Tag Manager, Cloudflare | Google Tag Manager, Cloudflare | Google Analytics (per its cookie banner) | Google Analytics, Tag Manager |
| Page HTML | **17 KB** | 420 KB | 325 KB | 511 KB | 127 KB | 59 KB |
| Server response | **144 ms** | 1,639 ms | 366 ms | 342 ms | 486 ms | 308 ms |
| Hindi on page | full bilingual | almost none | a lot | some | none | none |
| Pages in sitemap | 28 (9 exams) | 512 (~103 resizer) | 621 (~232 resizer) | 8,836 (general site) | 29 | – |
| Structured data | home only | FAQ, HowTo, Breadcrumb, WebApplication | FAQ, HowTo, SoftwareApplication | FAQ, Breadcrumb, WebApplication | FAQ, WebApplication | – |
| Test photo uploaded? | no | no | no | no | no | not tested |

## What this means

1. **Breadth is the biggest gap.** DocSet and ExamDetail each have 100–230 exam-specific pages; we have 9.
   People search by exact exam name ("IBPS RRB clerk photo size"), so each variant needs its own page.
   Only add pages we can back with real specs. Thin copy-paste pages get demoted by Google.
2. **Everyone earns from AdSense**, which confirms the model, and they pay for it in weight (25–148
   requests vs our 8). When we add ads: one or two slots, loaded after the tool, so we stay the fastest.
3. **"We don't upload your photo" is not unique.** All four resizers process in the browser too. Our
   differences: officially verified sizes with source links, no tracking or session recording, full Hindi,
   PDF tools (unlock, compress, merge, PDF to JPG) and offline use.
4. **Ideas worth borrowing (our own implementation):**
   - Exam picker inside the tool, to switch exam without leaving the page (ExamDetail).
   - "This exam also takes a live photo" notice at the top of the tool (ExamDetail).
   - Estimated file size shown before download (DocSet).
   - Size in cm or mm as well as pixels on the custom page (OnlineResult).
   - Tip about grey paper shadows next to "Make background white" (OnlineResult).
   - Drag and drop for desktop users (all of them).
5. **Technical SEO:** add BreadcrumbList and WebApplication structured data to every page, and a short
   FAQ section per exam (useful content even though Google rarely shows FAQ rich results now).

## Priority

1. 40–60 more exam pages from verified notices (exam variants first: IBPS PO/Clerk/RRB/SO, SSC
   CGL/CHSL/MTS/GD, RRB NTPC/Group D/ALP, then state PSC and police exams).
2. Exam picker, live-photo notice, estimated size, drag and drop.
3. Structured data and FAQ sections.
4. AdSense with a strict weight budget, once there is steady traffic.
