/*
 * SahiSize – exam photo & signature resizer.
 * Everything happens in the browser. Images are never uploaded anywhere.
 */
(() => {
  'use strict';

  const ROOT = document.documentElement.dataset.root || './';
  const STAMP_BAND = 0.2; // share of the image height used for the name/date strip
  const LOAD_MAX_SIDE = 2000; // decoded images are scaled down to this, plenty for any form

  // ---------------------------------------------------------------- language
  const h = (en, hi) => `<span class="en">${en}</span><span class="hi" lang="hi">${hi}</span>`;

  function setLang(lang) {
    document.documentElement.setAttribute('data-lang', lang);
    try { localStorage.setItem('lang', lang); } catch (e) { /* storage blocked */ }
  }
  const langBtn = document.getElementById('lang-toggle');
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      setLang(document.documentElement.getAttribute('data-lang') === 'hi' ? 'en' : 'hi');
    });
  }

  // ---------------------------------------------------------------- offline + install
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(ROOT + 'sw.js').catch(() => {});
    });
  }
  let installEvent = null;
  const installBtn = document.getElementById('install');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    if (installBtn) installBtn.hidden = false;
  });
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!installEvent) return;
      installEvent.prompt();
      try { await installEvent.userChoice; } catch (e) { /* ignore */ }
      installEvent = null;
      installBtn.hidden = true;
    });
  }

  // ---------------------------------------------------------------- strings
  const S = {
    gallery: h('Choose from gallery', 'गैलरी से चुनें'),
    camera: h('Take a photo', 'फ़ोटो खींचें'),
    step1: h('1. Pick your image', '1. अपनी इमेज चुनें'),
    step2: h('2. Fit it in the box', '2. बॉक्स में सही से बैठाएँ'),
    step3: h('3. Download your file', '3. अपनी फ़ाइल डाउनलोड करें'),
    dragHint: h('Drag to move. Pinch or use the slider to zoom.', 'खिसकाने के लिए खींचें। ज़ूम के लिए दो उँगलियों या स्लाइडर का इस्तेमाल करें।'),
    zoom: h('Zoom', 'ज़ूम'),
    rotate: h('Rotate', 'घुमाएँ'),
    clean: h('Make background white', 'बैकग्राउंड सफ़ेद करें'),
    strength: h('Strength', 'असर'),
    stamp: h('Add name and date below the photo', 'फ़ोटो के नीचे नाम और तारीख़ जोड़ें'),
    name: h('Name', 'नाम'),
    date: h('Date', 'तारीख़'),
    make: h('Make my file', 'मेरी फ़ाइल बनाएँ'),
    working: h('Working…', 'बन रही है…'),
    download: h('Download', 'डाउनलोड करें'),
    share: h('Share / Save', 'शेयर / सेव करें'),
    again: h('Use another image', 'दूसरी इमेज लें'),
    editAgain: h('Adjust again', 'फिर से एडजस्ट करें'),
    adjust: h('Change size limits', 'साइज़ की सीमा बदलें'),
    width: h('Width (px)', 'चौड़ाई (px)'),
    height: h('Height (px)', 'ऊँचाई (px)'),
    minKB: h('Minimum KB', 'न्यूनतम KB'),
    maxKB: h('Maximum KB', 'अधिकतम KB'),
    dpi: h('DPI (optional)', 'DPI (वैकल्पिक)'),
    side: h('Longest side (px)', 'सबसे लंबी साइड (px)'),
    shape: h('keeps your image’s shape', 'इमेज का आकार वही रहता है'),
    privacy: h('Your image is processed on this device. It is never uploaded.', 'आपकी इमेज इसी डिवाइस पर बनती है। इसे कहीं अपलोड नहीं किया जाता।'),
    badFile: h('This image could not be opened. Try a JPG or PNG file. If your phone saves HEIC photos, take a screenshot of the photo and use that.',
      'यह इमेज नहीं खुली। JPG या PNG फ़ाइल आज़माएँ। अगर आपका फ़ोन HEIC फ़ोटो सेव करता है, तो फ़ोटो का स्क्रीनशॉट लेकर इस्तेमाल करें।'),
    tooBig: h('This size cannot fit under the KB limit. Reduce the width and height.', 'इस साइज़ में फ़ाइल KB सीमा से कम नहीं हो सकती। चौड़ाई और ऊँचाई कम करें।'),
    failed: h('Something went wrong. Please try again.', 'कुछ गड़बड़ हुई। कृपया फिर से कोशिश करें।'),
    inApp: h('If the download does not start, open this page in Chrome.', 'अगर डाउनलोड शुरू न हो, तो यह पेज Chrome में खोलें।'),
  };

  // ---------------------------------------------------------------- tool
  const cfgEl = document.getElementById('tool-config');
  const toolEl = document.getElementById('tool');
  if (cfgEl && toolEl) initTool(toolEl, JSON.parse(cfgEl.textContent));

  function initTool(el, cfg) {
    const docs = cfg.docs.map((d) => Object.assign({}, d));
    const st = {
      i: 0, spec: null, src: null, work: null,
      VW: 0, VH: 0, dpr: 1, scale: 1, tx: 0, ty: 0, cover: 1, minScale: 1, maxScale: 6,
      clean: false, strength: 50, stamp: false, name: '', date: todayISO(),
      urls: [], lastWrapW: 0,
    };

    el.innerHTML = `
      ${docs.length > 1 ? `<div class="tabs" role="tablist">${docs.map((d, i) =>
        `<button type="button" role="tab" class="tab" data-i="${i}">${h(d.label.en, d.label.hi)}</button>`).join('')}</div>` : ''}
      <p class="spec"></p>
      <details class="adjust"${cfg.custom ? ' open' : ''}>
        <summary>${S.adjust}</summary>
        <div class="adjust-grid">
          <label>${S.width}<input type="number" inputmode="numeric" name="w" min="20" max="4000"></label>
          <label>${S.height}<input type="number" inputmode="numeric" name="h" min="20" max="4000"></label>
          <label>${S.minKB}<input type="number" inputmode="decimal" name="minKB" min="0" max="5000" step="any"></label>
          <label>${S.maxKB}<input type="number" inputmode="decimal" name="maxKB" min="1" max="5000" step="any"></label>
          <label>${S.dpi}<input type="number" inputmode="numeric" name="dpi" min="50" max="1200"></label>
          <label class="adj-side">${S.side}<input type="number" inputmode="numeric" name="side" min="100" max="4000"></label>
        </div>
      </details>
      <div class="stage s-pick">
        <h3 class="step">${S.step1}</h3>
        <div class="pick-btns">
          <label class="btn primary"><input type="file" accept="image/*" class="file-input f-gallery">${S.gallery}</label>
          <label class="btn"><input type="file" accept="image/*" capture="environment" class="file-input f-camera">${S.camera}</label>
        </div>
        <p class="muted small">🔒 ${S.privacy}</p>
        <p class="error" hidden></p>
      </div>
      <div class="stage s-edit" hidden>
        <h3 class="step">${S.step2}</h3>
        <div class="view-wrap"><canvas class="view" aria-label="Crop area"></canvas></div>
        <p class="muted small">${S.dragHint}</p>
        <div class="controls">
          <div class="row">
            <label class="row grow">${S.zoom}<input type="range" class="zoom" min="0" max="1000" value="0"></label>
            <button type="button" class="btn small rotate">↻ ${S.rotate}</button>
          </div>
          <div class="opt-clean">
            <label class="check"><input type="checkbox" class="clean"> ${S.clean}</label>
            <label class="row strength-row">${S.strength}<input type="range" class="strength" min="0" max="100" value="50"></label>
          </div>
          <div class="opt-stamp">
            <label class="check"><input type="checkbox" class="stamp"> ${S.stamp}</label>
            <div class="stamp-fields" hidden>
              <label>${S.name}<input type="text" class="s-name" maxlength="40" autocomplete="name"></label>
              <label>${S.date}<input type="date" class="s-date"></label>
            </div>
          </div>
        </div>
        <div class="actions">
          <button type="button" class="btn primary make">${S.make}</button>
          <button type="button" class="btn ghost reset">${S.again}</button>
        </div>
        <p class="error" hidden></p>
      </div>
      <div class="stage s-result" hidden>
        <h3 class="step">${S.step3}</h3>
        <div class="result-img"><img class="out" alt="Result preview"></div>
        <ul class="checks"></ul>
        <div class="actions">
          <a class="btn primary download" href="#" download>⬇ ${S.download}</a>
          <button type="button" class="btn share" hidden>${S.share}</button>
        </div>
        <div class="actions">
          <button type="button" class="btn ghost edit-again">${S.editAgain}</button>
          <button type="button" class="btn ghost again">${S.again}</button>
        </div>
        <p class="muted small">${S.inApp}</p>
      </div>`;

    const $ = (sel) => el.querySelector(sel);
    const view = $('.view');
    const vctx = view.getContext('2d');
    const zoomEl = $('.zoom');

    // ---- doc selection
    function selectDoc(i, updateHash) {
      st.i = i;
      st.spec = Object.assign({}, docs[i]);
      el.querySelectorAll('.tab').forEach((t, j) => {
        t.classList.toggle('active', j === i);
        t.setAttribute('aria-selected', String(j === i));
      });
      const kind = st.spec.kind;
      st.clean = kind === 'scan';
      $('.clean').checked = st.clean;
      $('.strength-row').hidden = !st.clean;
      $('.opt-clean').hidden = kind === 'photo';
      $('.opt-stamp').hidden = kind === 'scan';
      st.stamp = false;
      $('.stamp').checked = false;
      $('.stamp-fields').hidden = true;
      $('.f-camera').setAttribute('capture', kind === 'photo' ? 'user' : 'environment');
      fillAdjust();
      renderSpec();
      toPick();
      if (updateHash && docs.length > 1 && history.replaceState) {
        history.replaceState(null, '', '#' + st.spec.type);
      }
    }

    function renderSpec() {
      const s = st.spec;
      const kb = s.minKB > 0 ? `${fmtNum(s.minKB)}–${fmtNum(s.maxKB)} KB` : null;
      if (s.free) {
        const size = kb || h(`Under ${fmtNum(s.maxKB)} KB`, `${fmtNum(s.maxKB)} KB से कम`);
        $('.spec').innerHTML = `${size} · JPG · ${S.shape}`;
        return;
      }
      let t = `${s.w} × ${s.h} px · ${kb || `0–${fmtNum(s.maxKB)} KB`} · JPG`;
      if (s.size) t += ` · ${s.size}`;
      if (s.dpi) t += ` · ${s.dpi} DPI`;
      $('.spec').textContent = t;
    }

    function fillAdjust() {
      const s = st.spec;
      const set = (n, v) => { $(`.adjust [name=${n}]`).value = v == null ? '' : v; };
      set('w', s.w); set('h', s.h); set('minKB', s.minKB); set('maxKB', s.maxKB); set('dpi', s.dpi); set('side', s.side);
      ['w', 'h'].forEach((n) => { $(`.adjust [name=${n}]`).parentElement.hidden = !!s.free; });
      $('.adj-side').hidden = !s.free;
    }

    // Free-shape mode: output keeps the image's proportions, longest side = spec.side.
    function fitFree() {
      const s = st.spec, iw = st.work.width, ih = st.work.height;
      const k = Math.min(s.side, Math.max(iw, ih)) / Math.max(iw, ih);
      s.w = Math.max(1, Math.round(iw * k));
      s.h = Math.max(1, Math.round(ih * k));
    }

    el.querySelectorAll('.adjust input').forEach((inp) => inp.addEventListener('change', () => {
      const v = (n) => parseFloat($(`.adjust [name=${n}]`).value);
      const s = st.spec;
      if (s.free) {
        const side = Math.round(v('side'));
        if (side >= 100 && side <= 4000) s.side = side;
      } else {
        const w = Math.round(v('w')), hh = Math.round(v('h'));
        if (w >= 20 && w <= 4000) s.w = w;
        if (hh >= 20 && hh <= 4000) s.h = hh;
      }
      const mn = v('minKB'), mx = v('maxKB');
      if (mx > 0 && mx <= 5000) {
        s.maxKB = mx;
        s.minKB = mn >= 0 && mn < mx ? mn : 0;
      }
      const dpi = Math.round(v('dpi'));
      s.dpi = dpi >= 50 && dpi <= 1200 ? dpi : undefined;
      delete s.size; // the printed size no longer applies
      fillAdjust();
      renderSpec();
      if (st.work && !$('.s-edit').hidden) {
        if (s.free) { fitFree(); layout(); resetView(); draw(); } else relayout();
      }
    }));

    // ---- stages
    function show(stage) {
      ['s-pick', 's-edit', 's-result'].forEach((c) => { $('.' + c).hidden = c !== stage; });
    }
    function toPick() {
      st.src = st.work = null;
      revokeUrls();
      $('.f-gallery').value = '';
      $('.f-camera').value = '';
      hideErrors();
      show('s-pick');
    }
    function showError(stage, msg) {
      const e = $(`.${stage} .error`);
      e.innerHTML = msg;
      e.hidden = false;
    }
    function hideErrors() { el.querySelectorAll('.error').forEach((e) => { e.hidden = true; }); }
    function revokeUrls() { st.urls.forEach((u) => URL.revokeObjectURL(u)); st.urls = []; }

    // ---- loading
    async function loadFile(file) {
      hideErrors();
      if (!file) return;
      try {
        st.src = await decodeToCanvas(file, LOAD_MAX_SIDE);
      } catch (e) {
        showError('s-pick', S.badFile);
        return;
      }
      recomputeWork();
      if (st.spec.free) fitFree();
      show('s-edit');
      layout();
      resetView();
      draw();
      $('.s-edit').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    $('.f-gallery').addEventListener('change', (e) => loadFile(e.target.files[0]));
    $('.f-camera').addEventListener('change', (e) => loadFile(e.target.files[0]));

    function recomputeWork() {
      st.work = st.clean ? whiten(st.src, st.strength) : st.src;
    }

    // ---- crop view geometry (all in CSS pixels of the view)
    function layout() {
      const s = st.spec;
      const band = st.stamp ? Math.round(s.h * STAMP_BAND) : 0;
      const aspect = s.w / (s.h - band);
      const wrap = $('.view-wrap');
      const avail = Math.max(200, wrap.clientWidth - 20);
      st.lastWrapW = wrap.clientWidth;
      const maxW = Math.min(avail, 480);
      const maxH = Math.max(200, Math.min(window.innerHeight * 0.55, 520));
      let VW = maxW, VH = VW / aspect;
      if (VH > maxH) { VH = maxH; VW = VH * aspect; }
      st.VW = VW;
      st.VH = VH;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      view.style.width = VW + 'px';
      view.style.height = VH + 'px';
      view.width = Math.max(1, Math.round(VW * dpr));
      view.height = Math.max(1, Math.round(VH * dpr));
      st.dpr = view.width / VW;
      bounds();
    }
    function bounds() {
      const iw = st.work.width, ih = st.work.height;
      st.cover = Math.max(st.VW / iw, st.VH / ih);
      st.minScale = Math.min(st.VW / iw, st.VH / ih);
      st.maxScale = st.cover * 6;
    }
    function resetView() {
      st.scale = st.cover;
      st.tx = (st.VW - st.work.width * st.scale) / 2;
      st.ty = (st.VH - st.work.height * st.scale) / 2;
      clampPos();
      syncZoom();
    }
    // Re-layout while keeping the same crop centre and relative zoom.
    function relayout() {
      const cx = (st.VW / 2 - st.tx) / st.scale;
      const cy = (st.VH / 2 - st.ty) / st.scale;
      const rel = st.scale / st.cover;
      layout();
      st.scale = clamp(rel * st.cover, st.minScale, st.maxScale);
      st.tx = st.VW / 2 - cx * st.scale;
      st.ty = st.VH / 2 - cy * st.scale;
      clampPos();
      syncZoom();
      draw();
    }
    function clampPos() {
      const iw = st.work.width * st.scale, ih = st.work.height * st.scale;
      st.tx = iw >= st.VW ? clamp(st.tx, st.VW - iw, 0) : (st.VW - iw) / 2;
      st.ty = ih >= st.VH ? clamp(st.ty, st.VH - ih, 0) : (st.VH - ih) / 2;
    }
    function zoomTo(scale, px, py) {
      scale = clamp(scale, st.minScale, st.maxScale);
      st.tx = px - (px - st.tx) * (scale / st.scale);
      st.ty = py - (py - st.ty) * (scale / st.scale);
      st.scale = scale;
      clampPos();
      syncZoom();
      draw();
    }
    function syncZoom() {
      const r = Math.log(st.maxScale / st.minScale);
      zoomEl.value = r > 0 ? String(Math.round(1000 * Math.log(st.scale / st.minScale) / r)) : '0';
    }
    zoomEl.addEventListener('input', () => {
      const scale = st.minScale * Math.pow(st.maxScale / st.minScale, zoomEl.value / 1000);
      zoomTo(scale, st.VW / 2, st.VH / 2);
    });

    function draw() {
      if (!st.work) return;
      const c = vctx, k = st.dpr;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = '#fff';
      c.fillRect(0, 0, view.width, view.height);
      c.setTransform(k, 0, 0, k, 0, 0);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(st.work, st.tx, st.ty, st.work.width * st.scale, st.work.height * st.scale);
      if (st.spec.kind === 'photo') {
        // face guide: roughly where the face should sit
        c.save();
        c.setLineDash([6, 5]);
        c.lineWidth = 2;
        c.strokeStyle = 'rgba(255,255,255,0.9)';
        c.beginPath();
        c.ellipse(st.VW / 2, st.VH * 0.44, st.VW * 0.3, st.VH * 0.32, 0, 0, Math.PI * 2);
        c.stroke();
        c.lineDashOffset = 5.5;
        c.strokeStyle = 'rgba(15,118,110,0.9)';
        c.stroke();
        c.restore();
      }
    }

    // ---- gestures
    const ptrs = new Map();
    let pinch = null;
    const pt = (e) => {
      const r = view.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (st.VW / r.width), y: (e.clientY - r.top) * (st.VH / r.height) };
    };
    const pinchInfo = () => {
      const [a, b] = [...ptrs.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    };
    view.addEventListener('pointerdown', (e) => {
      if (!st.work) return;
      view.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, pt(e));
      pinch = ptrs.size === 2 ? pinchInfo() : null;
    });
    view.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId);
      const cur = pt(e);
      ptrs.set(e.pointerId, cur);
      if (ptrs.size === 1) {
        st.tx += cur.x - prev.x;
        st.ty += cur.y - prev.y;
        clampPos();
        draw();
      } else if (ptrs.size === 2 && pinch) {
        const now = pinchInfo();
        st.tx += now.cx - pinch.cx;
        st.ty += now.cy - pinch.cy;
        zoomTo(st.scale * (now.d / pinch.d), now.cx, now.cy);
        pinch = now;
      }
    });
    const endPtr = (e) => {
      ptrs.delete(e.pointerId);
      pinch = ptrs.size === 2 ? pinchInfo() : null;
    };
    view.addEventListener('pointerup', endPtr);
    view.addEventListener('pointercancel', endPtr);
    view.addEventListener('wheel', (e) => {
      if (!st.work) return;
      e.preventDefault();
      const p = pt(e);
      zoomTo(st.scale * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    }, { passive: false });

    window.addEventListener('resize', () => {
      // Only react to width changes; mobile browsers fire resize when the URL bar hides.
      if (st.work && !$('.s-edit').hidden && $('.view-wrap').clientWidth !== st.lastWrapW) relayout();
    });

    // ---- options
    $('.rotate').addEventListener('click', () => {
      if (!st.src) return;
      st.src = rotate90(st.src);
      recomputeWork();
      if (st.spec.free) { fitFree(); layout(); } else bounds();
      resetView();
      draw();
    });
    $('.clean').addEventListener('change', (e) => {
      st.clean = e.target.checked;
      $('.strength-row').hidden = !st.clean;
      if (!st.src) return;
      recomputeWork();
      draw();
    });
    let strengthTimer = 0;
    $('.strength').addEventListener('input', (e) => {
      st.strength = Number(e.target.value);
      clearTimeout(strengthTimer);
      strengthTimer = setTimeout(() => {
        if (!st.src || !st.clean) return;
        recomputeWork();
        draw();
      }, 120);
    });
    $('.stamp').addEventListener('change', (e) => {
      st.stamp = e.target.checked;
      $('.stamp-fields').hidden = !st.stamp;
      if (st.work) relayout();
    });
    $('.s-date').value = st.date;
    $('.s-name').addEventListener('input', (e) => { st.name = e.target.value; });
    $('.s-date').addEventListener('change', (e) => { st.date = e.target.value; });

    // ---- make the file
    $('.make').addEventListener('click', async () => {
      const btn = $('.make');
      const label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = S.working;
      hideErrors();
      await nextFrame();
      try {
        let res;
        if (st.spec.free) {
          // Keep quality decent by shrinking the image instead of crushing it.
          fitFree();
          res = await encodeJpeg(renderOutput(), st.spec, 0.45);
          for (let i = 0; res.tooBig && i < 14 && Math.max(st.spec.w, st.spec.h) > 80; i++) {
            st.spec.w = Math.max(1, Math.round(st.spec.w * 0.82));
            st.spec.h = Math.max(1, Math.round(st.spec.h * 0.82));
            res = await encodeJpeg(renderOutput(), st.spec, 0.45);
          }
          if (res.tooBig) res = await encodeJpeg(renderOutput(), st.spec);
        } else {
          res = await encodeJpeg(renderOutput(), st.spec);
        }
        if (res.tooBig) showError('s-edit', S.tooBig);
        else showResult(res);
      } catch (e) {
        console.error(e);
        showError('s-edit', S.failed);
      } finally {
        btn.disabled = false;
        btn.innerHTML = label;
      }
    });

    function renderOutput() {
      const s = st.spec;
      const W = s.w, H = s.h;
      const band = st.stamp ? Math.round(H * STAMP_BAND) : 0;
      const Hp = H - band;
      const out = makeCanvas(W, H);
      const ctx = out.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      const sx = -st.tx / st.scale, sy = -st.ty / st.scale;
      drawScaled(ctx, st.work, sx, sy, st.VW / st.scale, st.VH / st.scale, 0, 0, W, Hp);
      if (band) drawStamp(ctx, W, Hp, band, st.name, st.date);
      return out;
    }

    function showResult(res) {
      revokeUrls();
      const s = st.spec;
      const url = URL.createObjectURL(res.blob);
      st.urls.push(url);
      $('.out').src = url;
      const kb = res.bytes / 1024;
      const okSize = res.bytes >= s.minKB * 1024 && res.bytes <= s.maxKB * 1000;
      const item = (ok, en, hi) => `<li class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'} ${h(en, hi)}</li>`;
      let html = item(okSize, `File size ${kb.toFixed(1)} KB (allowed ${fmtNum(s.minKB)}–${fmtNum(s.maxKB)} KB)`,
        `फ़ाइल साइज़ ${kb.toFixed(1)} KB (सीमा ${fmtNum(s.minKB)}–${fmtNum(s.maxKB)} KB)`);
      html += item(true, `${s.w} × ${s.h} pixels`, `${s.w} × ${s.h} पिक्सेल`);
      html += item(true, 'JPG format', 'JPG फ़ॉर्मेट');
      if (s.dpi) html += item(true, `${s.dpi} DPI`, `${s.dpi} DPI`);
      $('.checks').innerHTML = html;

      const fname = `${s.file || `${cfg.slug}-${s.type}`}.jpg`;
      const dl = $('.download');
      dl.href = url;
      dl.setAttribute('download', fname);

      const shareBtn = $('.share');
      shareBtn.hidden = true;
      try {
        const file = new File([res.blob], fname, { type: 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          shareBtn.hidden = false;
          shareBtn.onclick = () => navigator.share({ files: [file] }).catch(() => {});
        }
      } catch (e) { /* File constructor unsupported */ }

      const r = $('.s-result');
      r.dataset.bytes = String(res.bytes);
      r.dataset.w = String(s.w);
      r.dataset.h = String(s.h);
      r.dataset.ok = String(okSize);
      show('s-result');
      r.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    $('.reset').addEventListener('click', toPick);
    $('.again').addEventListener('click', toPick);
    $('.edit-again').addEventListener('click', () => {
      show('s-edit');
      relayout();
    });
    el.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => selectDoc(Number(t.dataset.i), true)));

    // open the tab named in the URL hash (e.g. #signature)
    const fromHash = docs.findIndex((d) => '#' + d.type === location.hash);
    selectDoc(fromHash >= 0 ? fromHash : 0, false);
  }

  // ---------------------------------------------------------------- image helpers
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  const dimsOf = (img) => [img.naturalWidth || img.width, img.naturalHeight || img.height];

  async function decodeToCanvas(file, maxSide) {
    let src = null, url = null, done = () => {};
    if ('createImageBitmap' in window) {
      try {
        src = await createImageBitmap(file, { imageOrientation: 'from-image' });
        done = () => { if (src.close) src.close(); };
      } catch (e) { src = null; }
    }
    if (!src) {
      url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      try { await img.decode(); } catch (e) { URL.revokeObjectURL(url); throw e; }
      src = img;
    }
    try {
      const [w, hgt] = dimsOf(src);
      if (!w || !hgt) throw new Error('empty image');
      const k = Math.min(1, maxSide / Math.max(w, hgt));
      const tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(hgt * k));
      const out = makeCanvas(tw, th);
      const ctx = out.getContext('2d');
      ctx.fillStyle = '#fff'; // flatten transparent PNGs onto white
      ctx.fillRect(0, 0, tw, th);
      drawScaled(ctx, src, 0, 0, w, hgt, 0, 0, tw, th);
      return out;
    } finally {
      done();
      if (url) URL.revokeObjectURL(url);
    }
  }

  // drawImage with the source rect clipped to the image (Safari draws nothing otherwise)
  // and stepwise halving for large reductions, which keeps text and hair sharp.
  function drawScaled(dctx, src, sx, sy, sw, sh, dx, dy, dw, dh) {
    const [iw, ih] = dimsOf(src);
    const x0 = Math.max(0, sx), y0 = Math.max(0, sy);
    const x1 = Math.min(iw, sx + sw), y1 = Math.min(ih, sy + sh);
    if (x1 <= x0 || y1 <= y0) return;
    const fx = dw / sw, fy = dh / sh;
    dx += (x0 - sx) * fx;
    dy += (y0 - sy) * fy;
    dw = (x1 - x0) * fx;
    dh = (y1 - y0) * fy;
    sx = x0; sy = y0; sw = x1 - x0; sh = y1 - y0;
    let cur = src;
    while (sw > dw * 2 && sh > dh * 2) {
      const nw = Math.max(1, Math.round(sw / 2)), nh = Math.max(1, Math.round(sh / 2));
      const t = makeCanvas(nw, nh);
      const tc = t.getContext('2d');
      tc.imageSmoothingEnabled = true;
      tc.imageSmoothingQuality = 'high';
      tc.drawImage(cur, sx, sy, sw, sh, 0, 0, nw, nh);
      cur = t; sx = 0; sy = 0; sw = nw; sh = nh;
    }
    dctx.imageSmoothingEnabled = true;
    dctx.imageSmoothingQuality = 'high';
    dctx.drawImage(cur, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  function rotate90(src) {
    const c = makeCanvas(src.height, src.width);
    const x = c.getContext('2d');
    x.translate(c.width, 0);
    x.rotate(Math.PI / 2);
    x.drawImage(src, 0, 0);
    return c;
  }

  // Whitens paper and darkens ink. Lighting is evened out first by dividing by a
  // local "paper brightness" map, so shadows from the phone don't turn grey.
  function whiten(src, strength) {
    const w = src.width, hgt = src.height;
    const out = makeCanvas(w, hgt);
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, w, hgt);
    const d = img.data;

    // 1. background map on a small grid: local maximum ignores ink, then smooth it
    const cells = 64;
    const sw = Math.max(4, Math.round(w >= hgt ? cells : cells * w / hgt));
    const sh = Math.max(4, Math.round(hgt >= w ? cells : cells * hgt / w));
    const small = makeCanvas(sw, sh);
    const sctx = small.getContext('2d', { willReadFrequently: true });
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(src, 0, 0, sw, sh);
    const sd = sctx.getImageData(0, 0, sw, sh);
    let lum = new Float32Array(sw * sh);
    for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
      lum[i] = 0.299 * sd.data[p] + 0.587 * sd.data[p + 1] + 0.114 * sd.data[p + 2];
    }
    for (let k = 0; k < 7; k++) lum = filter3(lum, sw, sh, true);
    for (let k = 0; k < 3; k++) lum = filter3(lum, sw, sh, false);
    for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
      sd.data[p] = sd.data[p + 1] = sd.data[p + 2] = lum[i];
      sd.data[p + 3] = 255;
    }
    sctx.putImageData(sd, 0, 0);
    const bgc = makeCanvas(w, hgt);
    const bctx = bgc.getContext('2d', { willReadFrequently: true });
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(small, 0, 0, w, hgt);
    const bg = bctx.getImageData(0, 0, w, hgt).data;

    // 2. normalise by paper brightness, then stretch levels
    const white = 0.97 - (strength / 100) * 0.27; // brighter than this share of paper = white
    const black = 0.25;
    const span = white - black;
    for (let p = 0; p < d.length; p += 4) {
      const b = Math.max(bg[p], 16);
      for (let c = 0; c < 3; c++) {
        const v = (d[p + c] / b - black) / span;
        d[p + c] = v >= 1 ? 255 : v <= 0 ? 0 : Math.round(v * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return out;
  }

  // 3×3 max (dilate) or mean (blur) filter on a single-channel grid
  function filter3(a, w, h, useMax) {
    const o = new Float32Array(a.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = 0, s = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const v = a[yy * w + xx];
            if (v > m) m = v;
            s += v;
            n++;
          }
        }
        o[y * w + x] = useMax ? m : s / n;
      }
    }
    return o;
  }

  function drawStamp(ctx, W, y, band, name, isoDate) {
    const lines = [(name || '').trim().toUpperCase(), fmtDate(isoDate)].filter(Boolean);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, y, W, band);
    if (!lines.length) return;
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lh = band / lines.length;
    lines.forEach((t, i) => {
      let fs = Math.max(6, Math.floor(lh * 0.78));
      const font = () => `bold ${fs}px Arial, Helvetica, "Noto Sans Devanagari", sans-serif`;
      ctx.font = font();
      while (fs > 6 && ctx.measureText(t).width > W * 0.94) { fs--; ctx.font = font(); }
      ctx.fillText(t, W / 2, y + lh * (i + 0.5));
    });
  }

  // ---------------------------------------------------------------- JPEG encoding
  const toJpeg = (canvas, q) => new Promise((res, rej) => {
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('JPEG encoding failed'))), 'image/jpeg', q);
  });

  // Highest quality that fits under the maximum, then padding up to the minimum.
  // Limits are checked against both KB definitions: min uses 1024 bytes, max uses 1000.
  // `floor` is the lowest JPEG quality allowed before giving up (tooBig).
  async function encodeJpeg(canvas, spec, floor) {
    const { minB, maxB } = byteLimits(spec.minKB, spec.maxKB);
    let best = null;
    let b = await toJpeg(canvas, 0.92);
    if (b.size <= maxB) {
      best = b;
      if (b.size < minB) { // try for real detail before padding
        const b2 = await toJpeg(canvas, 0.98);
        if (b2.size <= maxB) best = b2;
      }
    } else {
      let lo = floor || 0.05, hi = 0.92;
      for (let i = 0; i < 9; i++) {
        const q = (lo + hi) / 2;
        b = await toJpeg(canvas, q);
        if (b.size <= maxB) { best = b; lo = q; } else hi = q;
      }
      if (!best && !floor) {
        b = await toJpeg(canvas, 0.02);
        if (b.size <= maxB) best = b;
      }
    }
    if (!best) return { tooBig: true };
    let bytes = new Uint8Array(await best.arrayBuffer());
    if (spec.dpi) bytes = setJfifDensity(bytes, spec.dpi);
    if (bytes.length < minB) bytes = padJpeg(bytes, Math.min(minB + 512, maxB) - bytes.length);
    return { blob: new Blob([bytes], { type: 'image/jpeg' }), bytes: bytes.length };
  }

  // Byte limits that satisfy both KB definitions: min uses 1024 bytes, max uses 1000.
  function byteLimits(minKB, maxKB) {
    const minB = minKB > 0 ? Math.ceil(minKB * 1024) + 256 : 0;
    let maxB = Math.floor(maxKB * 1000) - 256;
    if (maxB <= minB + 512) maxB = Math.floor(maxKB * 1024) - 64; // very narrow range
    return { minB, maxB };
  }

  function setJfifDensity(bytes, dpi) {
    const isJfif = bytes[2] === 0xFF && bytes[3] === 0xE0 && bytes[6] === 0x4A && bytes[7] === 0x46 &&
      bytes[8] === 0x49 && bytes[9] === 0x46 && bytes[10] === 0;
    if (isJfif) {
      const o = bytes.slice();
      o[13] = 1; // units: dots per inch
      o[14] = dpi >> 8; o[15] = dpi & 255;
      o[16] = dpi >> 8; o[17] = dpi & 255;
      return o;
    }
    const app0 = [0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01,
      dpi >> 8, dpi & 255, dpi >> 8, dpi & 255, 0x00, 0x00];
    const out = new Uint8Array(bytes.length + app0.length);
    out.set(bytes.subarray(0, 2), 0);
    out.set(app0, 2);
    out.set(bytes.subarray(2), 2 + app0.length);
    return out;
  }

  // Adds JPEG comment segments (ignored by every decoder) to reach a minimum file size.
  function padJpeg(bytes, n) {
    if (n <= 0) return bytes;
    let pos = 2;
    if (bytes[2] === 0xFF && bytes[3] === 0xE0) pos = 4 + ((bytes[4] << 8) | bytes[5]);
    const segs = [];
    let left = n;
    while (left > 0) {
      const payload = Math.min(65533, Math.max(1, left - 4));
      segs.push(payload);
      left -= payload + 4;
    }
    const total = segs.reduce((a, p) => a + p + 4, 0);
    const out = new Uint8Array(bytes.length + total);
    out.set(bytes.subarray(0, pos), 0);
    let o = pos;
    for (const p of segs) {
      const len = p + 2;
      out[o++] = 0xFF; out[o++] = 0xFE; out[o++] = len >> 8; out[o++] = len & 255;
      out.fill(0x20, o, o + p);
      o += p;
    }
    out.set(bytes.subarray(pos), o);
    return out;
  }

  // ---------------------------------------------------------------- small utils
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function nextFrame() { return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function fmtDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }
  function fmtNum(n) { return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10); }

  // Shared with other tools on the site (pdf.js).
  window.SahiSize = {
    h, decodeToCanvas, whiten, drawScaled, rotate90, makeCanvas, toJpeg, byteLimits, fmtNum, nextFrame, encodeJpeg,
    LOAD_MAX_SIDE, privacyText: S.privacy, inAppText: S.inApp, badFileText: S.badFile,
  };
})();
