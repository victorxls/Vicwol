// End-to-end check in headless Chromium: every exam preset must produce a JPG with
// the exact pixel size, a file size inside the KB range, and the DPI it asks for.
// Usage: node scripts/build.mjs && node tests/smoke.cjs [output-dir]
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const DIST = path.join(__dirname, '..', 'dist');
const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'sahisize-'));
fs.mkdirSync(OUT, { recursive: true });
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'exams.json'), 'utf8'));

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL', msg); };

function serve() {
  const types = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain',
  };
  const srv = http.createServer((req, res) => {
    let f = path.join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404, { 'content-type': types['.html'] }); res.end(fs.readFileSync(path.join(DIST, '404.html'))); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// Synthetic but realistic test images: camera noise, uneven lighting, coloured ink.
async function makeImages(page) {
  const urls = await page.evaluate(() => {
    let seed = 42;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
    const noise = (x, w, h, amt) => {
      const id = x.getImageData(0, 0, w, h), d = id.data;
      for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      x.putImageData(id, 0, 0);
    };
    const paper = (x, w, h) => {
      const g = x.createRadialGradient(w * 0.3, h * 0.3, 10, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
      g.addColorStop(0, '#efebe2'); g.addColorStop(1, '#a9a294');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    };
    const out = {};
    { // portrait photo
      const w = 3000, h = 4000, [c, x] = canvas(w, h);
      const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#d5dde7'); g.addColorStop(1, '#9fb0c4');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = '#2b2f4a'; x.beginPath(); x.ellipse(w / 2, h * 0.97, w * 0.5, h * 0.33, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#c68a64'; x.fillRect(w * 0.43, h * 0.5, w * 0.14, h * 0.16);
      x.fillStyle = '#d9a07a'; x.beginPath(); x.ellipse(w / 2, h * 0.4, w * 0.2, h * 0.17, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#1b1410'; x.beginPath(); x.ellipse(w / 2, h * 0.29, w * 0.215, h * 0.1, 0, Math.PI, 0); x.fill();
      x.fillStyle = '#222';
      [0.42, 0.58].forEach((e) => { x.beginPath(); x.ellipse(w * e, h * 0.39, w * 0.025, h * 0.012, 0, 0, Math.PI * 2); x.fill(); });
      x.strokeStyle = '#8a4b3a'; x.lineWidth = 18; x.beginPath(); x.arc(w / 2, h * 0.45, w * 0.06, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke();
      noise(x, w, h, 26);
      out.photo = c.toDataURL('image/jpeg', 0.9);
    }
    { // signature on unevenly lit paper
      const w = 2400, h = 1100, [c, x] = canvas(w, h);
      paper(x, w, h);
      noise(x, w, h, 14);
      x.strokeStyle = '#1d2a6b'; x.lineWidth = 12; x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath(); x.moveTo(380, 700);
      for (let i = 0; i < 9; i++) {
        const bx = 380 + i * 190;
        x.bezierCurveTo(bx + 40, 300 + rnd() * 120, bx + 120, 300 + rnd() * 120, bx + 150, 640 + rnd() * 80);
        x.bezierCurveTo(bx + 160, 760, bx + 180, 720, bx + 190, 690);
      }
      x.stroke();
      x.beginPath(); x.moveTo(360, 820); x.bezierCurveTo(900, 760, 1500, 900, 2100, 780); x.stroke();
      out.signature = c.toDataURL('image/jpeg', 0.9);
    }
    { // thumb impression
      const w = 1600, h = 1600, [c, x] = canvas(w, h);
      paper(x, w, h);
      noise(x, w, h, 14);
      x.strokeStyle = 'rgba(40,46,140,0.85)'; x.lineWidth = 7;
      for (let r = 20; r < 420; r += 15) {
        x.beginPath(); x.ellipse(w / 2 + (rnd() - 0.5) * 6, h / 2, r * 0.72, r, 0.15, 0.1 * rnd(), Math.PI * 2 - 0.3 * rnd()); x.stroke();
      }
      out.thumb = c.toDataURL('image/jpeg', 0.9);
    }
    { // handwritten declaration
      const w = 3000, h = 2000, [c, x] = canvas(w, h);
      paper(x, w, h);
      noise(x, w, h, 14);
      x.fillStyle = '#14183d'; x.font = 'italic 78px serif';
      const lines = ['I, Rahul Kumar, hereby declare that all the', 'information submitted by me in the application', 'form is correct, true and valid. I will present', 'the supporting documents as and when required.', 'Rahul Kumar'];
      lines.forEach((t, i) => x.fillText(t, 220, 400 + i * 260));
      out.declaration = c.toDataURL('image/jpeg', 0.9);
    }
    return out;
  });
  const files = {};
  for (const [k, v] of Object.entries(urls)) {
    files[k] = path.join(OUT, `input-${k}.jpg`);
    fs.writeFileSync(files[k], Buffer.from(v.split(',')[1], 'base64'));
  }
  return files;
}
const inputFor = (files, type) => ({
  photo: files.photo, postcard: files.photo, custom: files.photo, signature: files.signature,
  thumb: files.thumb, fingers: files.thumb, declaration: files.declaration,
}[type]);

async function runDoc(page, files, slug, d, i, multi) {
  if (multi) await page.click(`.tab[data-i="${i}"]`);
  await page.setInputFiles('.f-gallery', inputFor(files, d.type));
  await page.waitForSelector('.s-edit:not([hidden])');
  await page.click('.make');
  await page.waitForSelector('.s-result:not([hidden])', { timeout: 30000 });
  const r = await page.evaluate(async () => {
    const img = document.querySelector('.s-result .out');
    const blob = await (await fetch(img.src)).blob();
    const buf = new Uint8Array(await blob.arrayBuffer());
    const bmp = await createImageBitmap(blob);
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return {
      bytes: blob.size, w: bmp.width, h: bmp.height, head: Array.from(buf.slice(0, 18)), b64: btoa(bin),
      ok: document.querySelector('.s-result').dataset.ok, download: document.querySelector('.download').getAttribute('download'),
    };
  });
  const tag = `${slug}/${d.type}`;
  const kb = (r.bytes / 1024).toFixed(1);
  fs.writeFileSync(path.join(OUT, `out-${slug}-${d.type}.jpg`), Buffer.from(r.b64, 'base64'));
  if (r.w !== d.w || r.h !== d.h) fail(`${tag}: got ${r.w}×${r.h}, want ${d.w}×${d.h}`);
  if (r.bytes < d.minKB * 1024 || r.bytes > d.maxKB * 1000) fail(`${tag}: ${r.bytes} bytes outside ${d.minKB}–${d.maxKB} KB`);
  if (r.head[0] !== 0xFF || r.head[1] !== 0xD8) fail(`${tag}: not a JPEG`);
  if (d.dpi) {
    const dpi = (r.head[14] << 8) | r.head[15];
    if (r.head[13] !== 1 || dpi !== d.dpi) fail(`${tag}: DPI header ${r.head[13]}/${dpi}, want ${d.dpi}`);
  }
  if (r.ok !== 'true') fail(`${tag}: page reported size not ok`);
  console.log(`  ok ${tag}: ${r.w}×${r.h}, ${kb} KB${d.dpi ? `, ${d.dpi} DPI` : ''} -> ${r.download}`);
  await page.click('.again');
}

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();

  // 1) All presets. bypassCSP only so the test can fetch() the blob: URL to inspect it.
  const ctx = await browser.newContext({ ...PHONE, bypassCSP: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  await page.goto('about:blank');
  const files = await makeImages(page);
  for (const ex of data.exams) {
    await page.goto(`${base}exam/${ex.slug}/`);
    console.log(ex.slug);
    for (let i = 0; i < ex.docs.length; i++) await runDoc(page, files, ex.slug, ex.docs[i], i, ex.docs.length > 1);
  }
  await ctx.close();

  // 2) Real CSP, real gestures and options, plus screenshots for a visual check.
  const ctx2 = await browser.newContext(PHONE);
  const p2 = await ctx2.newPage();
  const consoleErrors = [];
  p2.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  p2.on('pageerror', (e) => fail(`page error: ${e.message}`));
  await p2.goto(base);
  await p2.screenshot({ path: path.join(OUT, 'shot-home.png'), fullPage: true });
  await p2.click('#lang-toggle');
  await p2.screenshot({ path: path.join(OUT, 'shot-home-hi.png') });
  await p2.click('#lang-toggle');

  await p2.goto(`${base}exam/ibps/#signature`);
  if (!(await p2.$eval('.tab.active', (t) => t.dataset.i === '1'))) fail('hash #signature did not select the signature tab');
  await p2.setInputFiles('.f-gallery', files.signature);
  await p2.waitForSelector('.s-edit:not([hidden])');
  const box = await p2.$eval('.view', (v) => { const r = v.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await p2.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
  await p2.mouse.down();
  await p2.mouse.move(box.x + box.w / 2 - 30, box.y + box.h / 2 + 10, { steps: 5 });
  await p2.mouse.up();
  await p2.screenshot({ path: path.join(OUT, 'shot-ibps-edit.png'), fullPage: true });
  await p2.click('.make');
  await p2.waitForSelector('.s-result:not([hidden])');
  await p2.screenshot({ path: path.join(OUT, 'shot-ibps-result.png'), fullPage: true });

  await p2.goto(`${base}custom/`);
  await p2.fill('.adjust [name=w]', '300');
  await p2.fill('.adjust [name=h]', '400');
  await p2.dispatchEvent('.adjust [name=h]', 'change');
  await p2.fill('.adjust [name=maxKB]', '40');
  await p2.dispatchEvent('.adjust [name=maxKB]', 'change');
  const spec = await p2.textContent('.spec');
  if (!spec.startsWith('300 × 400 px · 20–40 KB')) fail(`custom spec not applied: "${spec}"`);
  await p2.setInputFiles('.f-gallery', files.photo);
  await p2.waitForSelector('.s-edit:not([hidden])');
  await p2.check('.stamp');
  await p2.fill('.s-name', 'Rahul Kumar');
  await p2.click('.rotate');
  await p2.click('.rotate');
  await p2.click('.rotate');
  await p2.click('.rotate');
  await p2.click('.make');
  await p2.waitForSelector('.s-result:not([hidden])');
  const dims = await p2.$eval('.s-result', (r) => [r.dataset.w, r.dataset.h, r.dataset.bytes, r.dataset.ok]);
  if (dims[0] !== '300' || dims[1] !== '400' || dims[3] !== 'true') fail(`custom result wrong: ${dims}`);
  console.log(`custom with stamp: ${dims[0]}×${dims[1]}, ${(dims[2] / 1024).toFixed(1)} KB`);
  await p2.screenshot({ path: path.join(OUT, 'shot-custom-result.png'), fullPage: true });
  await p2.waitForTimeout(500);
  const swOk = await p2.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
  if (!swOk) fail('service worker not registered');
  if (consoleErrors.length) fail(`console errors: ${consoleErrors.join(' | ')}`);
  await ctx2.close();

  await browser.close();
  srv.close();
  console.log(`\nOutputs and screenshots in ${OUT}`);
  if (failures.length) { console.log(`${failures.length} failure(s)`); process.exit(1); }
  console.log('All checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
