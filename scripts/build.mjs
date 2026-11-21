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
  .update(fs.readFileSync(path.join(SRC, 'assets/pdf.js')))
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
function layout({ title, description, urlPath, depth, body, jsonld, scripts = [] }) {
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
    <a href="${root}compress/20kb/">${h('Compress to KB', 'KB में कंप्रेस')}</a>
    <a href="${root}pdf/compress/">${h('PDF tools', 'PDF टूल')}</a>
    <a href="${root}custom/">${h('Custom size', 'कस्टम साइज़')}</a>
    <a href="${root}privacy/">${h('Privacy', 'गोपनीयता')}</a>
  </nav>
  <p>${h(`${esc(site.name)} is not affiliated with IBPS, SBI, SSC, RRB, UPSC, NTA, CBSE or any government body. Sizes marked “official” were checked against the official notification; the rest come from exam-guide sites. Last checked on ${CHECKED}. Always check your official notification before you submit a form.`,
    `${esc(site.name)} का IBPS, SBI, SSC, RRB, UPSC, NTA, CBSE या किसी भी सरकारी संस्था से कोई संबंध नहीं है। “आधिकारिक” चिह्न वाले साइज़ आधिकारिक नोटिफ़िकेशन से जाँचे गए हैं, बाक़ी एग्ज़ाम-गाइड वेबसाइटों से लिए गए हैं। आख़िरी जाँच ${CHECKED} को। फ़ॉर्म जमा करने से पहले अपना आधिकारिक नोटिफ़िकेशन ज़रूर देखें।`)}</p>
</footer>
<script src="${root}assets/app.js?v=${VERSION}" defer></script>
${scripts.map((s) => `<script src="${root}${s}?v=${VERSION}" defer></script>`).join('\n')}
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
${list.map((e) => `  <a class="card" href="exam/${e.slug}/"><strong>${hx(e.name)}</strong>${hx(docSummary(e))}${e.verified ? `<em class="tick">✓ ${h('Official sizes', 'आधिकारिक साइज़')}</em>` : ''}</a>`).join('\n')}
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
<h2>${h('Photo tools', 'फ़ोटो टूल')}</h2>
<div class="grid">
  <a class="card" href="compress/20kb/"><strong>${h('Compress to KB', 'KB में कंप्रेस करें')}</strong>${h('Photo under 10, 20, 50, 100 KB…', 'फ़ोटो 10, 20, 50, 100 KB से कम…')}</a>
  <a class="card" href="compress/signature-10-20kb/"><strong>${h('Signature 10–20 KB', 'हस्ताक्षर 10–20 KB')}</strong>${h('Clean white background', 'साफ़ सफ़ेद बैकग्राउंड')}</a>
  <a class="card" href="convert/jpg/"><strong>${h('Convert to JPG', 'JPG में बदलें')}</strong>${h('PNG, WebP, screenshots', 'PNG, WebP, स्क्रीनशॉट')}</a>
  <a class="card" href="custom/"><strong>${h('Custom size', 'कस्टम साइज़')}</strong>${h('Any pixels and KB', 'कोई भी पिक्सेल और KB')}</a>
</div>
<h2>${h('PDF tools', 'PDF टूल')}</h2>
<div class="grid">
  <a class="card" href="pdf/compress/"><strong>${h('Compress PDF', 'PDF कंप्रेस करें')}</strong>${h('Under 100, 200, 300 KB…', '100, 200, 300 KB से कम…')}</a>
  <a class="card" href="pdf/"><strong>${h('Image to PDF', 'इमेज से PDF')}</strong>${h('Certificates as one A4 PDF', 'प्रमाण पत्र, एक A4 PDF में')}</a>
  <a class="card" href="pdf/merge/"><strong>${h('Merge PDF', 'PDF जोड़ें')}</strong>${h('PDFs and photos into one', 'PDF और फ़ोटो एक में')}</a>
  <a class="card" href="pdf/unlock/"><strong>${h('Unlock PDF', 'PDF अनलॉक करें')}</strong>${h('Remove e-Aadhaar password', 'ई-आधार पासवर्ड हटाएँ')}</a>
  <a class="card" href="pdf/to-jpg/"><strong>${h('PDF to JPG', 'PDF से JPG')}</strong>${h('Aadhaar or certificate as JPG', 'आधार या प्रमाण पत्र JPG में')}</a>
  <a class="card" href="pdf/organize/"><strong>${h('Organize PDF', 'PDF व्यवस्थित करें')}</strong>${h('Rotate, reorder, delete pages', 'पेज घुमाएँ, क्रम बदलें, हटाएँ')}</a>
</div>
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
  const rows = ex.docs.map((d) => {
    const extra = [d.size ? esc(d.size) : '', d.dpi ? `${d.dpi} DPI` : ''].filter(Boolean).join(' · ');
    return `<tr><td>${hx(d.label)}<br><span class="muted">JPG</span></td><td class="nw">${d.w} × ${d.h} px${extra ? `<br><span class="muted">${extra}</span>` : ''}</td><td class="nw">${kbRange(d)}</td></tr>`;
  }).join('\n');
  const pdfRows = (ex.pdfs || []).map((d) => {
    const kb = d.minKB > 0 ? `${d.minKB}–${d.maxKB} KB` : h(`Up to ${d.maxKB} KB`, `${d.maxKB} KB तक`);
    const link = `../../pdf/?min=${d.minKB}&amp;max=${d.maxKB}&amp;name=${encodeURIComponent(`${ex.slug}-${d.name}`)}`;
    return `<tr><td>${hx(d)}<br><span class="muted">PDF</span> · <a href="${link}">${h('Make PDF', 'PDF बनाएँ')} →</a></td><td class="nw">A4</td><td class="nw">${kb}</td></tr>`;
  }).join('\n');
  const badge = ex.verified
    ? `<p class="verified">✓ ${h('Checked against the official notification:', 'आधिकारिक नोटिफ़िकेशन से जाँचा गया:')} <a href="${esc(ex.verified.url)}" target="_blank" rel="noopener">${esc(ex.verified.title)}</a></p>`
    : `<p class="unverified">⚠ ${h('Not yet checked against the official notification. These sizes come from exam-guide sites, so please confirm them in your notice.', 'अभी आधिकारिक नोटिफ़िकेशन से नहीं जाँचा गया। ये साइज़ एग्ज़ाम-गाइड वेबसाइटों से लिए गए हैं, कृपया अपने नोटिस में पुष्टि करें।')}</p>`;
  const tips = hasScan(ex) ? `<li>${h('For signatures and impressions, use plain white paper. Take the photo in daylight from straight above and avoid your phone’s shadow.', 'हस्ताक्षर और निशान के लिए सादा सफ़ेद कागज़ लें। दिन की रोशनी में ठीक ऊपर से फ़ोटो खींचें और फ़ोन की परछाईं से बचें।')}</li>` : '';
  const others = data.exams.filter((e) => e.slug !== ex.slug)
    .map((e) => `<a href="../${e.slug}/">${hx(e.name)}</a>`).join('\n');
  const shortSpec = ex.docs.slice(0, 2).map((d) => `${d.label.en} ${d.minKB}-${d.maxKB} KB`).join(', ');
  const body = `
<nav class="crumbs"><a href="../../">${h('Home', 'होम')}</a> › ${hx(ex.name)}</nav>
<h1>${h(`${esc(ex.name.en)} ${noun.en}`, `${esc(ex.name.hi)} ${noun.hi}`)}</h1>
<p class="lead">${hx(ex.covers)}</p>
<p class="checked">${h(`Last checked ${CHECKED}`, `आख़िरी जाँच ${CHECKED}`)} · <a href="${esc(ex.official)}" target="_blank" rel="noopener">${h('Official website', 'आधिकारिक वेबसाइट')} ↗</a></p>
${badge}
<div id="tool" class="tool"><p class="muted">${h('Loading the resizer…', 'रिसाइज़र लोड हो रहा है…')}</p></div>
${jsonScript('tool-config', toolConfig(ex))}
<h2>${h(`${esc(ex.name.en)} size rules`, `${esc(ex.name.hi)} साइज़ नियम`)}</h2>
<div class="table-wrap"><table>
<thead><tr><th>${h('Document', 'दस्तावेज़')}</th><th>${h('Size', 'साइज़')}</th><th>${h('File size', 'फ़ाइल साइज़')}</th></tr></thead>
<tbody>
${rows}
${pdfRows}
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
<p>${ex.verified
    ? h(`Last checked ${CHECKED} against the official document listed first below. Sizes can change with every new notification, so check the latest one on the <a href="${esc(ex.official)}" target="_blank" rel="noopener">official website</a>.`,
      `आख़िरी जाँच ${CHECKED} को, नीचे दिए पहले आधिकारिक दस्तावेज़ से। हर नए नोटिफ़िकेशन के साथ साइज़ बदल सकते हैं, इसलिए <a href="${esc(ex.official)}" target="_blank" rel="noopener">आधिकारिक वेबसाइट</a> पर नया नोटिफ़िकेशन ज़रूर देखें।`)
    : h(`Last checked ${CHECKED}. These sizes come from exam-guide sites that summarise the latest notifications. They can change with every new notification, so always confirm them in the official notification on the <a href="${esc(ex.official)}" target="_blank" rel="noopener">official website</a>.`,
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

// Compress-to-KB and PDF pages
buildToolPages();

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
<p>${h('PDF files are read with pdf.js by Mozilla (Apache License 2.0), which also runs inside your browser.',
    'PDF फ़ाइलें Mozilla के pdf.js (Apache License 2.0) से पढ़ी जाती हैं, जो आपके ब्राउज़र के अंदर ही चलता है।')}</p>
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
copyDir(path.join(SRC, 'vendor'), path.join(OUT, 'vendor'));
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
  `assets/style.css?v=${VERSION}`, `assets/lang.js?v=${VERSION}`, `assets/app.js?v=${VERSION}`, `assets/pdf.js?v=${VERSION}`,
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

// ------------------------------------------------------------------ tool pages
function buildToolPages() {
  const examLinks = (up) => data.exams.map((e) => `<a href="${up}exam/${e.slug}/">${hx(e.name)}</a>`).join('\n');
  const COMPRESS = [
    { slug: '10kb', max: 10 }, { slug: '20kb', max: 20 }, { slug: '30kb', max: 30 }, { slug: '50kb', max: 50 },
    { slug: '100kb', max: 100 }, { slug: '200kb', max: 200 }, { slug: '500kb', max: 500 },
    { slug: '20-50kb', min: 20, max: 50 },
    { slug: 'signature-10-20kb', min: 10, max: 20, scan: true },
  ];
  const sideFor = (c) => (c.scan ? 600 : c.max <= 20 ? 700 : c.max <= 50 ? 1000 : c.max <= 200 ? 1500 : 2000);
  const nameOf = (c) => {
    if (c.scan) return { en: `Resize signature to ${c.min}–${c.max} KB`, hi: `हस्ताक्षर को ${c.min}–${c.max} KB में बदलें` };
    if (c.min) return { en: `Resize photo to ${c.min}–${c.max} KB`, hi: `फ़ोटो को ${c.min}–${c.max} KB में बदलें` };
    return { en: `Compress photo to ${c.max} KB`, hi: `फ़ोटो को ${c.max} KB में कंप्रेस करें` };
  };
  const chip = (c) => (c.scan ? h(`Signature ${c.min}–${c.max} KB`, `हस्ताक्षर ${c.min}–${c.max} KB`) : c.min ? `${c.min}–${c.max} KB` : h(`Under ${c.max} KB`, `${c.max} KB से कम`));

  for (const c of COMPRESS) {
    const urlPath = `compress/${c.slug}/`;
    const nm = nameOf(c);
    const cfg = {
      slug: `compress-${c.slug}`,
      docs: [{
        type: c.scan ? 'signature' : 'custom', kind: c.scan ? 'scan' : 'any', free: true, side: sideFor(c),
        label: c.scan ? { en: T.signature.en, hi: T.signature.hi } : { en: T.custom.en, hi: T.custom.hi },
        w: sideFor(c), h: sideFor(c), minKB: c.min || 0, maxKB: c.max, file: c.scan ? `signature-${c.min}-${c.max}kb` : `photo-${c.slug}`,
      }],
    };
    const lead = c.scan
      ? h(`Turn a phone photo of your signature into a clean ${c.min}–${c.max} KB JPG with a white background. Nothing is uploaded.`, `अपने हस्ताक्षर की फ़ोन से खींची फ़ोटो को सफ़ेद बैकग्राउंड वाली साफ़ ${c.min}–${c.max} KB की JPG में बदलें। कुछ भी अपलोड नहीं होता।`)
      : c.min
        ? h(`Make any photo between ${c.min} KB and ${c.max} KB in a few seconds. It keeps its shape, and nothing is uploaded.`, `किसी भी फ़ोटो को कुछ सेकंड में ${c.min} KB से ${c.max} KB के बीच बनाएँ। आकार वही रहता है और कुछ भी अपलोड नहीं होता।`)
        : h(`Make any photo smaller than ${c.max} KB in a few seconds. It keeps its shape; if needed, the pixel size is reduced so it fits. Nothing is uploaded.`, `किसी भी फ़ोटो को कुछ सेकंड में ${c.max} KB से छोटा बनाएँ। आकार वही रहता है; ज़रूरत हो तो पिक्सेल साइज़ कम किया जाता है। कुछ भी अपलोड नहीं होता।`);
    const body = `
<nav class="crumbs"><a href="../../">${h('Home', 'होम')}</a> › ${h('Compress to KB', 'KB में कंप्रेस')}</nav>
<h1>${hx(nm)}</h1>
<p class="lead">${lead}</p>
<div class="other">
${COMPRESS.map((o) => (o === c ? `<a class="current" aria-current="page" href="./">${chip(o)}</a>` : `<a href="../${o.slug}/">${chip(o)}</a>`)).join('\n')}
</div>
<div id="tool" class="tool"><p class="muted">${h('Loading…', 'लोड हो रहा है…')}</p></div>
${jsonScript('tool-config', cfg)}
<h2>${h('How to use', 'कैसे इस्तेमाल करें')}</h2>
<ol class="steps">
  <li>${h('Choose a photo from your gallery or take a new one.', 'गैलरी से फ़ोटो चुनें या नई फ़ोटो खींचें।')}</li>
  <li>${h('Zoom in if you want to cut away the edges.', 'किनारे हटाने हों तो ज़ूम करें।')}</li>
  <li>${h('Tap “Make my file”, then download it.', '“मेरी फ़ाइल बनाएँ” दबाएँ, फिर डाउनलोड करें।')}</li>
</ol>
<h2>${h('Good to know', 'ज़रूरी बातें')}</h2>
<ul class="notes">
  <li>${h('If your form also fixes the pixel size (for example 200 × 230 px), use your exam’s page or the custom size tool instead, so the shape is right too.', 'अगर आपका फ़ॉर्म पिक्सेल साइज़ भी तय करता है (जैसे 200 × 230 px), तो अपनी परीक्षा का पेज या कस्टम साइज़ टूल इस्तेमाल करें, ताकि आकार भी सही रहे।')}</li>
  <li>${h('We count 1 KB as 1000 bytes for the maximum and 1024 bytes for the minimum, so the file passes either way the form counts it.', 'अधिकतम सीमा के लिए हम 1 KB = 1000 बाइट और न्यूनतम के लिए 1024 बाइट मानते हैं, ताकि फ़ॉर्म किसी भी तरह गिने, फ़ाइल सही रहे।')}</li>
  <li>${h('Need a PDF instead? Use <a href="../../pdf/">image to PDF</a>.', 'PDF चाहिए? <a href="../../pdf/">इमेज से PDF</a> इस्तेमाल करें।')}</li>
</ul>
<h2>${h('Exam presets', 'परीक्षा प्रीसेट')}</h2>
<div class="other">
${examLinks('../../')}
</div>`;
    pages.push({
      urlPath, depth: 2,
      html: layout({
        title: c.scan ? `Resize Signature to ${c.min}-${c.max} KB Online (White Background) | ${site.name}`
          : c.min ? `Resize Photo to ${c.min}-${c.max} KB Online, Free | ${site.name}` : `Compress Photo to ${c.max} KB Online, Free | ${site.name}`,
        description: c.scan ? `Resize your signature to ${c.min}-${c.max} KB JPG with a clean white background for any exam form. Free, private, works offline.`
          : `${c.min ? `Resize any photo to ${c.min}-${c.max} KB` : `Compress any photo to under ${c.max} KB`} in seconds. Free, works offline, your photo is never uploaded. Hindi and English.`,
        urlPath, depth: 2, body,
      }),
    });
  }

  // Convert to JPG (any image format the browser can open)
  {
    const cfg = {
      slug: 'convert-jpg',
      docs: [{ type: 'custom', kind: 'any', free: true, side: 4000, label: { en: T.custom.en, hi: T.custom.hi }, w: 4000, h: 4000, minKB: 0, maxKB: 5000, file: 'converted' }],
    };
    const body = `
<nav class="crumbs"><a href="../../">${h('Home', 'होम')}</a> › ${h('Convert to JPG', 'JPG में बदलें')}</nav>
<h1>${h('Convert image to JPG', 'इमेज को JPG में बदलें')}</h1>
<p class="lead">${h('Turn a PNG, WebP or screenshot into a JPG, the format most forms ask for. It keeps its shape and size. Nothing is uploaded.', 'PNG, WebP या स्क्रीनशॉट को JPG में बदलें, जो ज़्यादातर फ़ॉर्म माँगते हैं। आकार और साइज़ वही रहता है। कुछ भी अपलोड नहीं होता।')}</p>
<div id="tool" class="tool"><p class="muted">${h('Loading…', 'लोड हो रहा है…')}</p></div>
${jsonScript('tool-config', cfg)}
<h2>${h('Good to know', 'ज़रूरी बातें')}</h2>
<ul class="notes">
  <li>${h('Transparent areas become white, as forms expect.', 'पारदर्शी हिस्से सफ़ेद हो जाते हैं, जैसा फ़ॉर्म चाहते हैं।')}</li>
  <li>${h('Need a smaller file too? Use <a href="../../compress/50kb/">compress to KB</a>.', 'फ़ाइल छोटी भी करनी है? <a href="../../compress/50kb/">KB में कंप्रेस</a> इस्तेमाल करें।')}</li>
  <li>${h('iPhone HEIC photos: share them as “Most Compatible” or take a screenshot first.', 'iPhone की HEIC फ़ोटो: उन्हें “Most Compatible” में शेयर करें या पहले स्क्रीनशॉट लें।')}</li>
</ul>`;
    pages.push({
      urlPath: 'convert/jpg/', depth: 2,
      html: layout({
        title: `Convert PNG, WebP or Screenshot to JPG Online Free | ${site.name}`,
        description: 'Convert PNG, WebP and screenshots to JPG in your browser. Transparent areas become white. Free, private, works offline.',
        urlPath: 'convert/jpg/', depth: 2, body,
      }),
    });
  }

  // PDF tools: one engine (assets/pdf.js), one page per job
  const onlyImages = h('To make the file small, every page is saved as an image, so text can no longer be selected. That is fine for form uploads.', 'फ़ाइल छोटी करने के लिए हर पेज इमेज के रूप में सेव होता है, इसलिए टेक्स्ट सेलेक्ट नहीं होगा। फ़ॉर्म अपलोड के लिए यह ठीक है।');
  const lockedTip = h('Locked PDF? You will be asked for its password.', 'PDF लॉक है? उसका पासवर्ड पूछा जाएगा।');
  const orderTip = h('Use ↑ to change the order, ↻ to turn a page and ✕ to remove one.', 'क्रम बदलने के लिए ↑, पेज घुमाने के लिए ↻ और हटाने के लिए ✕ दबाएँ।');
  const PDF_TOOLS = [
    {
      slug: '', mode: 'make', nav: h('Image to PDF', 'इमेज से PDF'),
      h1: h('Image to PDF under a KB limit', 'इमेज से PDF, KB सीमा के अंदर'),
      lead: h('Turn photos of your certificates, marksheets or ID into one A4 PDF that fits the form’s limit, for example 50–300 KB for NEET and JEE or up to 500 KB for IBPS. Nothing is uploaded.',
        'अपने प्रमाण पत्र, मार्कशीट या ID की फ़ोटो को एक A4 PDF में बदलें, जो फ़ॉर्म की सीमा में आए, जैसे NEET और JEE के लिए 50–300 KB या IBPS के लिए 500 KB तक। कुछ भी अपलोड नहीं होता।'),
      title: 'JPG to PDF Under 300 KB / 500 KB for Exam Forms',
      desc: 'Convert photos of certificates and marksheets into one A4 PDF under any KB limit (50-300 KB for NEET/JEE, 500 KB for IBPS). Free, private, works offline.',
      steps: [h('Pick the KB limit your form asks for, or type your own.', 'अपने फ़ॉर्म की KB सीमा चुनें या ख़ुद लिखें।'),
        h('Add one image per page. ', 'हर पेज के लिए एक इमेज जोड़ें। ') + orderTip,
        h('Tap “Make PDF”, check the green ticks and download.', '“PDF बनाएँ” दबाएँ, हरे टिक देखें और डाउनलोड करें।')],
      tips: [h('Lay the document flat, take the photo from straight above in daylight, and fill the screen with the page.', 'दस्तावेज़ को सीधा रखें, दिन की रोशनी में ठीक ऊपर से फ़ोटो खींचें और पेज को पूरी स्क्रीन में भरें।'),
        h('Keep “Make background white” on for phone photos. Turn it off for colour documents such as photo ID cards.', 'फ़ोन से खींची फ़ोटो के लिए “बैकग्राउंड सफ़ेद करें” चालू रखें। फ़ोटो वाले ID कार्ड जैसे रंगीन दस्तावेज़ों के लिए इसे बंद करें।'),
        h('If the PDF is too blurry, raise the KB limit if your form allows it, or use fewer pages.', 'अगर PDF बहुत धुंधली है, तो फ़ॉर्म अनुमति दे तो KB सीमा बढ़ाएँ, या कम पेज रखें।')],
    },
    {
      slug: 'compress', mode: 'compress', nav: h('Compress PDF', 'PDF कंप्रेस'),
      h1: h('Compress PDF to any KB size', 'PDF को किसी भी KB साइज़ में कंप्रेस करें'),
      lead: h('Make your certificate, marksheet or ID PDF small enough for the form, for example under 100 KB, 200 KB or 300 KB. Nothing is uploaded.', 'अपने प्रमाण पत्र, मार्कशीट या ID की PDF को फ़ॉर्म के लायक़ छोटा बनाएँ, जैसे 100 KB, 200 KB या 300 KB से कम। कुछ भी अपलोड नहीं होता।'),
      title: 'Compress PDF to 100 KB, 200 KB, 300 KB Online Free',
      desc: 'Compress a PDF to under 100, 200, 300 or 500 KB for exam and job forms. Free, works in your browser, nothing is uploaded. Hindi and English.',
      steps: [h('Choose your PDF.', 'अपनी PDF चुनें।'), h('Pick the KB limit your form asks for.', 'अपने फ़ॉर्म की KB सीमा चुनें।'), h('Tap “Compress PDF” and download it.', '“PDF कंप्रेस करें” दबाएँ और डाउनलोड करें।')],
      tips: [onlyImages, h('If your PDF is already inside the limit, we keep it exactly as it is.', 'अगर आपकी PDF पहले से सीमा के अंदर है, तो हम उसे वैसा ही रखते हैं।'), lockedTip],
    },
    {
      slug: 'merge', mode: 'merge', nav: h('Merge PDF', 'PDF जोड़ें'),
      h1: h('Merge PDFs and images into one PDF', 'PDF और इमेज को एक PDF में जोड़ें'),
      lead: h('Combine certificates, marksheets and photos into one PDF in the order you choose, within the form’s KB limit. Nothing is uploaded.', 'प्रमाण पत्र, मार्कशीट और फ़ोटो को अपनी पसंद के क्रम में एक PDF में जोड़ें, फ़ॉर्म की KB सीमा के अंदर। कुछ भी अपलोड नहीं होता।'),
      title: 'Merge PDF and JPG into One PDF Online Free',
      desc: 'Merge several PDFs and photos into one PDF under your KB limit. Reorder and rotate pages. Free, private, works offline.',
      steps: [h('Add your PDFs and images. You can add more files at any time.', 'अपनी PDF और इमेज जोड़ें। आप कभी भी और फ़ाइलें जोड़ सकते हैं।'), orderTip, h('Pick the KB limit, tap “Merge into one PDF” and download.', 'KB सीमा चुनें, “एक PDF में जोड़ें” दबाएँ और डाउनलोड करें।')],
      tips: [onlyImages, h('Up to 30 pages in total.', 'कुल 30 पेज तक।'), lockedTip],
    },
    {
      slug: 'unlock', mode: 'unlock', nav: h('Unlock PDF', 'PDF अनलॉक'),
      h1: h('Unlock PDF: remove the password (e-Aadhaar too)', 'PDF अनलॉक करें: पासवर्ड हटाएँ (ई-आधार भी)'),
      lead: h('Open a password-protected PDF with its password and save a copy without the password, sized for your form. You must know the password; this tool does not guess it.', 'पासवर्ड वाली PDF को उसके पासवर्ड से खोलें और बिना पासवर्ड की कॉपी सेव करें, फ़ॉर्म के साइज़ में। आपको पासवर्ड पता होना चाहिए; यह टूल पासवर्ड का अनुमान नहीं लगाता।'),
      title: 'Unlock PDF: Remove e-Aadhaar PDF Password Online',
      desc: 'Remove the password from your own PDF, such as e-Aadhaar, and save it under a KB limit for forms. The file and password never leave your phone.',
      steps: [h('Choose the locked PDF and type its password.', 'लॉक PDF चुनें और उसका पासवर्ड डालें।'), h('Pick a KB limit if your form has one.', 'अगर फ़ॉर्म में KB सीमा है तो उसे चुनें।'), h('Tap “Save unlocked PDF” and download.', '“अनलॉक PDF सेव करें” दबाएँ और डाउनलोड करें।')],
      tips: [h('e-Aadhaar password: the first four letters of your name in capital letters, then your year of birth. Example: RAHU1990.', 'ई-आधार पासवर्ड: आपके नाम के पहले चार अक्षर कैपिटल में, फिर जन्म का साल। उदाहरण: RAHU1990।'),
        h('Your file and password stay on your phone. Nothing is uploaded.', 'आपकी फ़ाइल और पासवर्ड आपके फ़ोन पर ही रहते हैं। कुछ भी अपलोड नहीं होता।'),
        h('Need a JPG of your Aadhaar instead? Use <a href="../to-jpg/">PDF to JPG</a>.', 'आधार की JPG चाहिए? <a href="../to-jpg/">PDF से JPG</a> इस्तेमाल करें।')],
    },
    {
      slug: 'organize', mode: 'organize', nav: h('Organize PDF', 'PDF व्यवस्थित करें'),
      h1: h('Rotate, reorder or delete PDF pages', 'PDF के पेज घुमाएँ, क्रम बदलें या हटाएँ'),
      lead: h('Fix sideways pages, put pages in the right order, or remove pages you don’t need, then save the PDF. To take out a few pages, delete the rest.', 'टेढ़े पेज सीधे करें, पेज सही क्रम में लगाएँ या बेकार पेज हटाएँ, फिर PDF सेव करें। कुछ पेज अलग निकालने हों तो बाक़ी पेज हटा दें।'),
      title: 'Rotate PDF, Reorder or Delete PDF Pages Online Free',
      desc: 'Rotate, reorder, delete or extract PDF pages in your browser and save the result. Free, private, works offline.',
      steps: [h('Choose your PDF.', 'अपनी PDF चुनें।'), orderTip, h('Tap “Save PDF” and download.', '“PDF सेव करें” दबाएँ और डाउनलोड करें।')],
      tips: [onlyImages, lockedTip],
    },
    {
      slug: 'to-jpg', mode: 'tojpg', nav: h('PDF to JPG', 'PDF से JPG'),
      h1: h('PDF to JPG under a KB limit', 'PDF से JPG, KB सीमा के अंदर'),
      lead: h('Turn a PDF page, such as your Aadhaar or a certificate, into a JPG of the right size, for example 10–200 KB for the NEET and JEE identity proof. Nothing is uploaded.', 'PDF के पेज, जैसे आधार या प्रमाण पत्र, को सही साइज़ की JPG में बदलें, जैसे NEET और JEE पहचान पत्र के लिए 10–200 KB। कुछ भी अपलोड नहीं होता।'),
      title: 'PDF to JPG Under 200 KB / 100 KB / 50 KB Online Free',
      desc: 'Convert PDF pages, such as e-Aadhaar or certificates, to JPG under any KB limit for exam forms. Free, private, works offline.',
      steps: [h('Choose your PDF. Remove the pages you don’t need with ✕.', 'अपनी PDF चुनें। जिन पेज की ज़रूरत नहीं, उन्हें ✕ से हटाएँ।'), h('Pick the KB limit for each JPG.', 'हर JPG के लिए KB सीमा चुनें।'), h('Tap “Convert to JPG” and download each page.', '“JPG में बदलें” दबाएँ और हर पेज डाउनलोड करें।')],
      tips: [lockedTip, h('Each page becomes its own JPG file.', 'हर पेज अलग JPG फ़ाइल बनता है।')],
    },
  ];
  for (const t of PDF_TOOLS) {
    const urlPath = t.slug ? `pdf/${t.slug}/` : 'pdf/';
    const depth = t.slug ? 2 : 1;
    const up = '../'.repeat(depth);
    const pdfRoot = t.slug ? '../' : './';
    const nav = PDF_TOOLS.map((o) => (o === t
      ? `<a class="current" aria-current="page" href="./">${o.nav}</a>`
      : `<a href="${pdfRoot}${o.slug ? `${o.slug}/` : ''}">${o.nav}</a>`)).join('\n');
    const body = `
<nav class="crumbs"><a href="${up}">${h('Home', 'होम')}</a> › ${h('PDF tools', 'PDF टूल')}</nav>
<h1>${t.h1}</h1>
<p class="lead">${t.lead}</p>
<div class="other">
${nav}
</div>
<div id="pdftool" class="tool"><p class="muted">${h('Loading…', 'लोड हो रहा है…')}</p></div>
${jsonScript('pdf-config', { mode: t.mode })}
<h2>${h('How to use', 'कैसे इस्तेमाल करें')}</h2>
<ol class="steps">
${t.steps.map((x) => `  <li>${x}</li>`).join('\n')}
</ol>
<h2>${h('Good to know', 'ज़रूरी बातें')}</h2>
<ul class="notes">
${t.tips.map((x) => `  <li>${x}</li>`).join('\n')}
</ul>
<h2>${h('Exam presets', 'परीक्षा प्रीसेट')}</h2>
<div class="other">
${examLinks(up)}
</div>`;
    pages.push({
      urlPath, depth,
      html: layout({ title: `${t.title} | ${site.name}`, description: t.desc, urlPath, depth, body, scripts: ['assets/pdf.js'] }),
    });
  }
}
