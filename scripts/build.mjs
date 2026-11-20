#!/usr/bin/env node
// Builds the static site into dist/. No dependencies.
// Usage: SITE_URL=https://example.com/ node scripts/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');
const SITE_URL = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/*$/, '/') : '';

const site = readJson('data/site.json');
const data = readJson('data/exams.json');
const T = data.docTypes;

// Resolve doc kind and labels once.
for (const ex of data.exams) {
  for (const d of ex.docs) {
    if (!T[d.type]) throw new Error(`Unknown doc type "${d.type}" in ${ex.slug}`);
    if (!(d.maxKB > d.minKB)) throw new Error(`Bad KB range in ${ex.slug}/${d.type}`);
    d.kind = T[d.type].kind;
    d.label = { en: T[d.type].en, hi: T[d.type].hi };
  }
}

const VERSION = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(SRC, 'assets/app.js')))
  .update(fs.readFileSync(path.join(SRC, 'assets/style.css')))
  .update(fs.readFileSync(path.join(SRC, 'assets/lang.js')))
  .update(JSON.stringify(data)).update(JSON.stringify(site))
  .digest('hex').slice(0, 10);

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' blob: data:",
  "connect-src 'self'", "worker-src 'self'", "manifest-src 'self'", "object-src 'none'",
  "base-uri 'self'", "form-action 'none'",
].join('; ');

// ------------------------------------------------------------------ helpers
function readJson(p) { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); }
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const h = (en, hi) => `<span class="en">${en}</span><span class="hi" lang="hi">${hi}</span>`;
const hx = (o) => h(esc(o.en), esc(o.hi));
const jsonScript = (id, obj, type = 'application/json') =>
  `<script type="${type}"${id ? ` id="${id}"` : ''}>${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const fmtDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
};
const CHECKED = fmtDate(data.lastChecked);
const kbRange = (d) => `${d.minKB}–${d.maxKB} KB`;
const hasPhoto = (ex) => ex.docs.some((d) => d.kind === 'photo');
const hasScan = (ex) => ex.docs.some((d) => d.kind === 'scan');
const toolNoun = (ex) => hasPhoto(ex)
  ? { en: 'Photo & Signature Resizer', hi: 'फ़ोटो और हस्ताक्षर रिसाइज़र' }
  : { en: 'Signature Resizer', hi: 'हस्ताक्षर रिसाइज़र' };
const toolConfig = (ex) => ({
  slug: ex.slug,
  docs: ex.docs.map((d) => ({
    type: d.type, kind: d.kind, label: d.label, w: d.w, h: d.h, minKB: d.minKB, maxKB: d.maxKB,
    ...(d.dpi ? { dpi: d.dpi } : {}), ...(d.size ? { size: d.size } : {}), ...(d.file ? { file: d.file } : {}),
  })),
});

// ------------------------------------------------------------------ layout
function layout({ title, description, urlPath, depth, body, jsonld }) {
  const root = depth ? '../'.repeat(depth) : './';
  const canonical = SITE_URL ? `<link rel="canonical" href="${SITE_URL}${urlPath}">` : '';
  const ogUrl = SITE_URL ? `<meta property="og:url" content="${SITE_URL}${urlPath}">` : '';
  return `<!doctype html>
<html lang="en" data-root="${root}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${canonical}
<meta name="theme-color" content="${site.themeColor}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${ogUrl}
<link rel="manifest" href="${root}manifest.webmanifest">
<link rel="icon" href="${root}icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${root}icons/icon-192.png">
<link rel="stylesheet" href="${root}assets/style.css?v=${VERSION}">
<script src="${root}assets/lang.js?v=${VERSION}"></script>
${jsonld ? jsonScript(null, jsonld, 'application/ld+json') : ''}
</head>
<body>
<header class="top">
  <a class="brand" href="${root}"><img src="${root}icons/icon.svg" alt="" width="28" height="28">${esc(site.name)}</a>
  <div class="top-actions">
    <button id="install" class="btn small" type="button" hidden>${h('Install app', 'ऐप इंस्टॉल करें')}</button>
    <button id="lang-toggle" class="btn small" type="button" aria-label="Change language / भाषा बदलें">${h('हिंदी', 'English')}</button>
  </div>
</header>
<main>
${body}
</main>
<footer>
  <nav>
    <a href="${root}">${h('All exams', 'सभी परीक्षाएँ')}</a>
    <a href="${root}custom/">${h('Custom size', 'कस्टम साइज़')}</a>
    <a href="${root}privacy/">${h('Privacy', 'गोपनीयता')}</a>
  </nav>
  <p>${h(`${esc(site.name)} is not affiliated with IBPS, SBI, SSC, RRB, UPSC, NTA, CBSE or any government body. Sizes are collected from public sources and were last checked on ${CHECKED}. Always check your official notification before you submit a form.`,
    `${esc(site.name)} का IBPS, SBI, SSC, RRB, UPSC, NTA, CBSE या किसी भी सरकारी संस्था से कोई संबंध नहीं है। साइज़ सार्वजनिक स्रोतों से लिए गए हैं और आख़िरी बार ${CHECKED} को जाँचे गए। फ़ॉर्म जमा करने से पहले अपना आधिकारिक नोटिफ़िकेशन ज़रूर देखें।`)}</p>
</footer>
<script src="${root}assets/app.js?v=${VERSION}" defer></script>
</body>
</html>
`;
}

// ------------------------------------------------------------------ pages
const pages = [];
const docSummary = (ex) => ({
  en: ex.docs.map((d) => d.label.en).join(', '),
  hi: ex.docs.map((d) => d.label.hi).join(', '),
});

// Home
{
  const cats = data.categories.map((c) => {
    const list = data.exams.filter((e) => e.cat === c.id);
    if (!list.length) return '';
    return `<h3>${hx(c)}</h3>
<div class="grid">
${list.map((e) => `  <a class="card" href="exam/${e.slug}/"><strong>${hx(e.name)}</strong>${hx(docSummary(e))}</a>`).join('\n')}
</div>`;
  }).join('\n');
  const body = `
<h1>${hx(site.tagline)}</h1>
<p class="lead">${h('Get your photo, signature, thumb impression and declaration in the exact size and KB that your exam form asks for.',
    'अपनी फ़ोटो, हस्ताक्षर, अँगूठे का निशान और घोषणा ठीक उसी साइज़ और KB में बनाएँ, जो आपका परीक्षा फ़ॉर्म माँगता है।')}</p>
<ul class="badges">
  <li>${h('Free', 'मुफ़्त')}</li>
  <li>${h('Works offline', 'बिना इंटरनेट भी चलता है')}</li>
  <li>${h('Your photo never leaves your phone', 'फ़ोटो आपके फ़ोन से बाहर नहीं जाती')}</li>
</ul>
<h2>${h('Choose your exam', 'अपनी परीक्षा चुनें')}</h2>
${cats}
<h3>${h('Other forms', 'अन्य फ़ॉर्म')}</h3>
<div class="grid">
  <a class="card wide" href="custom/"><strong>${h('Custom size', 'कस्टम साइज़')}</strong>${h('Any width, height and KB limit, for any other form', 'किसी भी दूसरे फ़ॉर्म के लिए कोई भी चौड़ाई, ऊँचाई और KB सीमा')}</a>
</div>
<h2>${h(`Why ${esc(site.name)}`, `${esc(site.name)} क्यों`)}</h2>
<ul class="why">
  <li>${h('<strong>Private:</strong> your photo is processed on your phone and never uploaded.', '<strong>सुरक्षित:</strong> आपकी फ़ोटो आपके फ़ोन पर ही बनती है, कहीं अपलोड नहीं होती।')}</li>
  <li>${h('<strong>Exam presets with sources:</strong> each size links to where it came from, with the date we last checked it.', '<strong>स्रोत के साथ परीक्षा प्रीसेट:</strong> हर साइज़ के साथ उसका स्रोत और आख़िरी जाँच की तारीख़ दी गई है।')}</li>
  <li>${h('<strong>Clean signatures:</strong> one tap turns a grey phone photo of your signature into clean black ink on white.', '<strong>साफ़ हस्ताक्षर:</strong> एक टैप में हस्ताक्षर की धुंधली फ़ोटो सफ़ेद बैकग्राउंड पर साफ़ स्याही में बदलें।')}</li>
  <li>${h('<strong>Exact KB:</strong> the file always lands inside the allowed KB range.', '<strong>सही KB:</strong> फ़ाइल हमेशा तय KB सीमा के अंदर बनती है।')}</li>
</ul>`;
  pages.push({
    urlPath: '', depth: 0,
    html: layout({
      title: `${site.name}: Exam Photo & Signature Resizer (IBPS, SSC, RRB, UPSC, NEET, JEE)`,
      description: 'Free exam form photo and signature resizer for IBPS, SBI, SSC, RRB, UPSC, NEET, JEE, CUET and CTET. Exact pixel size and KB. Works offline. Your photo never leaves your phone.',
      urlPath: '', depth: 0, body,
      jsonld: {
        '@context': 'https://schema.org', '@type': 'WebApplication', name: site.name,
        applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any', inLanguage: ['en', 'hi'],
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
        ...(SITE_URL ? { url: SITE_URL } : {}),
      },
    }),
  });
}

// Exam pages
for (const ex of data.exams) {
  const urlPath = `exam/${ex.slug}/`;
  const noun = toolNoun(ex);
  const rows = ex.docs.map((d) => `<tr><td>${hx(d.label)}</td><td class="nw">${d.w} × ${d.h} px${d.size ? `<br><span class="muted">${esc(d.size)}</span>` : ''}</td><td class="nw">${kbRange(d)}</td><td>JPG${d.dpi ? `, ${d.dpi} DPI` : ''}</td></tr>`).join('\n');
  const tips = hasScan(ex) ? `<li>${h('For signatures and impressions, use plain white paper. Take the photo in daylight from straight above and avoid your phone’s shadow.', 'हस्ताक्षर और निशान के लिए सादा सफ़ेद कागज़ लें। दिन की रोशनी में ठीक ऊपर से फ़ोटो खींचें और फ़ोन की परछाईं से बचें।')}</li>` : '';
  const others = data.exams.filter((e) => e.slug !== ex.slug)
    .map((e) => `<a href="../${e.slug}/">${hx(e.name)}</a>`).join('\n');
  const shortSpec = ex.docs.slice(0, 2).map((d) => `${d.label.en} ${d.minKB}-${d.maxKB} KB`).join(', ');
  const body = `
<nav class="crumbs"><a href="../../">${h('Home', 'होम')}</a> › ${hx(ex.name)}</nav>
<h1>${h(`${esc(ex.name.en)} ${noun.en}`, `${esc(ex.name.hi)} ${noun.hi}`)}</h1>
<p class="lead">${hx(ex.covers)}</p>
<p class="checked">${h(`Last checked ${CHECKED}`, `आख़िरी जाँच ${CHECKED}`)} · <a href="${esc(ex.official)}" target="_blank" rel="noopener">${h('Official website', 'आधिकारिक वेबसाइट')} ↗</a></p>
<div id="tool" class="tool"><p class="muted">${h('Loading the resizer…', 'रिसाइज़र लोड हो रहा है…')}</p></div>
${jsonScript('tool-config', toolConfig(ex))}
<h2>${h(`${esc(ex.name.en)} size rules`, `${esc(ex.name.hi)} साइज़ नियम`)}</h2>
<div class="table-wrap"><table>
<thead><tr><th>${h('Document', 'दस्तावेज़')}</th><th>${h('Pixels', 'पिक्सेल')}</th><th>${h('File size', 'फ़ाइल साइज़')}</th><th>${h('Format', 'फ़ॉर्मेट')}</th></tr></thead>
<tbody>
${rows}
</tbody>
</table></div>
<h2>${h('Important', 'ज़रूरी बातें')}</h2>
<ul class="notes">
${ex.notes.map((n) => `<li>${hx(n)}</li>`).join('\n')}
</ul>
<h2>${h('How to use', 'कैसे इस्तेमाल करें')}</h2>
<ol class="steps">
  <li>${h('Pick the document tab (photo, signature and so on), then choose an image from your gallery or take a new photo.', 'डॉक्यूमेंट टैब (फ़ोटो, हस्ताक्षर आदि) चुनें, फिर गैलरी से इमेज चुनें या नई फ़ोटो खींचें।')}</li>
  <li>${h('Drag and zoom so that your face, signature or impression fills the box. For signatures, keep “Make background white” on.', 'खींचकर और ज़ूम करके अपना चेहरा, हस्ताक्षर या निशान बॉक्स में भरें। हस्ताक्षर के लिए “बैकग्राउंड सफ़ेद करें” चालू रखें।')}</li>
  <li>${h('Tap “Make my file”. Check the green ticks, then download the file and upload it to your form.', '“मेरी फ़ाइल बनाएँ” दबाएँ। हरे टिक देखें, फिर फ़ाइल डाउनलोड करके अपने फ़ॉर्म में अपलोड करें।')}</li>
  ${tips}
</ol>
<section class="sources">
<h2>${h('Sources', 'स्रोत')}</h2>
<p>${h(`Last checked ${CHECKED}. These sizes come from exam-guide sites that summarise the latest notifications. They can change with every new notification, so always confirm them in the official notification on the <a href="${esc(ex.official)}" target="_blank" rel="noopener">official website</a>.`,
    `आख़िरी जाँच ${CHECKED}। ये साइज़ उन एग्ज़ाम-गाइड वेबसाइटों से लिए गए हैं जो नए नोटिफ़िकेशन का सार देती हैं। हर नए नोटिफ़िकेशन के साथ ये बदल सकते हैं, इसलिए <a href="${esc(ex.official)}" target="_blank" rel="noopener">आधिकारिक वेबसाइट</a> पर नोटिफ़िकेशन में ज़रूर पुष्टि करें।`)}</p>
<ul>
${ex.sources.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="nofollow noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, ''))}</a></li>`).join('\n')}
</ul>
</section>
<h2>${h('Other exams', 'अन्य परीक्षाएँ')}</h2>
<div class="other">
${others}
<a href="../../custom/">${h('Custom size', 'कस्टम साइज़')}</a>
</div>`;
  pages.push({
    urlPath, depth: 2,
    html: layout({
      title: `${ex.name.en} ${noun.en} 2026: ${shortSpec} | ${site.name}`,
      description: `Resize your ${ex.name.en} ${ex.docs.map((d) => `${d.label.en.toLowerCase()} (${d.w}×${d.h} px, ${kbRange(d)})`).join(', ')}. Free, works offline, nothing is uploaded. Hindi and English.`,
      urlPath, depth: 2, body,
    }),
  });
}

// Custom size
{
  const cfg = {
    slug: 'custom', custom: true,
    docs: [{ type: 'custom', kind: T.custom.kind, label: { en: T.custom.en, hi: T.custom.hi }, w: 350, h: 450, minKB: 20, maxKB: 50 }],
  };
  const body = `
<nav class="crumbs"><a href="../">${h('Home', 'होम')}</a> › ${h('Custom size', 'कस्टम साइज़')}</nav>
<h1>${h('Custom size photo & signature resizer', 'कस्टम साइज़ फ़ोटो और हस्ताक्षर रिसाइज़र')}</h1>
<p class="lead">${h('Enter the width, height and KB limit from your form’s instructions. Common sizes: passport photo 3.5 × 4.5 cm (350 × 450 px), signature 140 × 60 px.',
    'अपने फ़ॉर्म के निर्देशों से चौड़ाई, ऊँचाई और KB सीमा भरें। आम साइज़: पासपोर्ट फ़ोटो 3.5 × 4.5 सेमी (350 × 450 px), हस्ताक्षर 140 × 60 px।')}</p>
<div id="tool" class="tool"><p class="muted">${h('Loading the resizer…', 'रिसाइज़र लोड हो रहा है…')}</p></div>
${jsonScript('tool-config', cfg)}
<h2>${h('Tips', 'सुझाव')}</h2>
<ul class="notes">
  <li>${h('If the form gives the size in cm, multiply by about 100 to get pixels (3.5 cm ≈ 350 px).', 'अगर फ़ॉर्म में साइज़ सेमी में दिया है, तो लगभग 100 से गुणा करके पिक्सेल निकालें (3.5 सेमी ≈ 350 px)।')}</li>
  <li>${h('Turn on “Make background white” for signatures, thumb impressions and handwritten documents.', 'हस्ताक्षर, अँगूठे के निशान और हाथ से लिखे दस्तावेज़ों के लिए “बैकग्राउंड सफ़ेद करें” चालू करें।')}</li>
  <li>${h('Some state exams ask for your name and date on the photo. Use “Add name and date below the photo”.', 'कुछ राज्य परीक्षाएँ फ़ोटो पर नाम और तारीख़ माँगती हैं। “फ़ोटो के नीचे नाम और तारीख़ जोड़ें” का इस्तेमाल करें।')}</li>
</ul>`;
  pages.push({
    urlPath: 'custom/', depth: 1,
    html: layout({
      title: `Custom Size Photo & Signature Resizer (KB and pixels) | ${site.name}`,
      description: 'Resize any photo or signature to an exact width, height and KB range for any online form. Add name and date, whiten signature backgrounds. Free and private.',
      urlPath: 'custom/', depth: 1, body,
    }),
  });
}

// Privacy
{
  const contact = site.contactEmail
    ? `<p>${h('Contact', 'संपर्क')}: <a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a></p>` : '';
  const body = `
<h1>${h('Privacy', 'गोपनीयता')}</h1>
<p>${h(`${esc(site.name)} resizes your images inside your own browser. Your photos, signatures and documents are never uploaded to any server. After the page has loaded once, it works even with the internet switched off.`,
    `${esc(site.name)} आपकी इमेज आपके अपने ब्राउज़र में ही रिसाइज़ करता है। आपकी फ़ोटो, हस्ताक्षर और दस्तावेज़ किसी सर्वर पर अपलोड नहीं होते। पेज एक बार खुलने के बाद इंटरनेट बंद होने पर भी काम करता है।`)}</p>
<p>${h('There are no accounts and no cookies. The site stores only your language choice in your browser.',
    'कोई अकाउंट नहीं, कोई कुकी नहीं। साइट आपके ब्राउज़र में सिर्फ़ आपकी भाषा की पसंद सेव करती है।')}</p>
<p>${h('The site is hosted on GitHub Pages. Like any web host, GitHub may keep standard server logs such as IP addresses. See the GitHub Privacy Statement for details.',
    'साइट GitHub Pages पर होस्ट है। किसी भी वेब होस्ट की तरह GitHub सामान्य सर्वर लॉग (जैसे IP एड्रेस) रख सकता है। ज़्यादा जानकारी के लिए GitHub की प्राइवेसी स्टेटमेंट देखें।')}</p>
<p>${h('There are currently no ads and no analytics. If that changes, this page will be updated first.',
    'अभी साइट पर कोई विज्ञापन या एनालिटिक्स नहीं है। अगर यह बदलता है, तो पहले यह पेज अपडेट किया जाएगा।')}</p>
${contact}`;
  pages.push({
    urlPath: 'privacy/', depth: 1,
    html: layout({
      title: `Privacy | ${site.name}`,
      description: `${site.name} processes images on your device. Nothing is uploaded.`,
      urlPath: 'privacy/', depth: 1, body,
    }),
  });
}

// ------------------------------------------------------------------ write
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const p of pages) {
  const dir = path.join(OUT, p.urlPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), p.html);
}

// 404: GitHub Pages serves this for any missing path, so links must be absolute.
{
  const base = SITE_URL || '/';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found | ${esc(site.name)}</title><link rel="stylesheet" href="${base}assets/style.css?v=${VERSION}"></head>
<body><main><h1>Page not found</h1><p>This page does not exist. <a href="${base}">Go to all exams</a>.</p>
<p lang="hi">यह पेज मौजूद नहीं है। <a href="${base}">सभी परीक्षाएँ देखें</a>।</p></main></body></html>\n`;
  fs.writeFileSync(path.join(OUT, '404.html'), html);
}

copyDir(path.join(SRC, 'assets'), path.join(OUT, 'assets'));
copyDir(path.join(SRC, 'icons'), path.join(OUT, 'icons'));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify({
  name: `${site.name}: Exam Photo & Signature Resizer`,
  short_name: site.name,
  description: 'Resize photos and signatures for exam forms. Works offline.',
  lang: 'en',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#f6f6f3',
  theme_color: site.themeColor,
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));

const precache = [
  ...pages.map((p) => p.urlPath),
  `assets/style.css?v=${VERSION}`, `assets/lang.js?v=${VERSION}`, `assets/app.js?v=${VERSION}`,
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
];
fs.writeFileSync(path.join(OUT, 'sw.js'), `// Generated by scripts/build.mjs
const VERSION = '${VERSION}';
const PRECACHE = ${JSON.stringify(precache)};
const abs = (u) => new URL(u, self.registration.scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE.map(abs))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const save = (res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  };
  if (req.mode === 'navigate') {
    // pages: network first so new sizes show up, cache when offline
    e.respondWith(fetch(req).then(save).catch(() => caches.match(req).then((r) => r || caches.match(abs('./')))));
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req).then(save)));
});
`);

if (SITE_URL) {
  const urls = pages.map((p) => `  <url><loc>${SITE_URL}${p.urlPath}</loc><lastmod>${data.lastChecked}</lastmod></url>`).join('\n');
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}
fs.writeFileSync(path.join(OUT, 'robots.txt'),
  `User-agent: *\nAllow: /\n${SITE_URL ? `Sitemap: ${SITE_URL}sitemap.xml\n` : ''}`);

console.log(`Built ${pages.length} pages into dist/ (version ${VERSION})${SITE_URL ? ` for ${SITE_URL}` : ''}`);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, f.name), b = path.join(to, f.name);
    if (f.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}
