/* SmartCommute — canvas charts: distribution (draggable budget), exceedance, leave-time, day profile, convergence, gauge */
(function (SC) {
  'use strict';

  /* ---------- formatting & colour helpers -------------------------------------------- */
  const fmt = {
    min(m) { if (!isFinite(m)) return '—'; m = Math.round(m); if (m < 60) return m + ' min'; const h = Math.floor(m / 60); return h + ' h ' + String(m % 60).padStart(2, '0') + ' min'; },
    hhmm(h) { h = ((h % 24) + 24) % 24; let hr = Math.floor(h), mn = Math.round((h - hr) * 60); if (mn === 60) { hr = (hr + 1) % 24; mn = 0; } return String(hr).padStart(2, '0') + ':' + String(mn).padStart(2, '0'); },
    pct(p, d) { return (100 * p).toFixed(d == null ? (p < 0.095 && p > 0 ? 1 : 0) : d) + '%'; }
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  function hex(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  const C_G = hex('#22d37f'), C_Y = hex('#fbc531'), C_R = hex('#f0454c');
  function riskRGB(t) { t = clamp(t, 0, 1); const [a, b, u] = t < 0.5 ? [C_G, C_Y, t / 0.5] : [C_Y, C_R, (t - 0.5) / 0.5]; return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)].map(Math.round); }
  const riskColor = (t, a) => { const c = riskRGB(t); return a == null ? 'rgb(' + c + ')' : 'rgba(' + c + ',' + a + ')'; };
  const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const theme = () => ({ grid: cssv('--chart-grid'), text: cssv('--chart-text'), bar: cssv('--chart-bar'), accent: cssv('--accent'), accent2: cssv('--accent2'), main: cssv('--text') });

  function niceTicks(lo, hi, n) {
    const span = hi - lo, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
    const t = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) t.push(v);
    return t;
  }
  function roundRect(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function pill(c, text, x, y, color, align) {
    c.font = '700 11px Inter, Segoe UI, system-ui, sans-serif'; const w = c.measureText(text).width + 16, h = 20;
    let px = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    px = clamp(px, 2, c.canvas.clientWidth - w - 2);
    c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 10; c.fillStyle = color; roundRect(c, px, y - h / 2, w, h, 10); c.fill(); c.restore();
    c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(text, px + 8, y + 0.5);
    return { x: px, w, h };
  }
  /* P(TT <= t) from the 1001 simulated quantiles */
  function cdfAt(q, t) {
    if (t <= q[0]) return 0; if (t >= q[q.length - 1]) return 1;
    let lo = 0, hi = q.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (q[m] <= t) lo = m; else hi = m; }
    const f = (t - q[lo]) / Math.max(q[hi] - q[lo], 1e-9); return (lo + f) / (q.length - 1);
  }
  function domain(res, budget) {
    const bw = res.hist.x[1] - res.hist.x[0];
    return [res.hist.x[0] - bw / 2, Math.max(res.hist.x[res.hist.x.length - 1] + bw / 2, (budget || 0) * 1.07)];
  }

  /* ---------- base class -------------------------------------------------------------- */
  class Chart {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d'); this.p = 1; this.raf = 0; this.hover = null; this.data = null;
      this.pad = { l: 10, r: 10, t: 14, b: 24 };
      canvas.addEventListener('pointermove', (e) => this.onMove(e)); canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
    }
    size() {
      const dpr = window.devicePixelRatio || 1, w = this.cv.clientWidth || 360, h = parseInt(this.cv.getAttribute('height'), 10) || 160;
      if (this.cv.width !== Math.round(w * dpr) || this.cv.height !== Math.round(h * dpr)) { this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.cv.style.height = h + 'px'; }
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.w = w; this.h = h; this.T = theme();
    }
    X(v) { return this.pad.l + (v - this.x0) / (this.x1 - this.x0) * (this.w - this.pad.l - this.pad.r); }
    invX(px) { return this.x0 + (px - this.pad.l) / (this.w - this.pad.l - this.pad.r) * (this.x1 - this.x0); }
    Y(v) { return this.h - this.pad.b - (v - this.y0) / (this.y1 - this.y0) * (this.h - this.pad.b - this.pad.t); }
    pos(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    onMove(e) { this.hover = this.pos(e); this.draw(); }
    animate(ms, done) {
      cancelAnimationFrame(this.raf); const t0 = performance.now(); this.animating = true;
      const step = (t) => { this.p = clamp((t - t0) / ms, 0, 1); this.draw(); if (this.p < 1) this.raf = requestAnimationFrame(step); else { this.animating = false; if (done) done(); } };
      this.p = 0; this.raf = requestAnimationFrame(step);
    }
    visible() { return this.cv.offsetParent !== null; }
    xAxis(ticks, labelFn) {
      const c = this.ctx; c.font = '500 10.5px Inter, Segoe UI, sans-serif'; c.fillStyle = this.T.text; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      ticks.forEach((t) => { c.fillText(labelFn ? labelFn(t) : t, this.X(t), this.h - 7); });
    }
    hgrid(vals, labelFn) {
      const c = this.ctx; c.strokeStyle = this.T.grid; c.lineWidth = 1; c.fillStyle = this.T.text; c.font = '500 10px Inter, Segoe UI, sans-serif'; c.textAlign = 'left';
      vals.forEach((v) => { const y = Math.round(this.Y(v)) + .5; c.beginPath(); c.moveTo(this.pad.l, y); c.lineTo(this.w - this.pad.r, y); c.stroke(); if (labelFn) c.fillText(labelFn(v), this.pad.l + 2, y - 3); });
    }
  }

  /* ---------- distribution chart with draggable budget -------------------------------------- */
  class DistChart extends Chart {
    constructor(cv, onBudget) { super(cv); this.pad = { l: 10, r: 12, t: 34, b: 24 }; this.onBudget = onBudget; this.drag = false;
      cv.addEventListener('pointerdown', (e) => { const p = this.pos(e); if (this.res && Math.abs(p.x - this.X(this.budget)) < 18) { this.drag = true; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'ew-resize'; this.setFromPx(p.x); } });
      cv.addEventListener('pointerup', () => { if (this.drag) { this.drag = false; if (this.onBudget) this.onBudget(this.budget, true); } });
    }
    set(res, budget, animate) { this.res = res; this.budget = budget; this.q = res.q; this.free = res.free; if (animate) this.animate(1500); else { this.p = 1; this.draw(); } }
    setBudget(b) { this.budget = b; this.draw(); }
    setFromPx(px) { const lo = Math.max(1, this.q[5] * 0.8), hi = this.q[1000] * 1.25; this.budget = Math.round(clamp(this.invX(px), lo, hi) * 2) / 2; if (this.onBudget) this.onBudget(this.budget, false); this.draw(); }
    onMove(e) { const p = this.pos(e); if (this.drag) { this.setFromPx(p.x); return; } this.hover = p; this.cv.style.cursor = this.res && Math.abs(p.x - this.X(this.budget)) < 18 ? 'ew-resize' : 'default'; this.draw(); }
    draw() {
      if (!this.res || !this.visible()) return; this.size(); const c = this.ctx, r = this.res, T = this.T, P = this.pad;
      c.clearRect(0, 0, this.w, this.h);
      [this.x0, this.x1] = domain(r, this.budget); const ymax = Math.max(...r.hist.y, ...r.pdf.y) * 1.14; this.y0 = 0; this.y1 = ymax;
      this.hgrid([ymax * 0.33, ymax * 0.66]);
      const base = this.Y(0), bx = this.X(this.budget), top = P.t - 6;
      // late zone
      const lg = c.createLinearGradient(0, top, 0, base); lg.addColorStop(0, 'rgba(240,69,76,.22)'); lg.addColorStop(1, 'rgba(240,69,76,.04)');
      c.fillStyle = lg; c.fillRect(bx, top, this.w - P.r - bx, base - top);
      // 95% band
      const b0 = this.X(r.pi95[0]), b1 = this.X(r.pi95[1]); c.fillStyle = 'rgba(124,92,255,.13)'; c.fillRect(b0, top + 8, b1 - b0, base - top - 8);
      c.strokeStyle = 'rgba(124,92,255,.5)'; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(b0, top + 8); c.lineTo(b0, base); c.moveTo(b1, top + 8); c.lineTo(b1, base); c.stroke(); c.setLineDash([]);
      
      // bars
      const xs = r.hist.x, ys = r.hist.y, nb = xs.length, bw = (this.X(xs[1]) - this.X(xs[0]));
      const tops = [];
      for (let i = 0; i < nb; i++) {
        const f = ease((this.p - 0.55 * i / nb) / 0.45), h = (base - this.Y(ys[i])) * f, x = this.X(xs[i]) - bw / 2 + 0.6;
        tops.push(base - (base - this.Y(ys[i])));
        const late = xs[i] > this.budget; const g = c.createLinearGradient(0, base - h, 0, base);
        if (late) { g.addColorStop(0, 'rgba(240,69,76,.85)'); g.addColorStop(1, 'rgba(240,69,76,.35)'); } else { g.addColorStop(0, T.bar); g.addColorStop(1, 'rgba(34,227,255,.18)'); }
        c.globalAlpha = late ? 1 : 0.62; c.fillStyle = g; roundRect(c, x, base - h, Math.max(bw - 1.2, 1), h, 2); c.fill(); c.globalAlpha = 1;
      }
      // simulated journeys falling into the bars
      if (this.animating && r.samples) {
        const m = 150; for (let j = 0; j < m; j++) {
          const s0 = 0.62 * j / m, u = (this.p - s0) / 0.3; if (u <= 0 || u >= 1) continue;
          const t = r.samples[j], bi = clamp(Math.floor((t - (xs[0] - (xs[1] - xs[0]) / 2)) / (xs[1] - xs[0])), 0, nb - 1);
          const y = lerp(top, this.Y(ys[bi]) , ease(u)); c.fillStyle = t > this.budget ? 'rgba(255,120,125,' + (1 - u * 0.7) + ')' : 'rgba(120,235,255,' + (1 - u * 0.7) + ')';
          c.beginPath(); c.arc(this.X(t), y, 2.2, 0, 6.3); c.fill();
        }
      }
      // fitted curve (glow)
      c.save(); c.beginPath(); const px = r.pdf.x, py = r.pdf.y, reveal = this.X(lerp(this.x0, this.x1, ease(this.p * 1.1)));
      c.rect(0, 0, reveal, this.h); c.clip(); c.beginPath(); px.forEach((x, i) => { const X = this.X(x), Y = this.Y(py[i]); i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
      c.strokeStyle = '#ffd34d'; c.lineWidth = 2.4; c.shadowColor = 'rgba(255,211,77,.7)'; c.shadowBlur = 10; c.stroke(); c.restore();
      // mean + CI of mean
      const mx = this.X(r.mean); c.strokeStyle = T.main; c.globalAlpha = .75; c.lineWidth = 1.5; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(mx, top + 26); c.lineTo(mx, base); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      c.fillStyle = T.main; c.beginPath(); c.moveTo(mx, base - 1); c.lineTo(mx - 5, base + 6); c.lineTo(mx + 5, base + 6); c.closePath(); c.fill();
      const w1 = Math.max(this.X(r.ci95[1]) - this.X(r.ci95[0]), 7); c.fillStyle = '#ffd34d'; roundRect(c, mx - w1 / 2, base - 5, w1, 5, 2.5); c.fill();
      c.fillStyle = T.main; c.font = '700 10px Inter, Segoe UI, sans-serif'; c.textAlign = 'left'; c.fillText('mean ' + Math.round(r.mean), mx + 5, top + 36);
      // free-flow marker
      if (r.free > this.x0 && r.free < this.x1) { const fx = this.X(r.free); c.strokeStyle = 'rgba(34,211,127,.7)'; c.setLineDash([2, 4]); c.beginPath(); c.moveTo(fx, top + 26); c.lineTo(fx, base); c.stroke(); c.setLineDash([]); c.fillStyle = 'rgba(34,211,127,.95)'; c.font = '600 10px Inter, Segoe UI, sans-serif'; c.textAlign = 'right'; c.fillText('no traffic', fx - 5, top + 36); }
      // axis
      this.xAxis(niceTicks(this.x0, this.x1, 6), (t) => Math.round(t) + ''); c.fillStyle = T.text; c.textAlign = 'right'; c.font = '500 10px Inter, sans-serif'; c.fillText('minutes', this.w - 4, this.h - 7 - 11);
      // budget handle
      const pl = 1 - cdfAt(this.q, this.budget);
      c.strokeStyle = '#f0454c'; c.lineWidth = 2; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(bx, top + 14); c.lineTo(bx, base); c.stroke(); c.setLineDash([]);
      c.save(); c.shadowColor = 'rgba(240,69,76,.7)'; c.shadowBlur = 12; c.fillStyle = '#fff'; c.strokeStyle = '#f0454c'; c.lineWidth = 2.5; c.beginPath(); c.arc(bx, top + 12, 10, 0, 6.3); c.fill(); c.stroke(); c.restore();
      c.strokeStyle = '#f0454c'; c.lineWidth = 1.8; c.lineCap = 'round'; c.beginPath(); c.moveTo(bx - 3.5, top + 9); c.lineTo(bx - 5.5, top + 12); c.lineTo(bx - 3.5, top + 15); c.moveTo(bx + 3.5, top + 9); c.lineTo(bx + 5.5, top + 12); c.lineTo(bx + 3.5, top + 15); c.stroke();
      pill(c, 'Late ' + fmt.pct(pl) + ' · ' + Math.round(this.budget) + ' min', bx + (bx > this.w * 0.62 ? -16 : 16), top + 12, 'rgba(240,69,76,.92)', bx > this.w * 0.62 ? 'right' : 'left');
      // hover readout
      if (this.hover && !this.drag && this.hover.x > P.l && this.hover.x < this.w - P.r && Math.abs(this.hover.x - bx) > 22) {
        const t = this.invX(this.hover.x), hx = this.hover.x; c.strokeStyle = T.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(hx, top + 24); c.lineTo(hx, base); c.stroke();
        pill(c, Math.round(t) + ' min · ' + fmt.pct(cdfAt(this.q, t)) + ' of trips are quicker', hx, base - 22, 'rgba(60,70,110,.92)', 'center');
      }
    }
  }

  /* ---------- exceedance curve ----------------------------------------------------------------- */
  class ExceedChart extends Chart {
    constructor(cv) { super(cv); this.pad = { l: 10, r: 12, t: 14, b: 24 }; }
    set(res, budget, animate) { this.res = res; this.budget = budget; if (animate) this.animate(1300); else { this.p = 1; this.draw(); } }
    setBudget(b) { this.budget = b; this.draw(); }
    draw() {
      if (!this.res || !this.visible()) return; this.size(); const c = this.ctx, r = this.res, T = this.T;
      c.clearRect(0, 0, this.w, this.h); [this.x0, this.x1] = domain(r, this.budget); this.y0 = 0; this.y1 = 1;
      this.hgrid([0.25, 0.5, 0.75], (v) => Math.round(v * 100) + '%');
      const N = 120, pts = []; for (let i = 0; i <= N; i++) { const t = lerp(this.x0, this.x1, i / N); pts.push([t, 1 - cdfAt(r.q, t)]); }
      const reveal = this.X(lerp(this.x0, this.x1, ease(this.p * 1.05))); c.save(); c.beginPath(); c.rect(0, 0, reveal, this.h); c.clip();
      const g = c.createLinearGradient(0, this.Y(1), 0, this.Y(0)); g.addColorStop(0, 'rgba(240,69,76,.34)'); g.addColorStop(1, 'rgba(34,227,255,.02)');
      c.beginPath(); pts.forEach(([t, p], i) => { const X = this.X(t), Y = this.Y(p); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.lineTo(this.X(this.x1), this.Y(0)); c.lineTo(this.X(this.x0), this.Y(0)); c.closePath(); c.fillStyle = g; c.fill();
      c.beginPath(); pts.forEach(([t, p], i) => { const X = this.X(t), Y = this.Y(p); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.strokeStyle = T.accent; c.lineWidth = 2.4; c.shadowColor = 'rgba(34,227,255,.5)'; c.shadowBlur = 8; c.stroke(); c.restore();
      this.xAxis(niceTicks(this.x0, this.x1, 6), (t) => Math.round(t) + '');
      const bx = this.X(this.budget), pl = 1 - cdfAt(r.q, this.budget);
      c.strokeStyle = 'rgba(240,69,76,.55)'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(bx, this.Y(1)); c.lineTo(bx, this.Y(0)); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#f0454c'; c.shadowColor = 'rgba(240,69,76,.8)'; c.shadowBlur = 12; c.beginPath(); c.arc(bx, this.Y(pl), 5.5, 0, 6.3); c.fill(); c.shadowBlur = 0;
      pill(c, 'P(> ' + Math.round(this.budget) + ' min) = ' + fmt.pct(pl), bx + (bx > this.w * 0.6 ? -10 : 10), clamp(this.Y(pl) - 14, 14, this.h - 40), 'rgba(240,69,76,.92)', bx > this.w * 0.6 ? 'right' : 'left');
      if (this.hover && this.hover.x > this.pad.l && this.hover.x < this.w - this.pad.r) { const t = this.invX(this.hover.x), p = 1 - cdfAt(r.q, t); c.fillStyle = T.main; c.beginPath(); c.arc(this.hover.x, this.Y(p), 4, 0, 6.3); c.fill(); pill(c, 'P(> ' + Math.round(t) + ' min) = ' + fmt.pct(p), this.hover.x, this.h - 38, 'rgba(60,70,110,.92)', 'center'); }
    }
  }

  /* ---------- leave-time curve ------------------------------------------------------------------ */
  class LeaveChart extends Chart {
    constructor(cv) { super(cv); this.pad = { l: 10, r: 14, t: 24, b: 24 }; }
    set(res, depHour, animate) { this.res = res; this.dep = depHour; if (animate) this.animate(1300); else { this.p = 1; this.draw(); } }
    draw() {
      if (!this.res || !this.visible()) return; this.size(); const c = this.ctx, L = this.res.leave, T = this.T, tol = L.tol * 100;
      c.clearRect(0, 0, this.w, this.h); this.x0 = L.h[0]; this.x1 = L.h[L.h.length - 1]; this.y0 = 0;
      this.y1 = Math.max(25, Math.ceil(Math.max(...L.pLate.map((p) => p * 100), tol * 1.6) / 10) * 10);
      this.hgrid(niceTicks(0, this.y1, 4).filter((v) => v > 0), (v) => v + '%');
      // safe zone
      c.fillStyle = 'rgba(34,211,127,.10)'; c.fillRect(this.pad.l, this.Y(tol), this.w - this.pad.l - this.pad.r, this.Y(0) - this.Y(tol));
      c.strokeStyle = 'rgba(251,197,49,.8)'; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(this.pad.l, this.Y(tol)); c.lineTo(this.w - this.pad.r, this.Y(tol)); c.stroke(); c.setLineDash([]);
      c.fillStyle = 'rgba(251,197,49,.95)'; c.font = '600 10px Inter, sans-serif'; c.textAlign = 'right'; c.fillText('accepted risk ' + Math.round(tol) + '%', this.w - this.pad.r - 2, this.Y(tol) - 4);
      const reveal = this.X(lerp(this.x0, this.x1, ease(this.p * 1.05))); c.save(); c.beginPath(); c.rect(0, 0, reveal, this.h); c.clip();
      const pts = L.h.map((h, i) => [this.X(h), this.Y(L.pLate[i] * 100)]);
      const g = c.createLinearGradient(0, this.Y(0), 0, this.Y(this.y1)); g.addColorStop(0, 'rgba(34,211,127,.05)'); g.addColorStop(1, 'rgba(240,69,76,.35)');
      c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.lineTo(pts[pts.length - 1][0], this.Y(0)); c.lineTo(pts[0][0], this.Y(0)); c.closePath(); c.fillStyle = g; c.fill();
      const lg = c.createLinearGradient(0, this.Y(0), 0, this.Y(this.y1)); lg.addColorStop(0, '#22d37f'); lg.addColorStop(0.35, '#fbc531'); lg.addColorStop(1, '#f0454c');
      c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.strokeStyle = lg; c.lineWidth = 3; c.lineJoin = 'round'; c.shadowColor = 'rgba(255,255,255,.2)'; c.shadowBlur = 8; c.stroke(); c.restore();
      this.xAxis(niceTicks(this.x0, this.x1, 5).map((v) => Math.round(v * 4) / 4), (h) => fmt.hhmm(h));
      // markers
      const bi = L.best - 1, bx = this.X(L.h[bi]), by = this.Y(L.pLate[bi] * 100);
      c.strokeStyle = 'rgba(34,211,127,.6)'; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(bx, by); c.lineTo(bx, this.Y(0)); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#22d37f'; c.shadowColor = 'rgba(34,211,127,.8)'; c.shadowBlur = 14; c.beginPath(); c.arc(bx, by, 6.5, 0, 6.3); c.fill(); c.shadowBlur = 0;
      pill(c, 'Leave ' + fmt.hhmm(L.h[bi]), bx, by - 18, 'rgba(24,160,100,.95)', 'center');
      let di = 0, dd = 9; L.h.forEach((h, i) => { if (Math.abs(h - this.dep) < dd) { dd = Math.abs(h - this.dep); di = i; } });
      const dx = this.X(L.h[di]), dy = this.Y(L.pLate[di] * 100);
      c.strokeStyle = T.accent; c.lineWidth = 2.5; c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.arc(dx, dy, 6.5, 0, 6.3); c.fill(); c.stroke();
      if (Math.abs(dx - bx) > 70) pill(c, 'Planned ' + fmt.hhmm(L.h[di]) + ' · ' + fmt.pct(L.pLate[di]), dx, dy + 20, 'rgba(20,120,170,.95)', 'center');
      if (this.hover && this.hover.x > this.pad.l && this.hover.x < this.w - this.pad.r) {
        let k = 0, d = 1e9; pts.forEach(([x], i) => { if (Math.abs(x - this.hover.x) < d) { d = Math.abs(x - this.hover.x); k = i; } });
        c.fillStyle = T.main; c.beginPath(); c.arc(pts[k][0], pts[k][1], 4.5, 0, 6.3); c.fill();
        pill(c, fmt.hhmm(L.h[k]) + ' · late ' + fmt.pct(L.pLate[k]) + ' · ~' + Math.round(L.exp[k]) + ' min', pts[k][0], this.pad.t - 4, 'rgba(60,70,110,.95)', 'center');
      }
    }
  }

  /* ---------- typical day profile ------------------------------------------------------------------ */
  class ProfileChart extends Chart {
    constructor(cv) { super(cv); this.pad = { l: 10, r: 12, t: 22, b: 24 }; }
    set(res, depHour, animate) { this.res = res; this.dep = depHour; if (animate) this.animate(1100); else { this.p = 1; this.draw(); } }
    draw() {
      if (!this.res || !this.visible()) return; this.size(); const c = this.ctx, r = this.res, T = this.T, pr = r.profile;
      const m = pr.r.map((v) => v * r.free); c.clearRect(0, 0, this.w, this.h);
      this.x0 = pr.h[0]; this.x1 = pr.h[pr.h.length - 1]; this.y0 = r.free * 0.9; this.y1 = Math.max(...m) * 1.12;
      this.hgrid(niceTicks(this.y0, this.y1, 3).filter((v) => v > this.y0 + 1), (v) => Math.round(v) + ' min');
      const reveal = this.X(lerp(this.x0, this.x1, ease(this.p * 1.05))); c.save(); c.beginPath(); c.rect(0, 0, reveal, this.h); c.clip();
      const pts = pr.h.map((h, i) => [this.X(h), this.Y(m[i])]);
      const g = c.createLinearGradient(0, this.Y(this.y1), 0, this.Y(this.y0)); g.addColorStop(0, 'rgba(124,92,255,.4)'); g.addColorStop(1, 'rgba(34,227,255,.02)');
      const path = () => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) { const mx = (pts[i - 1][0] + pts[i][0]) / 2; c.bezierCurveTo(mx, pts[i - 1][1], mx, pts[i][1], pts[i][0], pts[i][1]); } };
      path(); c.lineTo(pts[pts.length - 1][0], this.Y(this.y0)); c.lineTo(pts[0][0], this.Y(this.y0)); c.closePath(); c.fillStyle = g; c.fill();
      path(); c.strokeStyle = T.accent2; c.lineWidth = 2.6; c.shadowColor = 'rgba(124,92,255,.6)'; c.shadowBlur = 10; c.stroke(); c.restore();
      c.strokeStyle = 'rgba(34,211,127,.7)'; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(this.pad.l, this.Y(r.free)); c.lineTo(this.w - this.pad.r, this.Y(r.free)); c.stroke(); c.setLineDash([]);
      c.fillStyle = 'rgba(34,211,127,.95)'; c.font = '600 10px Inter, sans-serif'; c.textAlign = 'right'; c.fillText('no-traffic time', this.w - this.pad.r - 2, this.Y(r.free) - 4);
      this.xAxis([6, 9, 12, 15, 18, 21], (h) => fmt.hhmm(h));
      let k = 0, d = 9; pr.h.forEach((h, i) => { if (Math.abs(h - this.dep) < d) { d = Math.abs(h - this.dep); k = i; } });
      c.fillStyle = '#fff'; c.strokeStyle = T.accent; c.lineWidth = 2.5; c.beginPath(); c.arc(pts[k][0], pts[k][1], 6, 0, 6.3); c.fill(); c.stroke();
      pill(c, fmt.hhmm(this.dep) + ' · ~' + Math.round(m[k]) + ' min typical', pts[k][0], Math.max(pts[k][1] - 18, 12), 'rgba(20,120,170,.95)', 'center');
    }
  }

  /* ---------- convergence ----------------------------------------------------------------------------- */
  class ConvChart extends Chart {
    constructor(cv) { super(cv); this.pad = { l: 10, r: 12, t: 10, b: 20 }; }
    set(res, animate) { this.res = res; if (animate) this.animate(1000); else { this.p = 1; this.draw(); } }
    draw() {
      if (!this.res || !this.visible()) return; this.size(); const c = this.ctx, r = this.res, T = this.T, k = r.conv.k, p = r.conv.p.map((v) => v * 100);
      c.clearRect(0, 0, this.w, this.h); this.x0 = k[0]; this.x1 = k[k.length - 1];
      const lo = r.pLateCI[0] * 100, hi = r.pLateCI[1] * 100, span = Math.max(hi - lo, 1); this.y0 = Math.max(0, lo - span * 1.6); this.y1 = hi + span * 1.6;
      c.fillStyle = 'rgba(124,92,255,.16)'; c.fillRect(this.pad.l, this.Y(hi), this.w - this.pad.l - this.pad.r, this.Y(lo) - this.Y(hi));
      const reveal = this.X(lerp(this.x0, this.x1, ease(this.p))); c.save(); c.beginPath(); c.rect(0, 0, reveal, this.h); c.clip();
      c.beginPath(); k.forEach((kk, i) => { const X = this.X(kk), Y = this.Y(clamp(p[i], this.y0, this.y1)); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.strokeStyle = T.accent2; c.lineWidth = 2; c.stroke(); c.restore();
      this.xAxis([k[0], Math.round((k[0] + k[k.length - 1]) / 2), k[k.length - 1]], (v) => (v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : v) + ' runs');
      c.fillStyle = T.text; c.textAlign = 'right'; c.font = '600 10px Inter, sans-serif'; c.fillText('95% CI ' + lo.toFixed(1) + '–' + hi.toFixed(1) + '%', this.w - this.pad.r - 2, this.Y(hi) - 4);
    }
  }

  /* ---------- risk gauge ------------------------------------------------------------------------------ */
  class Gauge {
    constructor(cv) { this.cv = cv; this.ctx = cv.getContext('2d'); this.v = 0; this.target = 0; this.raf = 0; }
    set(score, animate) { this.target = clamp(score, 0, 100); cancelAnimationFrame(this.raf); if (!animate) { this.v = this.target; this.draw(); return; } this.v = 0; const t0 = performance.now(); const from = 0;
      const step = (t) => { const u = clamp((t - t0) / 1400, 0, 1), e = 1 - Math.pow(1 - u, 4) * Math.cos(u * 5.2) * (1 - u); this.v = lerp(from, this.target, u < 1 ? e : 1); this.draw(); if (u < 1) this.raf = requestAnimationFrame(step); }; this.raf = requestAnimationFrame(step); }
    draw() {
      const dpr = window.devicePixelRatio || 1, W = 150, H = 96; if (this.cv.width !== W * dpr) { this.cv.width = W * dpr; this.cv.height = H * dpr; }
      const c = this.ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H); const cx = 75, cy = 82, R = 62, th = 12, T = theme();
      c.lineCap = 'round'; c.lineWidth = th; c.strokeStyle = T.grid; c.beginPath(); c.arc(cx, cy, R, Math.PI, 2 * Math.PI); c.stroke();
      const n = 42, v = clamp(this.v, 0, 100);
      for (let i = 0; i < n; i++) { const a0 = Math.PI + (i / n) * Math.PI, a1 = Math.PI + ((i + 1) / n) * Math.PI; if ((i / n) * 100 > v) break; c.strokeStyle = riskColor(i / n); c.lineWidth = th; c.lineCap = 'butt'; c.beginPath(); c.arc(cx, cy, R, a0, Math.min(a1 + .01, Math.PI + v / 100 * Math.PI)); c.stroke(); }
      const a = Math.PI + (v / 100) * Math.PI, kx = cx + Math.cos(a) * R, ky = cy + Math.sin(a) * R;
      c.save(); c.shadowColor = riskColor(v / 100, .9); c.shadowBlur = 16; c.fillStyle = '#fff'; c.beginPath(); c.arc(kx, ky, 7, 0, 6.3); c.fill(); c.restore(); c.fillStyle = riskColor(v / 100); c.beginPath(); c.arc(kx, ky, 3.6, 0, 6.3); c.fill();
      c.fillStyle = T.main; c.font = '800 30px Inter, Segoe UI, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText(Math.round(v), cx, cy - 6);
      
    }
  }

  SC.fmt = fmt; SC.util = { riskColor, riskRGB, cdfAt, clamp, lerp, ease };
  SC.charts = { DistChart, ExceedChart, LeaveChart, ProfileChart, ConvChart, Gauge };
})(window.SC = window.SC || {});
