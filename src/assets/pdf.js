/*
 * SahiSize – images to PDF under a KB limit. Runs entirely in the browser.
 * Each image becomes one page. The PDF is written by hand (JPEG pages, DCTDecode),
 * so no library is needed and nothing is uploaded.
 */
(() => {
  'use strict';
  const X = window.SahiSize;
  const el = document.getElementById('pdftool');
  if (!X || !el) return;
  const { h, decodeToCanvas, whiten, drawScaled, rotate90, makeCanvas, toJpeg, byteLimits, fmtNum, nextFrame } = X;

  const MAX_PAGES = 20;
  const A4 = { w: 595.28, h: 841.89 }; // points
  const BOX = { w: 1240, h: 1754 }; // A4 at 150 DPI, the starting resolution
  const PRESETS = [
    { min: 50, max: 300, label: h('50–300 KB (NEET, JEE, CUET)', '50–300 KB (NEET, JEE, CUET)') },
    { min: 0, max: 500, label: h('Up to 500 KB (IBPS, SBI)', '500 KB तक (IBPS, SBI)') },
    { min: 0, max: 100, label: h('Up to 100 KB', '100 KB तक') },
    { min: 0, max: 200, label: h('Up to 200 KB', '200 KB तक') },
    { min: 0, max: 1000, label: h('Up to 1 MB', '1 MB तक') },
  ];
  const T = {
    adjust: h('Change limits and file name', 'सीमा और फ़ाइल का नाम बदलें'),
    minKB: h('Minimum KB', 'न्यूनतम KB'),
    maxKB: h('Maximum KB', 'अधिकतम KB'),
    name: h('File name', 'फ़ाइल का नाम'),
    pageSize: h('Page size', 'पेज साइज़'),
    a4: h('A4', 'A4'),
    same: h('Same as image', 'इमेज जितना'),
    step1: h('1. Add pages (one image = one page)', '1. पेज जोड़ें (एक इमेज = एक पेज)'),
    choose: h('Choose images', 'इमेज चुनें'),
    camera: h('Take a photo', 'फ़ोटो खींचें'),
    clean: h('Make background white (for phone photos of documents)', 'बैकग्राउंड सफ़ेद करें (दस्तावेज़ों की फ़ोन से खींची फ़ोटो के लिए)'),
    make: h('Make PDF', 'PDF बनाएँ'),
    working: h('Making PDF…', 'PDF बन रही है…'),
    step2: h('2. Download your PDF', '2. अपनी PDF डाउनलोड करें'),
    download: h('Download PDF', 'PDF डाउनलोड करें'),
    share: h('Share / Save', 'शेयर / सेव करें'),
    empty: h('No pages yet.', 'अभी कोई पेज नहीं है।'),
    tooMany: h(`You can add up to ${MAX_PAGES} pages.`, `आप अधिकतम ${MAX_PAGES} पेज जोड़ सकते हैं।`),
    tooBig: h('Could not fit these pages under the KB limit. Remove a page or raise the limit.', 'ये पेज KB सीमा में नहीं आ सके। कोई पेज हटाएँ या सीमा बढ़ाएँ।'),
    failed: h('Something went wrong. Please try again.', 'कुछ गड़बड़ हुई। कृपया फिर से कोशिश करें।'),
  };

  const params = new URLSearchParams(location.search);
  const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : d; };
  const cleanName = (s) => (s || '').toLowerCase().replace(/\.pdf$/, '').replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const st = {
    minKB: num(params.get('min'), 50),
    maxKB: num(params.get('max'), 300) || 300,
    a4: params.get('fit') !== 'image',
    name: cleanName(params.get('name')) || 'document',
    clean: true,
    pages: [],
    url: null,
  };
  if (st.minKB >= st.maxKB) st.minKB = 0;

  el.innerHTML = `
    <div class="tabs chips">${PRESETS.map((p, i) => `<button type="button" class="tab" data-p="${i}">${p.label}</button>`).join('')}</div>
    <p class="spec"></p>
    <details class="adjust">
      <summary>${T.adjust}</summary>
      <div class="adjust-grid">
        <label>${T.minKB}<input type="number" inputmode="decimal" name="minKB" min="0" max="20000" step="any"></label>
        <label>${T.maxKB}<input type="number" inputmode="decimal" name="maxKB" min="10" max="20000" step="any"></label>
        <label class="wide">${T.name}<input type="text" name="name" maxlength="60"></label>
      </div>
      <div class="row radios">${T.pageSize}:
        <label class="check"><input type="radio" name="fit" value="a4"> ${T.a4}</label>
        <label class="check"><input type="radio" name="fit" value="image"> ${T.same}</label>
      </div>
    </details>
    <h3 class="step">${T.step1}</h3>
    <div class="pick-btns">
      <label class="btn primary"><input type="file" accept="image/*" multiple class="file-input f-gallery">${T.choose}</label>
      <label class="btn"><input type="file" accept="image/*" capture="environment" class="file-input f-camera">${T.camera}</label>
    </div>
    <p class="muted small">🔒 ${X.privacyText}</p>
    <ol class="pages"></ol>
    <p class="muted small no-pages">${T.empty}</p>
    <label class="check"><input type="checkbox" class="clean" checked> ${T.clean}</label>
    <div class="actions"><button type="button" class="btn primary make" disabled>${T.make}</button></div>
    <p class="error" hidden></p>
    <div class="stage s-result" hidden>
      <h3 class="step">${T.step2}</h3>
      <ul class="checks"></ul>
      <div class="actions">
        <a class="btn primary download" href="#" download>⬇ ${T.download}</a>
        <button type="button" class="btn share" hidden>${T.share}</button>
      </div>
      <p class="muted small">${X.inAppText}</p>
    </div>`;

  const $ = (s) => el.querySelector(s);

  function renderSpec() {
    const kb = st.minKB > 0 ? `${fmtNum(st.minKB)}–${fmtNum(st.maxKB)} KB` : h(`Up to ${fmtNum(st.maxKB)} KB`, `${fmtNum(st.maxKB)} KB तक`);
    $('.spec').innerHTML = `${kb} · PDF · ${st.a4 ? 'A4' : h('page = image size', 'पेज = इमेज साइज़')}`;
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
      if (mx >= 10) { st.maxKB = mx; st.minKB = mn < mx ? mn : 0; }
    } else if (t.name === 'name') {
      st.name = cleanName(t.value) || 'document';
    } else if (t.name === 'fit') {
      st.a4 = t.value === 'a4';
    }
    resultStale();
    renderSpec();
  });
  $('.clean').addEventListener('change', (e) => { st.clean = e.target.checked; resultStale(); });

  // ---- pages
  async function addFiles(files) {
    hideError();
    for (const f of files) {
      if (st.pages.length >= MAX_PAGES) { showError(T.tooMany); break; }
      try {
        st.pages.push({ src: await decodeToCanvas(f, X.LOAD_MAX_SIDE) });
      } catch (e) {
        showError(X.badFileText);
      }
    }
    resultStale();
    renderPages();
  }
  $('.f-gallery').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
  $('.f-camera').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });

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
      li.appendChild(thumb(p.src));
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
        if (act === 'rot') p.src = rotate90(p.src);
        if (act === 'del') st.pages.splice(i, 1);
        resultStale();
        renderPages();
      }));
      li.appendChild(meta);
      list.appendChild(li);
    });
    $('.no-pages').hidden = st.pages.length > 0;
    $('.make').disabled = st.pages.length === 0;
  }

  // ---- make
  $('.make').addEventListener('click', async () => {
    const btn = $('.make');
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = T.working;
    hideError();
    await nextFrame();
    try {
      const out = await makePdf();
      if (!out) showError(T.tooBig);
      else showResult(out);
    } catch (e) {
      console.error(e);
      showError(T.failed);
    } finally {
      btn.disabled = st.pages.length === 0;
      btn.innerHTML = label;
    }
  });

  async function makePdf() {
    const { minB, maxB } = byteLimits(st.minKB, st.maxKB);
    const sources = st.pages.map((p) => (st.clean ? whiten(p.src, 50) : p.src));
    let scale = 1;
    for (let attempt = 0; attempt < 8; attempt++) {
      const canvases = sources.map((c) => fitToBox(c, scale));
      const build = async (q) => buildPdf(await Promise.all(canvases.map((c) => jpegPage(c, q))), st.a4);
      let best = null, bestQ = 0;
      let pdf = await build(0.9);
      if (pdf.length <= maxB) {
        best = pdf; bestQ = 0.9;
      } else {
        let lo = 0.35, hi = 0.9;
        for (let i = 0; i < 7; i++) {
          const q = (lo + hi) / 2;
          pdf = await build(q);
          if (pdf.length <= maxB) { best = pdf; bestQ = q; lo = q; } else hi = q;
        }
      }
      if (best) {
        if (best.length < minB) {
          const richer = await build(0.97); // real detail first, then padding
          if (richer.length <= maxB) best = richer;
          if (best.length < minB) {
            const pages = await Promise.all(canvases.map((c) => jpegPage(c, best === richer ? 0.97 : bestQ)));
            best = buildPdf(pages, st.a4, Math.min(minB + 1024, maxB) - best.length);
          }
        }
        return { bytes: best, pages: canvases.length };
      }
      scale *= 0.75; // still too big at a sensible quality: lower the resolution
    }
    return null;
  }

  function fitToBox(src, scale) {
    const land = src.width > src.height;
    const bw = (land ? BOX.h : BOX.w) * scale, bh = (land ? BOX.w : BOX.h) * scale;
    const k = Math.min(1, bw / src.width, bh / src.height);
    if (k === 1) return src;
    const w = Math.max(1, Math.round(src.width * k)), hgt = Math.max(1, Math.round(src.height * k));
    const c = makeCanvas(w, hgt);
    drawScaled(c.getContext('2d'), src, 0, 0, src.width, src.height, 0, 0, w, hgt);
    return c;
  }
  async function jpegPage(canvas, q) {
    const b = await toJpeg(canvas, q);
    return { bytes: new Uint8Array(await b.arrayBuffer()), w: canvas.width, h: canvas.height };
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
        pw = p.w * 72 / 150;
        ph = p.h * 72 / 150;
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

  // ---- result
  function showResult(out) {
    if (st.url) URL.revokeObjectURL(st.url);
    const blob = new Blob([out.bytes], { type: 'application/pdf' });
    st.url = URL.createObjectURL(blob);
    const kb = out.bytes.length / 1024;
    const ok = out.bytes.length >= st.minKB * 1024 && out.bytes.length <= st.maxKB * 1000;
    const item = (good, en, hi) => `<li class="${good ? 'ok' : 'bad'}">${good ? '✓' : '✗'} ${h(en, hi)}</li>`;
    const range = st.minKB > 0 ? `${fmtNum(st.minKB)}–${fmtNum(st.maxKB)} KB` : `0–${fmtNum(st.maxKB)} KB`;
    $('.checks').innerHTML =
      item(ok, `File size ${kb.toFixed(1)} KB (allowed ${range})`, `फ़ाइल साइज़ ${kb.toFixed(1)} KB (सीमा ${range})`) +
      item(true, `${out.pages} page${out.pages > 1 ? 's' : ''}${st.a4 ? ', A4' : ''}`, `${out.pages} पेज${st.a4 ? ', A4' : ''}`) +
      item(true, 'PDF format', 'PDF फ़ॉर्मेट');
    const fname = `${st.name}.pdf`;
    const dl = $('.download');
    dl.href = st.url;
    dl.setAttribute('download', fname);
    const shareBtn = $('.share');
    shareBtn.hidden = true;
    try {
      const file = new File([blob], fname, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        shareBtn.hidden = false;
        shareBtn.onclick = () => navigator.share({ files: [file] }).catch(() => {});
      }
    } catch (e) { /* File constructor unsupported */ }
    const r = $('.s-result');
    r.dataset.bytes = String(out.bytes.length);
    r.dataset.pages = String(out.pages);
    r.dataset.ok = String(ok);
    r.hidden = false;
    r.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function resultStale() { $('.s-result').hidden = true; }
  function showError(msg) { const e = $('.error'); e.innerHTML = msg; e.hidden = false; }
  function hideError() { $('.error').hidden = true; }

  renderSpec();
  renderPages();
})();
