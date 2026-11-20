# SahiSize: exam photo & signature resizer

A free, mobile-first website that makes photos, signatures, thumb impressions and handwritten
declarations the exact pixel size and KB range that Indian exam forms ask for (IBPS, SBI, SSC,
RRB, UPSC, NEET, JEE, CUET, CTET, or any custom size).

- **Private:** images are processed in the browser and never uploaded. The page's Content
  Security Policy blocks it from sending data anywhere.
- **Exact KB:** finds the highest JPEG quality under the maximum and pads up to the minimum.
  Limits are met under both "1 KB = 1000 bytes" and "1 KB = 1024 bytes".
- **Clean signatures:** evens out phone-camera lighting and turns paper white.
- **Hindi + English**, works offline (PWA), installable on Android.

See [docs/PLAN.md](docs/PLAN.md) for the roadmap and money plan.

## Project layout

| Path | What it is |
|---|---|
| `data/exams.json` | Exam presets: sizes, KB limits, notes (en/hi), official links, sources |
| `data/site.json` | Site name, tagline, contact email |
| `src/assets/app.js` | The resizer: crop/zoom, background whitening, JPEG encoding to a KB range |
| `src/assets/style.css` | Styles (light and dark) |
| `src/assets/pdf.js` | Images to an A4 PDF under a KB limit (hand-written PDF, no library) |
| `src/assets/lang.js` | Picks Hindi or English before the page paints |
| `src/icons/` | App icon (SVG source + PNGs from `scripts/make-icons.cjs`) |
| `scripts/build.mjs` | Generates every page into `dist/` (no dependencies) |
| `tests/smoke.cjs` | Headless-browser test of every preset |

## Build and test

```sh
node scripts/build.mjs                    # writes dist/
node tests/smoke.cjs /path/to/output-dir  # needs Playwright + Chromium
```

To preview locally, serve `dist/` with any static server, for example `python3 -m http.server -d dist`.

## Updating an exam

Edit its entry in `data/exams.json`, then update `lastChecked` at the top of the file. Each
document needs `type`, `w`, `h`, `minKB` and `maxKB`; `dpi`, `size` (the printed size, e.g.
"3.5 × 4.5 cm") and `file` (download file name) are optional. `pdfs` lists PDF uploads (they link
to the PDF tool with the limits filled in). Set `verified` (`date`, `title`, `url`) only after
checking the official notification; the page then shows a green "checked" badge. When sources disagree on a limit,
use the range that satisfies all of them and say so in `notes`. Add the notification or source
URL to `sources`.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`.
One-time setup:

1. GitHub Pages on a **private** repository needs a paid GitHub plan. Either make the repository
   public (Settings → General → Danger Zone → Change visibility) or use Cloudflare Pages (below).
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Push to `main` (or run the workflow from the Actions tab).

**Cloudflare Pages (works with a private repo, free):** create a Pages project connected to this
repository with build command `node scripts/build.mjs`, output directory `dist`, and an
environment variable `SITE_URL` set to the site's address.
