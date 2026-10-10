/* SmartCommute - DEMO ENGINE.
 * Browser-only approximation of src/engine/analyzeRoute.m so the interface can be previewed
 * without MATLAB. It draws historical-style samples from the same generative traffic model
 * as src/core/generateTrafficData.m, fits Normal / Lognormal / Gamma / Weibull (MLE, AIC/BIC),
 * samples N journeys from the best fit and returns the SAME JSON schema as the MATLAB engine. */
(function (SC) {
  'use strict';

  /* ---------- seeded RNG + samplers ------------------------------------------------ */
  function rng(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function normal(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function gammaSample(r, k, th) {                 // Marsaglia-Tsang
    if (k < 1) return gammaSample(r, k + 1, th) * Math.pow(r(), 1 / k);
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = normal(r); v = 1 + c * x; } while (v <= 0);
      v = v * v * v; const u = r();
      if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * th;
    }
  }

  /* ---------- special functions -------------------------------------------------- */
  function lgamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015;
    for (let j = 0; j < 6; j++) s += c[j] / ++y;
    return -t + Math.log(2.5066282746310005 * s / x);
  }
  function digamma(x) { let r = 0; while (x < 6) { r -= 1 / x; x += 1; } const f = 1 / (x * x); return r + Math.log(x) - 0.5 / x - f * (1 / 12 - f * (1 / 120 - f / 252)); }
  function trigamma(x) { let r = 0; while (x < 6) { r += 1 / (x * x); x += 1; } const f = 1 / (x * x); return r + 1 / x + f / 2 + f / x * (1 / 6 - f * (1 / 30 - f / 42)); }
  const SQ2PI = Math.log(Math.sqrt(2 * Math.PI));

  /* ---------- distribution fits (MLE) ------------------------------------------------ */
  function fitAll(x) {
    const n = x.length, lx = x.map(Math.log);
    const mean = x.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(x.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    const lm = lx.reduce((a, b) => a + b, 0) / n;
    const ls = Math.sqrt(lx.reduce((a, b) => a + (b - lm) ** 2, 0) / n);
    const out = [];
    // Normal
    out.push({ name: 'Normal', p: [mean, sd], ll: -n * (Math.log(sd) + SQ2PI) - n / 2,
      pdf: (t) => Math.exp(-0.5 * ((t - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI)),
      sample: (r) => mean + sd * normal(r) });
    // Lognormal
    const sumLx = lx.reduce((a, b) => a + b, 0);
    out.push({ name: 'Lognormal', p: [lm, ls], ll: -sumLx - n * (Math.log(ls) + SQ2PI) - n / 2,
      pdf: (t) => t <= 0 ? 0 : Math.exp(-0.5 * ((Math.log(t) - lm) / ls) ** 2) / (t * ls * Math.sqrt(2 * Math.PI)),
      sample: (r) => Math.exp(lm + ls * normal(r)) });
    // Gamma
    const s = Math.log(mean) - lm;
    let k = (3 - s + Math.sqrt((s - 3) ** 2 + 24 * s)) / (12 * s);
    for (let i = 0; i < 6; i++) k -= (Math.log(k) - digamma(k) - s) / (1 / k - trigamma(k));
    const th = mean / k;
    out.push({ name: 'Gamma', p: [k, th], ll: (k - 1) * sumLx - n * mean / th - n * k * Math.log(th) - n * lgamma(k),
      pdf: (t) => t <= 0 ? 0 : Math.exp((k - 1) * Math.log(t) - t / th - k * Math.log(th) - lgamma(k)),
      sample: (r) => gammaSample(r, k, th) });
    // Weibull (Newton on the shape)
    let kw = 1.2;
    for (let i = 0; i < 40; i++) {
      let a = 0, b = 0, c = 0;
      for (let j = 0; j < n; j++) { const p = Math.pow(x[j], kw); a += p * lx[j]; b += p; c += p * lx[j] * lx[j]; }
      const f = a / b - 1 / kw - lm, df = (c * b - a * a) / (b * b) + 1 / (kw * kw);
      const step = f / df; kw = Math.max(0.2, kw - step); if (Math.abs(step) < 1e-9) break;
    }
    let sp = 0; for (let j = 0; j < n; j++) sp += Math.pow(x[j], kw);
    const lam = Math.pow(sp / n, 1 / kw);
    out.push({ name: 'Weibull', p: [kw, lam], ll: n * Math.log(kw) - n * kw * Math.log(lam) + (kw - 1) * sumLx - sp / Math.pow(lam, kw),
      pdf: (t) => t <= 0 ? 0 : (kw / lam) * Math.pow(t / lam, kw - 1) * Math.exp(-Math.pow(t / lam, kw)),
      sample: (r) => lam * Math.pow(-Math.log(1 - r()), 1 / kw) });
    out.forEach((d) => { d.aic = 4 - 2 * d.ll; d.bic = 2 * Math.log(n) - 2 * d.ll; });
    return out;
  }

  /* ---------- generative traffic model (mirrors generateTrafficData.m) -------------- */
  const DOW_F = [0.90, 1.03, 1.00, 1.00, 1.01, 0.95, 0.92];       // Sun..Sat
  const ROUTE_F = [1.10, 0.95, 0.85, 1.05, 0.80];
  const g = (h, m, s) => Math.exp(-((h - m) ** 2) / (2 * s * s));
  function demand(h, weekend) {
    return weekend ? 0.10 + 0.55 * g(h, 13, 3.2)
      : 0.12 + 0.78 * g(h, 8.2, 1.1) + 0.85 * g(h, 17.6, 1.3) + 0.30 * g(h, 13, 2.2);
  }
  function wxFactor(w, r) {
    if (w.cond === 'Rain') return 1.12 + 0.012 * w.rainMm;
    if (w.cond === 'Fog') return 1.18;
    if (w.cond === 'Cloudy') return 1.03;
    return 1;
  }
  function ratioDraw(r, hour, weekend, dow, w) {
    const vc = demand(hour, weekend) * DOW_F[dow] * ROUTE_F[Math.floor(r() * 5)] * Math.exp(0.12 * normal(r));
    let R = (1 + 0.9 * Math.pow(vc, 4)) * wxFactor(w) * Math.exp(0.10 * normal(r));
    if (r() < 0.025) R += (5 - 10 * Math.log(r())) / 17;          // incidents (17 min ~ catalogue free-flow)
    return Math.max(R, 0.5);
  }

  const quant = (sorted, p) => { const i = p * (sorted.length - 1), lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
  const normCdf = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };
  const tinv975 = (n) => 1.96 + 2.4 / n;                         // good enough for n >= 500
  const MED_R = 1.28;                                            // typical (median) congestion ratio of the generator

  function lnStats(r, hour, weekend, dow, w, m) {
    const lx = []; for (let i = 0; i < m; i++) lx.push(Math.log(ratioDraw(r, hour, weekend, dow, w)));
    const mu = lx.reduce((a, b) => a + b, 0) / m;
    const sg = Math.sqrt(lx.reduce((a, b) => a + (b - mu) ** 2, 0) / m);
    return { mu, sg };
  }

  /* ---------- the engine -------------------------------------------------------------- */
  function analyze(req) {
    const n = req.n || 10000, tol = req.tol == null ? 0.10 : req.tol, free = Math.max(req.free, 1), hour = req.hour;
    const d = new Date(req.date + 'T12:00:00'), dow = d.getDay(), weekend = dow === 0 || dow === 6;
    const w = { cond: req.weather || 'Clear', rainMm: req.rainMm == null ? (req.weather === 'Rain' ? 4 : 0) : req.rainMm, visKm: req.visKm };
    const r = rng(42 + Math.round(hour * 4) + dow * 97);

    // 1-2 history-style sample + fits
    const H = 2500, hx = [];
    for (let i = 0; i < H; i++) hx.push(ratioDraw(r, hour + (r() - 0.5) * 1.5, weekend, dow, w));
    const fits = fitAll(hx);
    const best = fits.reduce((a, b) => (b.aic < a.aic ? b : a));

    // 3 Monte Carlo from the best fit
    const Rs = new Float64Array(n), TT = new Float64Array(n);
    for (let i = 0; i < n; i++) { Rs[i] = Math.max(best.sample(r), 0.5); TT[i] = Rs[i] * free; }
    const sorted = Float64Array.from(TT).sort();
    let sum = 0; for (let i = 0; i < n; i++) sum += TT[i];
    const mean = sum / n; let ss = 0; for (let i = 0; i < n; i++) ss += (TT[i] - mean) ** 2;
    const sd = Math.sqrt(ss / (n - 1)), cv = sd / mean, se = sd / Math.sqrt(n);
    const t95 = tinv975(n), t99 = 2.576 + 4 / n;
    const budget0 = 1.2 * free * MED_R;
    const budget = req.budgetMin > 0 ? req.budgetMin : budget0;
    let late = 0, heavy = 0, severe = 0; const dthr = [5, 10, 20, 30], dc = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      if (TT[i] > budget) late++;
      if (100 * (1 - 1 / Rs[i]) >= 40) heavy++;
      if (Rs[i] >= 1.8) severe++;
      dthr.forEach((t, j) => { if (TT[i] - free > t) dc[j]++; });
    }
    const pLate = late / n, pHeavy = heavy / n, pSevere = severe / n;
    const z = 1.96 * Math.sqrt(pLate * (1 - pLate) / n);
    const score = 100 * (0.35 * pLate + 0.25 * pHeavy + 0.20 * pSevere + 0.20 * Math.min(1, cv / 0.5));
    let ci = 0; for (let i = 0; i < n; i++) ci += 100 * (1 - 1 / Rs[i]); ci /= n;
    const lvl = ci < 15 ? 'Low' : ci < 30 ? 'Medium' : ci < 45 ? 'Heavy' : 'Severe';

    // weather uplift (common random numbers)
    const r1 = rng(7), r2 = rng(7); let mt = 0, mc = 0;
    for (let i = 0; i < 1500; i++) { mt += ratioDraw(r1, hour, weekend, dow, w); mc += ratioDraw(r2, hour, weekend, dow, { cond: 'Clear', rainMm: 0 }); }
    const upl = mt / mc - 1;

    // histogram + pdf curve
    const lo = quant(sorted, 0.001), hi = quant(sorted, 0.999), nb = 60, cnt = new Array(nb).fill(0);
    for (let i = 0; i < n; i++) { const b = Math.floor((TT[i] - lo) / (hi - lo) * nb); if (b >= 0 && b < nb) cnt[b]++; }
    const bw = (hi - lo) / nb;
    const hx_ = [], hy_ = []; for (let b = 0; b < nb; b++) { hx_.push(lo + (b + 0.5) * bw); hy_.push(cnt[b] / (n * bw)); }
    const px = [], py = []; for (let i = 0; i < 140; i++) { const t = lo + (hi - lo) * i / 139; px.push(t); py.push(best.pdf(t / free) / free); }
    const q = []; for (let i = 0; i <= 1000; i++) q.push(quant(sorted, i / 1000));

    // convergence
    const ck = [], cp = []; let run = 0; const step = Math.max(1, Math.floor(n / 120));
    for (let i = 0; i < n; i++) { if (TT[i] > budget) run++; if ((i + 1) % step === 0 && i >= 49) { ck.push(i + 1); cp.push(run / (i + 1)); } }

    // departure scan (lognormal approximation per candidate hour)
    const arrival = hour + budget / 60, hs = [], pl = [], ex = [], p95 = [];
    for (let h = Math.max(4.5, hour - 2); h <= Math.min(23.5, hour + 0.75) + 1e-9; h += 0.25) {
      const s = lnStats(r, h, weekend, dow, w, 1200), bud = (arrival - h) * 60;
      hs.push(h); pl.push(bud > 0 ? 1 - normCdf((Math.log(bud / free) - s.mu) / s.sg) : 1);
      ex.push(free * Math.exp(s.mu + s.sg * s.sg / 2)); p95.push(free * Math.exp(s.mu + 1.645 * s.sg));
    }
    let bi = -1; pl.forEach((p, i) => { if (p <= tol) bi = i; });
    const met = bi >= 0; if (!met) bi = pl.indexOf(Math.min(...pl));

    // drivers
    const mAt = (hh, wk, dw, ww) => { let a = 0; const m = 700; for (let i = 0; i < m; i++) a += ratioDraw(r, hh + (r() - 0.5) * 1.5, wk, dw, ww); return a / m; };
    const now = mAt(hour, weekend, dow, w), base = mAt(13, weekend, dow, w);
    const other = mAt(hour, !weekend, weekend ? 2 : 6, w);
    const drivers = [
      { name: 'Time of day', pct: +(100 * (now / base - 1)).toFixed(1), note: hour.toFixed(2) + ' h vs midday baseline' },
      { name: 'Weather', pct: +(100 * upl).toFixed(1), note: w.cond + ' vs clear sky' },
      { name: 'Day type', pct: +(100 * (now / other - 1)).toFixed(1), note: (weekend ? 'weekend' : 'weekday') + ' vs the other day type' },
      { name: 'Severe slowdowns', pct: +(100 * pSevere).toFixed(1), note: 'chance of a trip >= 1.8x free-flow' }
    ];
    const ph = [], pr = []; for (let h = 5; h <= 23; h++) { ph.push(h + 0.5); pr.push(mAt(h + 0.5, weekend, dow, w)); }

    return {
      engine: 'demo', n, free, distKm: req.distKm, budget, budgetDefault: budget0,
      fit: { best: best.name, records: H, relax: 'none', table: fits.map((f) => ({ name: f.name, aic: f.aic, bic: f.bic, ks: null })) },
      mean, sd, cv, median: quant(sorted, 0.5),
      ci95: [mean - t95 * se, mean + t95 * se], ci99: [mean - t99 * se, mean + t99 * se], pi95: [quant(sorted, 0.025), quant(sorted, 0.975)],
      delay: { t: dthr, p: dc.map((c) => c / n) },
      pLate, pLateCI: [Math.max(0, pLate - z), Math.min(1, pLate + z)], pHeavy, pSevere,
      risk: { score, cls: score < 25 ? 'Low' : score < 50 ? 'Moderate' : 'High' },
      congestion: { level: lvl, index: ci },
      weather: { cond: w.cond, rainMm: w.rainMm, visKm: w.visKm == null ? null : w.visKm, upliftPct: 100 * upl, score: Math.min(100, Math.max(0, 100 * upl / 0.25)), cls: upl < 0.05 ? 'Low' : upl < 0.15 ? 'Moderate' : 'High' },
      hist: { x: hx_, y: hy_ }, pdf: { x: px, y: py }, q,
      samples: Array.from(TT.slice(0, 400)),
      conv: { k: ck, p: cp },
      leave: { h: hs, pLate: pl, exp: ex, p95, best: bi + 1, bestHour: hs[bi], met, tol, arrival, budget: (arrival - hs[bi]) * 60 },
      drivers, profile: { h: ph, r: pr },
      evidence: { r2: null, adjR2: null, records: null, beta: null, corr: null }
    };
  }

  SC.demo = { analyze };
})(window.SC = window.SC || {});
