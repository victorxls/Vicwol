// End-to-end check in headless Chromium: every exam preset must produce a JPG with
// the exact pixel size, a file size inside the KB range, and the DPI it asks for.
// Usage: node scripts/build.mjs && node tests/smoke.cjs [output-dir]
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const DIST = path.join(__dirname, '..', 'dist');
const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'sahisize-'));
fs.mkdirSync(OUT, { recursive: true });
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'exams.json'), 'utf8'));

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const failures = [];
const TEXT_PDF = path.join(OUT, 'input-text.pdf');
const LOCKED_PDF = path.join(OUT, 'input-locked.pdf');
const PNG_IN = path.join(OUT, 'input-transparent.png');
const fail = (msg) => { failures.push(msg); console.log('  FAIL', msg); };

function serve() {
  const types = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.mjs': 'text/javascript', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain',
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

  // Compress-to-KB pages keep the image's shape and land under the limit.
  for (const [slug, min, max, input] of [['10kb', 0, 10, 'photo'], ['20kb', 0, 20, 'photo'], ['500kb', 0, 500, 'photo'], ['20-50kb', 20, 50, 'photo'], ['signature-10-20kb', 10, 20, 'signature']]) {
    await page.goto(`${base}compress/${slug}/`);
    await page.setInputFiles('.f-gallery', files[input]);
    await page.waitForSelector('.s-edit:not([hidden])');
    await page.click('.make');
    await page.waitForSelector('.s-result:not([hidden])', { timeout: 60000 });
    const r = await page.evaluate(async () => {
      const blob = await (await fetch(document.querySelector('.s-result .out').src)).blob();
      const bmp = await createImageBitmap(blob);
      return { bytes: blob.size, w: bmp.width, h: bmp.height, name: document.querySelector('.download').getAttribute('download') };
    });
    const inAspect = input === 'photo' ? 3000 / 4000 : 2400 / 1100;
    const tag = `compress/${slug}`;
    if (r.bytes > max * 1000 || r.bytes < min * 1024) fail(`${tag}: ${r.bytes} bytes outside ${min}–${max} KB`);
    if (Math.abs(r.w / r.h - inAspect) > 0.02) fail(`${tag}: aspect ${r.w}×${r.h} does not match input`);
    console.log(`  ok ${tag}: ${r.w}×${r.h}, ${(r.bytes / 1024).toFixed(1)} KB -> ${r.name}`);
  }

  // Image to PDF: size range, page count, A4 pages, valid file (checked with pypdf when available).
  const pdfCases = [
    { q: '?min=50&max=300&name=class-10', inputs: ['declaration', 'thumb'], min: 50, max: 300 },
    { q: '', chip: 1, inputs: ['declaration', 'photo', 'signature'], min: 0, max: 500 },
    { q: '?min=0&max=100', inputs: ['declaration', 'photo', 'signature', 'thumb', 'declaration'], min: 0, max: 100 },
  ];
  for (const pc of pdfCases) {
    await page.goto(`${base}pdf/${pc.q}`);
    if (pc.chip != null) await page.click(`.chips .tab[data-p="${pc.chip}"]`);
    await page.setInputFiles('.f-gallery', pc.inputs.map((k) => files[k]));
    await page.waitForFunction((n) => document.querySelectorAll('.pages .page').length === n, pc.inputs.length);
    await page.click('.make');
    await page.waitForSelector('#pdftool .s-result:not([hidden])', { timeout: 120000 });
    const r = await page.evaluate(async () => {
      const a = document.querySelector('#pdftool .download');
      const buf = new Uint8Array(await (await (await fetch(a.href)).blob()).arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { bytes: buf.length, b64: btoa(bin), name: a.getAttribute('download'), pages: document.querySelector('#pdftool .s-result').dataset.pages };
    });
    const tag = `pdf ${pc.min}-${pc.max}KB x${pc.inputs.length}`;
    const file = path.join(OUT, `out-${r.name}`);
    fs.writeFileSync(file, Buffer.from(r.b64, 'base64'));
    if (r.bytes > pc.max * 1000 || r.bytes < pc.min * 1024) fail(`${tag}: ${r.bytes} bytes outside range`);
    if (Number(r.pages) !== pc.inputs.length) fail(`${tag}: ${r.pages} pages`);
    let check = 'not checked';
    try {
      check = execFileSync('python3', ['-I', '-c', [
        'import sys, pypdf',
        'r = pypdf.PdfReader(sys.argv[1], strict=True)',
        'sizes = {(round(float(p.mediabox.width)), round(float(p.mediabox.height))) for p in r.pages}',
        'print(len(r.pages), sorted(sizes))',
      ].join('\n'), file], { encoding: 'utf8' }).trim();
      if (!check.startsWith(`${pc.inputs.length} `)) fail(`${tag}: pypdf says ${check}`);
    } catch (e) { fail(`${tag}: pypdf could not read the PDF: ${e.message.split('\n').slice(-2).join(' ')}`); }
    console.log(`  ok ${tag}: ${(r.bytes / 1024).toFixed(1)} KB, pypdf: ${check} -> ${r.name}`);
  }

  // ---- PDF tools (pdf.js): compress, merge, unlock, organize, to JPG, plus convert to JPG
  {
    const tp = await ctx.newPage();
    const para = 'This certifies that the candidate has passed the Secondary School Examination with distinction. '.repeat(12);
    await tp.setContent(`<html><body style="font:15px serif;padding:20px"><h1>Class X Marksheet</h1><p>${para}</p><div style="break-after:page"></div><h1>Page two</h1><p>${para}</p></body></html>`);
    await tp.pdf({ path: TEXT_PDF, format: 'A4' });
    await tp.evaluate(() => {});
    const png = await tp.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 800; c.height = 600;
      const x = c.getContext('2d'); x.fillStyle = '#d33'; x.beginPath(); x.arc(400, 300, 200, 0, Math.PI * 2); x.fill();
      return c.toDataURL('image/png');
    });
    fs.writeFileSync(PNG_IN, Buffer.from(png.split(',')[1], 'base64'));
    await tp.close();
    execFileSync('python3', ['-I', '-c', 'import sys, pypdf\nr = pypdf.PdfReader(sys.argv[1]); w = pypdf.PdfWriter(); w.append(r)\nw.encrypt(user_password="RAHU1990", owner_password="owner-x", algorithm="RC4-128"); w.write(sys.argv[2])', TEXT_PDF, LOCKED_PDF]);
  }
  const IMG_PDF = path.join(OUT, 'out-class-10.pdf');
  const pypdfInfo = (file) => execFileSync('python3', ['-I', '-c', [
    'import sys, pypdf', 'r = pypdf.PdfReader(sys.argv[1], strict=True)',
    'print(len(r.pages), r.is_encrypted, " ".join(f"{round(float(p.mediabox.width))}x{round(float(p.mediabox.height))}" for p in r.pages))',
  ].join('\n'), file], { encoding: 'utf8' }).trim();
  async function savePdfResult(name) {
    const r = await page.evaluate(async () => {
      const a = document.querySelector('#pdftool .download');
      const buf = new Uint8Array(await (await (await fetch(a.href)).blob()).arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { b64: btoa(bin), ...document.querySelector('#pdftool .s-result').dataset };
    });
    const file = path.join(OUT, `out-tool-${name}.pdf`);
    fs.writeFileSync(file, Buffer.from(r.b64, 'base64'));
    return { ...r, file, info: pypdfInfo(file) };
  }
  const waitPages = (n) => page.waitForFunction((k) => document.querySelectorAll('#pdftool .pages .page').length === k, n, { timeout: 60000 });
  const makeAndWait = async () => { await page.click('#pdftool .make'); await page.waitForSelector('#pdftool .s-result:not([hidden])', { timeout: 120000 }); };

  // compress: image-heavy PDF down to 100 KB
  await page.goto(`${base}pdf/compress/`);
  await page.setInputFiles('#pdftool .f-gallery', IMG_PDF);
  await waitPages(2);
  await page.click('#pdftool .chips .tab[data-p="2"]');
  await makeAndWait();
  let r = await savePdfResult('compress');
  if (Number(r.bytes) > 100 * 1000 || r.kept !== 'false' || !r.info.startsWith('2 False')) fail(`pdf/compress: ${r.bytes} bytes kept=${r.kept} pypdf=${r.info}`);
  console.log(`  ok pdf/compress: ${fs.statSync(IMG_PDF).size} -> ${r.bytes} bytes, pypdf: ${r.info}`);
  // compress: a small PDF that already fits is kept unchanged
  await page.goto(`${base}pdf/compress/`);
  await page.setInputFiles('#pdftool .f-gallery', TEXT_PDF);
  await waitPages(2);
  await page.click('#pdftool .chips .tab[data-p="1"]');
  await makeAndWait();
  r = await savePdfResult('compress-kept');
  if (r.kept !== 'true' || Number(r.bytes) !== fs.statSync(TEXT_PDF).size) fail(`pdf/compress kept: kept=${r.kept} bytes=${r.bytes}`);
  console.log(`  ok pdf/compress keeps a PDF that already fits (${r.bytes} bytes)`);

  // merge: text PDF + image PDF + photo
  await page.goto(`${base}pdf/merge/`);
  await page.setInputFiles('#pdftool .f-gallery', [TEXT_PDF, IMG_PDF, files.photo]);
  await waitPages(5);
  await makeAndWait();
  r = await savePdfResult('merge');
  if (!r.info.startsWith('5 False') || Number(r.bytes) > 1000 * 1000) fail(`pdf/merge: ${r.bytes} bytes pypdf=${r.info}`);
  console.log(`  ok pdf/merge: ${r.bytes} bytes, pypdf: ${r.info}`);

  // unlock: wrong password first, then the right one
  await page.goto(`${base}pdf/unlock/`);
  await page.setInputFiles('#pdftool .f-gallery', LOCKED_PDF);
  await page.waitForSelector('#pdftool .pw-box:not([hidden])');
  await page.fill('#pdftool .pw', 'WRONG123');
  await page.click('#pdftool .pw-ok');
  await page.waitForFunction(() => /Wrong password/.test(document.querySelector('#pdftool .pw-msg').textContent) && !document.querySelector('#pdftool .pw-box').hidden);
  await page.fill('#pdftool .pw', 'RAHU1990');
  await page.click('#pdftool .pw-ok');
  await waitPages(2);
  await makeAndWait();
  r = await savePdfResult('unlock');
  if (!r.info.startsWith('2 False')) fail(`pdf/unlock: output still locked or wrong pages: ${r.info}`);
  console.log(`  ok pdf/unlock: wrong password rejected, unlocked copy ${r.bytes} bytes, pypdf: ${r.info}`);

  // organize: delete page 1, rotate the other
  await page.goto(`${base}pdf/organize/`);
  await page.setInputFiles('#pdftool .f-gallery', TEXT_PDF);
  await waitPages(2);
  await page.click('#pdftool .pages .page:nth-child(1) [data-act="del"]');
  await waitPages(1);
  await page.click('#pdftool .pages .page:nth-child(1) [data-act="rot"]');
  await makeAndWait();
  r = await savePdfResult('organize');
  const odims = (r.info.split(' ')[2] || '0x0').split('x').map(Number);
  if (!r.info.startsWith('1 False') || !(odims[0] > odims[1])) fail(`pdf/organize: ${r.info}`);
  console.log(`  ok pdf/organize: delete + rotate -> pypdf: ${r.info}`);

  // PDF to JPG: each page 10–200 KB
  await page.goto(`${base}pdf/to-jpg/`);
  await page.setInputFiles('#pdftool .f-gallery', TEXT_PDF);
  await waitPages(2);
  await makeAndWait();
  const jpgs = await page.evaluate(async () => Promise.all([...document.querySelectorAll('#pdftool .jpgs li')].map(async (li) => {
    const blob = await (await fetch(li.querySelector('img').src)).blob();
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    return { bytes: blob.size, w: li.dataset.w, h: li.dataset.h, jpeg: head[0] === 0xFF && head[1] === 0xD8, name: li.querySelector('a').getAttribute('download') };
  })));
  if (jpgs.length !== 2 || jpgs.some((j) => !j.jpeg || j.bytes < 10 * 1024 || j.bytes > 200 * 1000)) fail(`pdf/to-jpg: ${JSON.stringify(jpgs)}`);
  console.log(`  ok pdf/to-jpg: ${jpgs.map((j) => `${j.name} ${j.w}×${j.h} ${(j.bytes / 1024).toFixed(1)} KB`).join(', ')}`);

  // Convert PNG (with transparency) to JPG: shape kept, transparent corner becomes white
  await page.goto(`${base}convert/jpg/`);
  await page.setInputFiles('.f-gallery', PNG_IN);
  await page.waitForSelector('.s-edit:not([hidden])');
  await page.click('.make');
  await page.waitForSelector('.s-result:not([hidden])');
  const cj = await page.evaluate(async () => {
    const blob = await (await fetch(document.querySelector('.s-result .out').src)).blob();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
    return { type: blob.type, w: bmp.width, h: bmp.height, corner: Array.from(x.getImageData(2, 2, 1, 1).data.slice(0, 3)) };
  });
  if (cj.type !== 'image/jpeg' || cj.w !== 800 || cj.h !== 600 || cj.corner.some((v) => v < 245)) fail(`convert/jpg: ${JSON.stringify(cj)}`);
  console.log(`  ok convert/jpg: PNG -> JPG ${cj.w}×${cj.h}, corner ${cj.corner}`);
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
  // pdf.js under the real security policy (no eval, module worker, same-origin fonts)
  await p2.goto(`${base}pdf/unlock/`);
  await p2.setInputFiles('#pdftool .f-gallery', LOCKED_PDF);
  await p2.waitForSelector('#pdftool .pw-box:not([hidden])');
  await p2.fill('#pdftool .pw', 'RAHU1990');
  await p2.click('#pdftool .pw-ok');
  await p2.waitForFunction(() => document.querySelectorAll('#pdftool .pages .page').length === 2, null, { timeout: 60000 });
  await p2.click('#pdftool .make');
  await p2.waitForSelector('#pdftool .s-result:not([hidden])', { timeout: 120000 });
  await p2.screenshot({ path: path.join(OUT, 'shot-unlock.png'), fullPage: true });
  console.log('unlock under real CSP: ok');
  // ---- borrowed ideas: exam picker, live notice, estimate, cm units, drag-drop, paste
  await p2.goto(`${base}exam/ibps/#signature`);
  if (!(await p2.isVisible('.live-note'))) fail('IBPS live-photo notice missing');
  await p2.selectOption('.exam-select', 'sbi');
  await p2.waitForURL(/exam\/sbi\/#signature$/);
  await p2.waitForSelector('.tab.active');
  if ((await p2.$eval('.tab.active', (t) => t.dataset.i)) !== '1') fail('exam picker did not keep the signature tab');
  console.log('exam picker: IBPS -> SBI kept #signature');
  await p2.goto(`${base}exam/ssc/`);
  if (!/don’t upload a photo/.test(await p2.textContent('.live-note'))) fail('SSC live-only notice missing');
  await p2.goto(`${base}exam/ibps/`);
  await p2.setInputFiles('.f-gallery', files.photo);
  await p2.waitForSelector('.s-edit:not([hidden])');
  await p2.waitForFunction(() => /Expected file:.*200 × 230 px/.test(document.querySelector('.estimate').textContent), null, { timeout: 15000 });
  console.log('estimate:', (await p2.textContent('.estimate')).replace(/\s+/g, ' ').trim().slice(0, 70));
  // cm units on the custom page: 3.5 × 4.5 cm at 200 DPI = 276 × 354 px
  await p2.goto(`${base}custom/`);
  await p2.check('.adjust [name=unit][value=cm]');
  await p2.fill('.adjust [name=w]', '3.5');
  await p2.fill('.adjust [name=h]', '4.5');
  await p2.dispatchEvent('.adjust [name=h]', 'change');
  const cmSpec = await p2.textContent('.spec');
  if (!/^276 × 354 px .*3\.5 × 4\.5 cm.*200 DPI/.test(cmSpec)) fail(`cm units not applied: "${cmSpec}"`);
  console.log('cm units:', cmSpec);
  // drag and drop a generated image onto the tool
  await p2.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 800;
    const x = c.getContext('2d'); x.fillStyle = '#9ab'; x.fillRect(0, 0, 600, 800); x.fillStyle = '#c96'; x.beginPath(); x.arc(300, 320, 150, 0, 7); x.fill();
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'drop.jpg', { type: 'image/jpeg' }));
    const tool = document.getElementById('tool');
    tool.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    tool.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await p2.waitForSelector('.s-edit:not([hidden])', { timeout: 10000 });
  await p2.click('.make');
  await p2.waitForSelector('.s-result:not([hidden])');
  const cmRes = await p2.$eval('.s-result', (r) => [r.dataset.w, r.dataset.h, r.dataset.ok]);
  if (cmRes.join() !== '276,354,true') fail(`drop + cm result wrong: ${cmRes}`);
  console.log('drag-and-drop + cm size result:', cmRes.join(' '));
  // paste an image into the image-to-PDF tool
  await p2.goto(`${base}pdf/merge/`);
  await p2.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 300;
    c.getContext('2d').fillRect(10, 10, 100, 100);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'paste.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await p2.waitForFunction(() => document.querySelectorAll('#pdftool .pages .page').length === 1, null, { timeout: 15000 });
  console.log('paste into PDF tool: 1 page added');
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
