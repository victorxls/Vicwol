/*
 * SahiSize – PDF tools: image to PDF, compress, merge, unlock, organize, PDF to JPG.
 * Everything runs in the browser. PDFs are read with pdf.js (Mozilla, Apache-2.0), loaded
 * only when needed. Output PDFs are written by hand (one JPEG per page), so every page can
 * be squeezed into a KB limit. Nothing is uploaded.
 */
(() => {
  'use strict';
  const X = window.SahiSize;
  const el = document.getElementById('pdftool');
  if (!X || !el) return;
  const { h, decodeToCanvas, whiten, drawScaled, rotate90, makeCanvas, toJpeg, byteLimits, fmtNum, nextFrame, encodeJpeg } = X;

  const ROOT = document.documentElement.dataset.root || './';
  const abs = (p) => new URL(ROOT + p, document.baseURI).href;
  const cfgEl = document.getElementById('pdf-config');
  const MODE = (cfgEl ? JSON.parse(cfgEl.textContent).mode : null) || 'make';
  const TO_JPG = MODE === 'tojpg';
  const MAX_PAGES = 30;
  const A4 = { w: 595.28, h: 841.89 }; // points
  const BOX = { w: 1240, h: 1754 }; // A4 at 150 DPI, the starting resolution

  const PDF_PRESETS = [
    { min: 50, max: 300, label: h('50–300 KB (NEET, JEE, CUET)', '50–300 KB (NEET, JEE, CUET)') },
    { min: 0, max: 500, label: h('Up to 500 KB (IBPS, SBI)', '500 KB तक (IBPS, SBI)') },
    { min: 0, max: 100, label: h('Up to 100 KB', '100 KB तक') },
    { min: 0, max: 200, label: h('Up to 200 KB', '200 KB तक') },
    { min: 0, max: 1000, label: h('Up to 1 MB', '1 MB तक') },
  ];
  const JPG_PRESETS = [
    { min: 10, max: 200, label: h('10–200 KB (NEET, JEE ID proof)', '10–200 KB (NEET, JEE पहचान पत्र)') },
    { min: 0, max: 50, label: h('Up to 50 KB', '50 KB तक') },
    { min: 0, max: 100, label: h('Up to 100 KB', '100 KB तक') },
    { min: 0, max: 500, label: h('Up to 500 KB', '500 KB तक') },
  ];
  const PRESETS = TO_JPG ? JPG_PRESETS : PDF_PRESETS;
  // [min KB, max KB, A4 pages, clean background]
  const DEFAULTS = {
    make: [50, 300, true, true], compress: [0, 200, false, false], merge: [0, 1000, true, false],
    unlock: [0, 300, false, false], organize: [0, 2000, false, false], tojpg: [10, 200, false, false],
  };
  const STEP1 = {
    make: h('1. Add pages (one image = one page)', '1. पेज जोड़ें (एक इमेज = एक पेज)'),
    compress: h('1. Choose your PDF', '1. अपनी PDF चुनें'),
    merge: h('1. Add PDFs and images in the order you want', '1. PDF और इमेज उसी क्रम में जोड़ें जैसा आप चाहते हैं'),
    unlock: h('1. Choose the locked PDF', '1. लॉक की हुई PDF चुनें'),
    organize: h('1. Choose your PDF', '1. अपनी PDF चुनें'),
    tojpg: h('1. Choose your PDF', '1. अपनी PDF चुनें'),
  };
  const MAKE = {
    make: h('Make PDF', 'PDF बनाएँ'), compress: h('Compress PDF', 'PDF कंप्रेस करें'),
    merge: h('Merge into one PDF', 'एक PDF में जोड़ें'), unlock: h('Save unlocked PDF', 'अनलॉक PDF सेव करें'),
    organize: h('Save PDF', 'PDF सेव करें'), tojpg: h('Convert to JPG', 'JPG में बदलें'),
  };
  const T = {
    adjust: h('Change limits and file name', 'सीमा और फ़ाइल का नाम बदलें'),
    minKB: h('Minimum KB', 'न्यूनतम KB'),
    maxKB: h('Maximum KB', 'अधिकतम KB'),
    name: h('File name', 'फ़ाइल का नाम'),
    pageSize: h('Page size', 'पेज साइज़'),
    original: h('Keep original', 'मूल साइज़'),
    choose: MODE === 'make' ? h('Choose images', 'इमेज चुनें') : MODE === 'merge' ? h('Choose files', 'फ़ाइलें चुनें') : h('Choose PDF', 'PDF चुनें'),
    camera: h('Take a photo', 'फ़ोटो खींचें'),
    clean: h('Make background white (for phone photos and scans)', 'बैकग्राउंड सफ़ेद करें (फ़ोन की फ़ोटो और स्कैन के लिए)'),
    working: h('Working…', 'बन रहा है…'),
    step2: TO_JPG ? h('2. Download your JPG files', '2. अपनी JPG फ़ाइलें डाउनलोड करें') : h('2. Download your PDF', '2. अपनी PDF डाउनलोड करें'),
    download: h('Download PDF', 'PDF डाउनलोड करें'),
    share: h('Share / Save', 'शेयर / सेव करें'),
    empty: h('No pages yet.', 'अभी कोई पेज नहीं है।'),
    tooMany: h(`You can add up to ${MAX_PAGES} pages.`, `आप अधिकतम ${MAX_PAGES} पेज जोड़ सकते हैं।`),
    tooBig: h('Could not fit this under the KB limit. Remove a page or raise the limit.', 'यह KB सीमा में नहीं आ सका। कोई पेज हटाएँ या सीमा बढ़ाएँ।'),
    failed: h('Something went wrong. Please try again.', 'कुछ गड़बड़ हुई। कृपया फिर से कोशिश करें।'),
    badPdf: h('This PDF could not be opened. It may be damaged.', 'यह PDF नहीं खुल सकी। हो सकता है फ़ाइल ख़राब हो।'),
    pwNeed: h('is locked with a password. Enter it to open the file.', 'पासवर्ड से लॉक है। फ़ाइल खोलने के लिए पासवर्ड डालें।'),
    pwWrong: h('Wrong password. Please try again.', 'पासवर्ड ग़लत है। फिर से कोशिश करें।'),
    pwOpen: h('Open', 'खोलें'),
    pwCancel: h('Cancel', 'रद्द करें'),
    pwShow: h('Show password', 'पासवर्ड दिखाएँ'),
    aadhaar: h('e-Aadhaar password: the first four letters of your name in capital letters, then your year of birth. Example: RAHU1990.',
      'ई-आधार पासवर्ड: आपके नाम के पहले चार अक्षर कैपिटल में, फिर जन्म का साल। उदाहरण: RAHU1990।'),
    kept: h('Your PDF is already inside the limit, so it was kept exactly as it was.', 'आपकी PDF पहले से सीमा के अंदर है, इसलिए उसे वैसा ही रखा गया।'),
  };

  const params = new URLSearchParams(location.search);
  const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : d; };
  const cleanName = (s) => (s || '').toLowerCase().replace(/\.(pdf|jpe?g|png)$/, '').replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const D = DEFAULTS[MODE] || DEFAULTS.make;
  const st = {
    minKB: num(params.get('min'), D[0]),
    maxKB: num(params.get('max'), D[1]) || D[1],
    a4: params.get('fit') ? params.get('fit') !== 'image' : D[2],
    name: cleanName(params.get('name')) || (TO_JPG ? 'page' : 'document'),
    clean: D[3],
    pages: [], // { src: canvas, ptw, pth } – page size in points for "keep original"
    single: null, // the one PDF the user added (compress mode keeps it if it already fits)
    modified: false,
    urls: [],
  };
  if (st.minKB >= st.maxKB) st.minKB = 0;

  const multi = MODE !== 'tojpg';
  const accept = TO_JPG ? 'application/pdf' : 'application/pdf,image/*';
  const camera = MODE === 'make' || MODE === 'merge';
  el.innerHTML = `
    <div class="tabs chips">${PRESETS.map((p, i) => `<button type="button" class="tab" data-p="${i}">${p.label}</button>`).join('')}</div>
    <p class="spec"></p>
    <details class="adjust">
      <summary>${T.adjust}</summary>
      <div class="adjust-grid">
        <label>${T.minKB}<input type="number" inputmode="decimal" name="minKB" min="0" max="20000" step="any"></label>
        <label>${T.maxKB}<input type="number" inputmode="decimal" name="maxKB" min="5" max="20000" step="any"></label>
        <label class="wide">${T.name}<input type="text" name="name" maxlength="60"></label>
      </div>
      <div class="row radios"${TO_JPG ? ' hidden' : ''}>${T.pageSize}:
        <label class="check"><input type="radio" name="fit" value="a4"> A4</label>
        <label class="check"><input type="radio" name="fit" value="image"> ${T.original}</label>
      </div>
    </details>
    <h3 class="step">${STEP1[MODE] || STEP1.make}</h3>
    <div class="pick-btns">
      <label class="btn primary"><input type="file" accept="${accept}"${multi ? ' multiple' : ''} class="file-input f-gallery">${T.choose}</label>
      ${camera ? `<label class="btn"><input type="file" accept="image/*" capture="environment" class="file-input f-camera">${T.camera}</label>` : ''}
    </div>
    <p class="muted small">🔒 ${h('Your files are processed on this device. They are never uploaded.', 'आपकी फ़ाइलें इसी डिवाइस पर बनती हैं। इन्हें कहीं अपलोड नहीं किया जाता।')}</p>
    <div class="pw-box" hidden>
      <p class="pw-msg"></p>
      <div class="row pw-row">
        <input type="password" class="pw" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Password">
        <button type="button" class="btn small primary pw-ok">${T.pwOpen}</button>
        <button type="button" class="btn small ghost pw-cancel">${T.pwCancel}</button>
      </div>
      <label class="check small"><input type="checkbox" class="pw-show"> ${T.pwShow}</label>
      <p class="muted small">${T.aadhaar}</p>
    </div>
    <p class="muted small status" hidden></p>
    <ol class="pages"></ol>
    <p class="muted small no-pages">${T.empty}</p>
    <label class="check"><input type="checkbox" class="clean"> ${T.clean}</label>
    <div class="actions"><button type="button" class="btn primary make" disabled>${MAKE[MODE] || MAKE.make}</button></div>
    <p class="error" hidden></p>
    <div class="stage s-result" hidden>
      <h3 class="step">${T.step2}</h3>
      <ul class="checks"></ul>
      <ul class="jpgs"></ul>
      <div class="actions pdf-actions">
        <a class="btn primary download" href="#" download>⬇ ${T.download}</a>
        <button type="button" class="btn share" hidden>${T.share}</button>
      </div>
      <p class="muted small">${X.inAppText}</p>
    </div>`;

  const $ = (s) => el.querySelector(s);
  $('.clean').checked = st.clean;

  function renderSpec() {
    const kb = st.minKB > 0 ? `${fmtNum(st.minKB)}–${fmtNum(st.maxKB)} KB` : h(`Up to ${fmtNum(st.maxKB)} KB`, `${fmtNum(st.maxKB)} KB तक`);
    const fmt = TO_JPG ? h('JPG, one file per page', 'JPG, हर पेज की अलग फ़ाइल') : `PDF · ${st.a4 ? 'A4' : h('original page size', 'मूल पेज साइज़')}`;
    $('.spec').innerHTML = `${kb} · ${fmt}`;
    el.querySelectorAll('.chips .tab').forEach((t) => {
      const p = PRESETS[Number(t.dataset.p)];
      t.classList.toggle('active', p.min === st.minKB && p.max === st.maxKB);
    });
    $('[name=minKB]').value = st.minKB;
    $('[name=maxKB]').value = st.maxKB;
    $('[name=name]').value = st.name;
    el.querySelectorAll('[name=fit]').forEach((r) => { r.checked = (r.value === 'a4') === st.a4; });
  }
  el.querySelectorAll('.chips .tab').forEach((t) => t.addEventListener('click', () => {
    const p = PRESETS[Number(t.dataset.p)];
    st.minKB = p.min;
    st.maxKB = p.max;
    resultStale();
    renderSpec();
  }));
  $('.adjust').addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'minKB' || t.name === 'maxKB') {
      const mn = num($('[name=minKB]').value, 0), mx = num($('[name=maxKB]').value, st.maxKB);
      if (mx >= 5) { st.maxKB = mx; st.minKB = mn < mx ? mn : 0; }
    } else if (t.name === 'name') {
      st.name = cleanName(t.value) || (TO_JPG ? 'page' : 'document');
    } else if (t.name === 'fit') {
      st.a4 = t.value === 'a4';
    }
    resultStale();
    renderSpec();
  });
  $('.clean').addEventListener('change', (e) => { st.clean = e.target.checked; st.modified = true; resultStale(); });

  // ---------------------------------------------------------------- reading files
  let pdfjsPromise = null;
  function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import(abs('vendor/pdfjs/pdf.min.mjs')).then((m) => {
        m.GlobalWorkerOptions.workerSrc = abs('vendor/pdfjs/pdf.worker.min.mjs');
        return m;
      });
      pdfjsPromise.catch(() => { pdfjsPromise = null; });
    }
    return pdfjsPromise;
  }

  function askPassword(name, wrong) {
    return new Promise((resolve) => {
      const box = $('.pw-box'), input = $('.pw');
      $('.pw-msg').innerHTML = wrong ? T.pwWrong : `<strong>${escapeHtml(name)}</strong> ${T.pwNeed}`;
      box.hidden = false;
      input.value = '';
      input.focus();
      const done = (val) => {
        box.hidden = true;
        $('.pw-ok').onclick = $('.pw-cancel').onclick = input.onkeydown = null;
        resolve(val);
      };
      $('.pw-ok').onclick = () => done(input.value);
      $('.pw-cancel').onclick = () => done(null);
      input.onkeydown = (e) => { if (e.key === 'Enter') done(input.value); };
    });
  }
  $('.pw-show').addEventListener('change', (e) => { $('.pw').type = e.target.checked ? 'text' : 'password'; });

  async function addPdf(file) {
    const pdfjs = await loadPdfjs();
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      cMapUrl: abs('vendor/pdfjs/cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: abs('vendor/pdfjs/standard_fonts/'),
      isEvalSupported: false, // keep the page's strict security policy
    });
    task.onPassword = (update, reason) => {
      askPassword(file.name, reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD).then((pw) => {
        if (pw == null) task.destroy(); else update(pw);
      });
    };
    let doc;
    try { doc = await task.promise; } catch (e) {
      if (e && e.name === 'PasswordException') return; // cancelled
      throw e;
    }
    try {
      for (let n = 1; n <= doc.numPages; n++) {
        if (st.pages.length >= MAX_PAGES) { showError(T.tooMany); break; }
        setStatus(h(`Reading page ${n} of ${doc.numPages}…`, `पेज ${n} / ${doc.numPages} पढ़ा जा रहा है…`));
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 }); // points, page rotation applied
        const land = base.width > base.height;
        const bw = land ? BOX.h : BOX.w, bh = land ? BOX.w : BOX.h;
        const vp = page.getViewport({ scale: Math.min(bw / base.width, bh / base.height) });
        const c = makeCanvas(Math.max(1, Math.round(vp.width)), Math.max(1, Math.round(vp.height)));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        page.cleanup();
        st.pages.push({ src: c, ptw: base.width, pth: base.height });
        renderPages();
        await nextFrame();
      }
    } finally {
      setStatus(null);
      doc.destroy();
    }
  }

  async function addImage(file) {
    const src = await decodeToCanvas(file, BOX.h);
    const land = src.width > src.height;
    const k = Math.min(1, (land ? BOX.h : BOX.w) / src.width, (land ? BOX.w : BOX.h) / src.height);
    st.pages.push({ src, ptw: src.width * k * 72 / 150, pth: src.height * k * 72 / 150 });
  }

  async function addFiles(files) {
    hideError();
    const firstBatch = st.pages.length === 0;
    for (const f of files) {
      if (st.pages.length >= MAX_PAGES) { showError(T.tooMany); break; }
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      try {
        if (isPdf) await addPdf(f); else await addImage(f);
      } catch (e) {
        console.error(e);
        showError(isPdf ? T.badPdf : X.badFileText);
      }
    }
    // Remember a lone PDF so "compress" can keep it untouched if it already fits.
    st.single = firstBatch && files.length === 1 && /pdf/i.test(files[0].type + files[0].name) ? files[0] : null;
    st.modified = !firstBatch;
    resultStale();
    renderPages();
  }
  $('.f-gallery').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; addFiles(f); });
  if (camera) $('.f-camera').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; addFiles(f); });

  // ---------------------------------------------------------------- page list
  function thumb(src) {
    const th = 96, tw = Math.max(1, Math.round(src.width * th / src.height));
    const c = makeCanvas(Math.min(tw, 160), th);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    const k = Math.min(c.width / src.width, c.height / src.height);
    drawScaled(ctx, src, 0, 0, src.width, src.height, (c.width - src.width * k) / 2, (c.height - src.height * k) / 2, src.width * k, src.height * k);
    return c;
  }
  function renderPages() {
    const list = $('.pages');
    list.innerHTML = '';
    st.pages.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'page';
      if (!p.thumb) p.thumb = thumb(p.src);
      li.appendChild(p.thumb);
      const meta = document.createElement('div');
      meta.className = 'page-meta';
      meta.innerHTML = `<strong>${h(`Page ${i + 1}`, `पेज ${i + 1}`)}</strong>
        <div class="page-btns">
          <button type="button" class="btn small" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button type="button" class="btn small" data-act="rot" aria-label="Rotate">↻</button>
          <button type="button" class="btn small" data-act="del" aria-label="Remove">✕</button>
        </div>`;
      meta.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        const act = b.dataset.act;
        if (act === 'up' && i > 0) [st.pages[i - 1], st.pages[i]] = [st.pages[i], st.pages[i - 1]];
        if (act === 'rot') { p.src = rotate90(p.src); [p.ptw, p.pth] = [p.pth, p.ptw]; p.thumb = null; }
        if (act === 'del') st.pages.splice(i, 1);
        st.modified = true;
        resultStale();
        renderPages();
      }));
      li.appendChild(meta);
      list.appendChild(li);
    });
    $('.no-pages').hidden = st.pages.length > 0;
    $('.make').disabled = st.pages.length === 0;
  }

  // ---------------------------------------------------------------- make
  $('.make').addEventListener('click', async () => {
    const btn = $('.make');
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = T.working;
    hideError();
    await nextFrame();
    try {
      if (TO_JPG) {
        const out = await makeJpgs();
        if (!out) showError(T.tooBig); else showJpgs(out);
      } else {
        const out = await makePdf();
        if (!out) showError(T.tooBig); else showPdf(out);
      }
    } catch (e) {
      console.error(e);
      showError(T.failed);
    } finally {
      btn.disabled = st.pages.length === 0;
      btn.innerHTML = label;
    }
  });

  const sources = () => st.pages.map((p) => ({ ...p, src: st.clean ? whiten(p.src, 50) : p.src }));

  async function makePdf() {
    const { minB, maxB } = byteLimits(st.minKB, st.maxKB);
    if (MODE === 'compress' && st.single && !st.modified && st.single.size >= minB && st.single.size <= maxB) {
      return { bytes: new Uint8Array(await st.single.arrayBuffer()), pages: st.pages.length, kept: true };
    }
    const pages = sources();
    let scale = 1;
    for (let attempt = 0; attempt < 8; attempt++) {
      const fitted = pages.map((p) => ({ ...p, src: fitToBox(p.src, scale) }));
      const encode = (q) => Promise.all(fitted.map((p) => jpegPage(p, q)));
      let best = null, bestPages = null;
      let enc = await encode(0.9);
      let pdf = buildPdf(enc, st.a4);
      if (pdf.length <= maxB) {
        best = pdf; bestPages = enc;
      } else {
        let lo = 0.35, hi = 0.9;
        for (let i = 0; i < 7; i++) {
          const q = (lo + hi) / 2;
          enc = await encode(q);
          pdf = buildPdf(enc, st.a4);
          if (pdf.length <= maxB) { best = pdf; bestPages = enc; lo = q; } else hi = q;
        }
      }
      if (best) {
        if (best.length < minB) {
          const richEnc = await encode(0.97); // real detail first, then padding
          const rich = buildPdf(richEnc, st.a4);
          if (rich.length <= maxB) { best = rich; bestPages = richEnc; }
          if (best.length < minB) best = buildPdf(bestPages, st.a4, Math.min(minB + 1024, maxB) - best.length);
        }
        return { bytes: best, pages: fitted.length };
      }
      scale *= 0.75; // still too big at a sensible quality: lower the resolution
    }
    return null;
  }

  async function makeJpgs() {
    const spec = { minKB: st.minKB, maxKB: st.maxKB };
    const out = [];
    for (const p of sources()) {
      let c = p.src;
      let res = await encodeJpeg(c, spec, 0.45);
      for (let i = 0; res.tooBig && i < 14 && Math.max(c.width, c.height) > 200; i++) {
        c = shrink(c, 0.82);
        res = await encodeJpeg(c, spec, 0.45);
      }
      if (res.tooBig) res = await encodeJpeg(c, spec);
      if (res.tooBig) return null;
      out.push({ blob: res.blob, bytes: res.bytes, w: c.width, h: c.height });
    }
    return out;
  }

  function shrink(src, k) {
    const w = Math.max(1, Math.round(src.width * k)), hgt = Math.max(1, Math.round(src.height * k));
    const c = makeCanvas(w, hgt);
    drawScaled(c.getContext('2d'), src, 0, 0, src.width, src.height, 0, 0, w, hgt);
    return c;
  }
  function fitToBox(src, scale) {
    const land = src.width > src.height;
    const bw = (land ? BOX.h : BOX.w) * scale, bh = (land ? BOX.w : BOX.h) * scale;
    const k = Math.min(1, bw / src.width, bh / src.height);
    return k === 1 ? src : shrink(src, k);
  }
  async function jpegPage(p, q) {
    const b = await toJpeg(p.src, q);
    return { bytes: new Uint8Array(await b.arrayBuffer()), w: p.src.width, h: p.src.height, ptw: p.ptw, pth: p.pth };
  }

  // Minimal PDF 1.4 writer: one JPEG image per page, centred on the page.
  function buildPdf(pages, a4, padBytes) {
    const enc = new TextEncoder();
    const chunks = [];
    const offs = [];
    let pos = 0;
    const add = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); pos += b.length; };
    const begin = (id) => { offs[id] = pos; add(`${id} 0 obj\n`); };
    const f = (n) => String(Math.round(n * 100) / 100);
    add('%PDF-1.4\n');
    add(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A])); // binary marker comment
    const ids = pages.map((_, i) => 4 + i * 3);
    begin(1); add('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    begin(2); add(`<< /Type /Pages /Kids [${ids.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`);
    begin(3); add('<< /Producer (SahiSize) /Creator (SahiSize) >>\nendobj\n');
    pages.forEach((p, i) => {
      const id = ids[i];
      let pw, ph;
      if (a4) {
        const land = p.w > p.h;
        pw = land ? A4.h : A4.w;
        ph = land ? A4.w : A4.h;
      } else {
        pw = p.ptw;
        ph = p.pth;
      }
      const k = Math.min(pw / p.w, ph / p.h);
      const dw = p.w * k, dh = p.h * k;
      const content = `q ${f(dw)} 0 0 ${f(dh)} ${f((pw - dw) / 2)} ${f((ph - dh) / 2)} cm /Im0 Do Q`;
      begin(id);
      add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pw)} ${f(ph)}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>\nendobj\n`);
      begin(id + 1);
      add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
      begin(id + 2);
      add(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`);
      add(p.bytes);
      add('\nendstream\nendobj\n');
    });
    let last = 3 + pages.length * 3;
    if (padBytes > 0) { // unreferenced filler object to reach a minimum file size
      last++;
      begin(last);
      add(`<< /Length ${padBytes} >>\nstream\n`);
      add(new Uint8Array(padBytes).fill(0x20));
      add('\nendstream\nendobj\n');
    }
    const xref = pos;
    let x = `xref\n0 ${last + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= last; i++) x += `${String(offs[i]).padStart(10, '0')} 00000 n \n`;
    add(x);
    add(`trailer\n<< /Size ${last + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(pos);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  // ---------------------------------------------------------------- results
  const item = (good, en, hi) => `<li class="${good ? 'ok' : 'bad'}">${good ? '✓' : '✗'} ${h(en, hi)}</li>`;
  const rangeText = () => (st.minKB > 0 ? `${fmtNum(st.minKB)}–${fmtNum(st.maxKB)} KB` : `0–${fmtNum(st.maxKB)} KB`);
  const inRange = (bytes) => bytes >= st.minKB * 1024 && bytes <= st.maxKB * 1000;
  function revoke() { st.urls.forEach((u) => URL.revokeObjectURL(u)); st.urls = []; }

  function showPdf(out) {
    revoke();
    const blob = new Blob([out.bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    st.urls.push(url);
    const kb = out.bytes.length / 1024;
    const ok = inRange(out.bytes.length);
    let html = item(ok, `File size ${kb.toFixed(1)} KB (allowed ${rangeText()})`, `फ़ाइल साइज़ ${kb.toFixed(1)} KB (सीमा ${rangeText()})`);
    html += item(true, `${out.pages} page${out.pages > 1 ? 's' : ''}${st.a4 && !out.kept ? ', A4' : ''}`, `${out.pages} पेज${st.a4 && !out.kept ? ', A4' : ''}`);
    html += item(true, 'PDF format', 'PDF फ़ॉर्मेट');
    if (out.kept) html += `<li class="ok">✓ ${T.kept}</li>`;
    $('.checks').innerHTML = html;
    $('.jpgs').innerHTML = '';
    $('.pdf-actions').hidden = false;
    const fname = `${st.name}.pdf`;
    const dl = $('.download');
    dl.href = url;
    dl.setAttribute('download', fname);
    setupShare(blob, fname, 'application/pdf');
    const r = $('.s-result');
    r.dataset.bytes = String(out.bytes.length);
    r.dataset.pages = String(out.pages);
    r.dataset.ok = String(ok);
    r.dataset.kept = String(!!out.kept);
    r.hidden = false;
    r.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showJpgs(list) {
    revoke();
    const allOk = list.every((j) => inRange(j.bytes));
    $('.checks').innerHTML = item(allOk, `${list.length} JPG file${list.length > 1 ? 's' : ''}, each ${rangeText()}`, `${list.length} JPG फ़ाइल, हर एक ${rangeText()}`);
    $('.pdf-actions').hidden = true;
    const ul = $('.jpgs');
    ul.innerHTML = '';
    list.forEach((j, i) => {
      const url = URL.createObjectURL(j.blob);
      st.urls.push(url);
      const fname = list.length > 1 ? `${st.name}-${i + 1}.jpg` : `${st.name}.jpg`;
      const li = document.createElement('li');
      li.className = 'page jpg';
      li.dataset.bytes = String(j.bytes);
      li.dataset.w = String(j.w);
      li.dataset.h = String(j.h);
      li.innerHTML = `<img src="${url}" alt="">
        <div class="page-meta">
          <strong>${h(`Page ${i + 1}`, `पेज ${i + 1}`)}</strong>
          <span class="muted small">${j.w} × ${j.h} px · ${(j.bytes / 1024).toFixed(1)} KB ${inRange(j.bytes) ? '✓' : '✗'}</span>
          <a class="btn small primary" href="${url}" download="${fname}">⬇ ${h('Download', 'डाउनलोड')}</a>
        </div>`;
      ul.appendChild(li);
    });
    const r = $('.s-result');
    r.dataset.count = String(list.length);
    r.dataset.ok = String(allOk);
    r.hidden = false;
    r.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setupShare(blob, fname, type) {
    const shareBtn = $('.share');
    shareBtn.hidden = true;
    try {
      const file = new File([blob], fname, { type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        shareBtn.hidden = false;
        shareBtn.onclick = () => navigator.share({ files: [file] }).catch(() => {});
      }
    } catch (e) { /* File constructor unsupported */ }
  }

  function resultStale() { $('.s-result').hidden = true; }
  function showError(msg) { const e = $('.error'); e.innerHTML = msg; e.hidden = false; }
  function hideError() { $('.error').hidden = true; }
  function setStatus(msg) { const s = $('.status'); s.hidden = !msg; if (msg) s.innerHTML = msg; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  renderSpec();
  renderPages();
})();
