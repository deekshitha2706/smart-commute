/* SmartCommute — controller: planner, search, analysis flow, result card, settings, MATLAB bridge */
(function (SC) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const fmt = SC.fmt, U = SC.util;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = { get(k, d) { try { const v = localStorage.getItem('sc.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('sc.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } } };

  const S = { from: null, to: null, route: null, weather: null, res: null, budget: null, customBudget: null, busy: false, theme: 'dark', cardOpen: false,
    settings: { n: 10000, tol: 0.1, wx: 'Auto' }, tab: 'overview', paneAnimated: {}, seq: 0 };
  SC.state = S;

  /* ---------- MATLAB bridge ---------------------------------------------------------------------------------- */
  const Engine = {
    bridge: null, ready: false, pending: {}, records: null,
    attach(h) {
      this.bridge = h;
      h.addEventListener('result', (ev) => this.onResult(ev.Data));
      h.addEventListener('engine', (ev) => { const d = parse(ev.Data); this.ready = true; this.records = d && d.records; setBadge(); });
      h.addEventListener('toast', (ev) => { const d = parse(ev.Data) || {}; toast(d.msg || String(ev.Data), d.type || ''); });
      this.ready = true; setBadge();
      try { h.sendEventToMATLAB('ready', '{}'); } catch (e) { /* ignore */ }
    },
    isMatlab() { return !!(this.bridge && this.ready); },
    onResult(data) {
      const d = parse(data); if (!d) return; const p = this.pending[d.id]; if (!p) return; delete this.pending[d.id];
      if (d.error) p.reject(new Error(d.error)); else p.resolve(d.result);
    },
    analyze(req) {
      if (this.isMatlab()) {
        return new Promise((resolve, reject) => {
          const id = ++S.seq; req.id = id; this.pending[id] = { resolve, reject };
          this.bridge.sendEventToMATLAB('analyze', JSON.stringify(req));
          setTimeout(() => { if (this.pending[id]) { delete this.pending[id]; reject(new Error('The MATLAB engine did not answer in time.')); } }, 120000);
        }).then(sanitize);
      }
      return new Promise((resolve) => setTimeout(() => resolve(sanitize(SC.demo.analyze(req))), 40));
    }
  };
  SC.engine = Engine;
  function parse(d) { if (d == null) return null; if (typeof d === 'string') { try { return JSON.parse(d); } catch (e) { return null; } } return d; }
  function sanitize(r) {                                         // MATLAB NaN -> null: patch holes, make arrays real arrays
    const fix = (a) => { if (!Array.isArray(a)) return a == null ? [] : [a]; let last = 0; return a.map((v) => (v == null ? last : (last = v))); };
    ['q', 'samples'].forEach((k) => { r[k] = fix(r[k]); });
    ['x', 'y'].forEach((k) => { r.hist[k] = fix(r.hist[k]); r.pdf[k] = fix(r.pdf[k]); });
    ['h', 'pLate', 'exp', 'p95'].forEach((k) => { r.leave[k] = fix(r.leave[k]); });
    ['k', 'p'].forEach((k) => { r.conv[k] = fix(r.conv[k]); }); ['h', 'r'].forEach((k) => { r.profile[k] = fix(r.profile[k]); });
    r.delay.t = fix(r.delay.t); r.delay.p = fix(r.delay.p); r.ci95 = fix(r.ci95); r.ci99 = fix(r.ci99); r.pi95 = fix(r.pi95); r.pLateCI = fix(r.pLateCI);
    r.drivers = Array.isArray(r.drivers) ? r.drivers : (r.drivers ? [r.drivers] : []); r.fit.table = Array.isArray(r.fit.table) ? r.fit.table : [r.fit.table];
    return r;
  }
  window.setup = function (htmlComponent) { Engine.attach(htmlComponent); };      // called by MATLAB uihtml

  /* ---------- UI helpers --------------------------------------------------------------------------------------- */
  let toastT = 0;
  function toast(msg, type, ms) { const t = $('toast'); t.textContent = msg; t.className = 'toast ' + (type || ''); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), ms || 4200); }
  function setBadge() {
    const b = $('engineBadge');
    if (Engine.isMatlab()) { b.textContent = 'MATLAB ENGINE' + (Engine.records ? ' · ' + Engine.records.toLocaleString('en-US') + ' trips' : ''); b.className = 'badge matlab'; b.title = 'Statistics run in MATLAB on the historical dataset'; }
    else { b.textContent = 'DEMO ENGINE'; b.className = 'badge demo'; b.title = 'Browser approximation of the MATLAB engine (preview mode)'; }
    $('setFoot').textContent = Engine.isMatlab() ? 'Engine: MATLAB + Statistics Toolbox on ' + (Engine.records || 12000).toLocaleString('en-US') + ' historical trips.' : 'Preview mode: a JavaScript approximation answers. Run main.m in MATLAB for the full engine.';
    document.querySelectorAll('[data-report]').forEach((b2) => { b2.disabled = !Engine.isMatlab(); }); $('repHint').textContent = Engine.isMatlab() ? '' : '(MATLAB only)';
  }
  const shortName = (n) => { n = (n || '').split(',')[0].trim(); return n.length > 24 ? n.slice(0, 23) + '…' : n; };
  function countTo(el, to, ms, f) { const t0 = performance.now(); const step = (t) => { const u = U.clamp((t - t0) / ms, 0, 1); el.textContent = f(to * (1 - Math.pow(1 - u, 3))); if (u < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
  const pad2 = (n) => String(n).padStart(2, '0');

  /* ---------- suggestions ------------------------------------------------------------------------------------------ */
  function attachSuggest(input, box, onPick, opt) {
    opt = opt || {}; let timer = 0, items = [], sel = -1, seq = 0;
    const close = () => { box.classList.remove('open'); sel = -1; };
    const render = () => {
      box.innerHTML = ''; if (!items.length) { box.innerHTML = '<div class="sg-empty">No matches — try another spelling</div>'; box.classList.add('open'); return; }
      items.forEach((it, i) => { const d = document.createElement('div'); d.className = 'sg' + (i === sel ? ' sel' : '');
        d.innerHTML = '<svg class="ic"><use href="#i-pin"/></svg><div class="sg-t"><b></b><span></span></div>' + (opt.actions ? '<div class="sg-act"><button data-k="from">From</button><button data-k="to">To</button></div>' : '');
        d.querySelector('b').textContent = it.name; d.querySelector('span').textContent = it.sub || ''; if (SC.hook && SC.hook.suggestItem) SC.hook.suggestItem(d, it);
        d.addEventListener('mousedown', (e) => { e.preventDefault(); const k = e.target.dataset && e.target.dataset.k; pickItem(it, k); }); box.appendChild(d); });
      box.classList.add('open');
    };
    const pickItem = (it, kind) => { close(); onPick(it, kind); };
    input.addEventListener('input', () => { clearTimeout(timer); const q = input.value.trim(); if (q.length < 2) { close(); return; }
      timer = setTimeout(async () => { const my = ++seq; const b = S.from || S.to; const r = await SC.services.search(q, b ? [b.lat, b.lon] : null); if (my !== seq) return; items = r; sel = -1; render(); }, 280); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && items.length) { sel = (sel + 1) % items.length; render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp' && items.length) { sel = (sel - 1 + items.length) % items.length; render(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (box.classList.contains('open') && items.length) { pickItem(items[Math.max(sel, 0)]); e.preventDefault(); } else if (opt.enterAnalyze) { analyze(); } }
      else if (e.key === 'Escape') close();
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
    input.addEventListener('focus', () => { if (items.length && input.value.trim().length > 1) { render(); } });
    return { items: () => items };
  }

  /* ---------- points ------------------------------------------------------------------------------------------------- */
  function setPoint(kind, p, o) {
    o = o || {}; S[kind] = p; $(kind === 'from' ? 'inFrom' : 'inTo').value = p ? p.name : ''; SC.map.setPoint(kind, p); store.set('last.' + kind, p);
    if (o.fly && p) SC.map.flyTo(p.lat, p.lon, 14);
    markDirty(); if (S.from && S.to && !S.res && !S.busy && !o.silent) SC.map.fit();
  }
  async function resolveField(kind) {
    const el = $(kind === 'from' ? 'inFrom' : 'inTo'), txt = el.value.trim(), cur = S[kind];
    if (!txt) { S[kind] = null; SC.map.setPoint(kind, null); return; }
    if (cur && cur.name === txt) return;
    const r = await SC.services.search(txt, (S.from || S.to) ? [(S.from || S.to).lat, (S.from || S.to).lon] : null);
    if (r.length) setPoint(kind, { name: r[0].name + (r[0].sub ? ', ' + r[0].sub.split(',')[0] : ''), lat: r[0].lat, lon: r[0].lon }, { silent: true });
  }
  async function pointFromLatLng(kind, ll) {
    const p = { name: 'Locating…', lat: ll.lat, lon: ll.lng }; setPoint(kind, p, { silent: true }); const name = await SC.services.reverse(ll.lat, ll.lng);
    if (S[kind] && S[kind].lat === ll.lat) { S[kind].name = name; $(kind === 'from' ? 'inFrom' : 'inTo').value = name; store.set('last.' + kind, S[kind]); } if (S.from && S.to && !S.res) SC.map.fit();
  }
  function markDirty() { if (S.res) $('stale').classList.remove('hidden'); }

  /* ---------- loader --------------------------------------------------------------------------------------------------- */
  function loader(show, title, sub, pct) {
    const l = $('loader'); if (!show) { l.classList.add('hidden'); return; } l.classList.remove('hidden'); $('ldTitle').textContent = title; $('ldSub').textContent = sub || ''; $('ldFill').style.width = (pct || 0) + '%';
  }

  /* ---------- analysis flow --------------------------------------------------------------------------------------------- */
  function buildReq(w) {
    const [hh, mm] = $('inTime').value.split(':').map(Number);
    return { free: S.route.freeMin, distKm: S.route.distKm, date: $('inDate').value, hour: hh + mm / 60, weather: w.cond, rainMm: w.rainMm, visKm: w.visKm == null ? null : w.visKm,
      n: S.settings.n, tol: S.settings.tol, budgetMin: S.customBudget || null, seed: 42 };
  }
  function effectiveWeather() {
    const w = S.weather, m = S.settings.wx; if (m === 'Auto') return w;
    return { cond: m, rainMm: m === 'Rain' ? 4 : 0, visKm: m === 'Fog' ? 0.8 : m === 'Rain' ? 5.5 : m === 'Cloudy' ? 8 : 10, tempC: w ? w.tempC : null, source: 'What-if' };
  }
  async function analyze() {
    if (S.busy) return;
    try {
      await Promise.all([resolveField('from'), resolveField('to')]);
      if (!S.from || !S.to) { toast('Choose a start and a destination first.', 'err'); (!S.from ? $('inFrom') : $('inTo')).focus(); return; }
      if (!$('inDate').value || !$('inTime').value) { toast('Pick a travel date and departure time.', 'err'); return; }
      S.busy = true; S.customBudget = null; const btn = $('btnAnalyze'); btn.classList.add('busy'); btn.disabled = true; closePopovers(); hideCard(true); SC.map.setLoading(true);
      const t0 = performance.now();
      loader(true, 'Finding the route', 'Road network lookup', 12); S.route = await SC.services.route(S.from, S.to); SC.map.showRoute(S.route);
      loader(true, 'Reading the weather', 'Forecast at the middle of the route', 38); const mid = S.route.coords[Math.floor(S.route.coords.length / 2)];
      S.weather = await SC.services.weather(mid[0], mid[1], $('inDate').value, parseInt($('inTime').value, 10));
      const w = effectiveWeather();
      loader(true, 'Simulating ' + S.settings.n.toLocaleString('en-US') + ' journeys', (Engine.isMatlab() ? 'MATLAB: fitting distributions, regression, Monte Carlo' : 'Demo engine: fitting distributions and sampling'), 62);
      const res = await Engine.analyze(buildReq(w));
      const wait = 2300 - (performance.now() - t0); if (wait > 0) { loader(true, 'Estimating risk', 'Confidence intervals, risk score, best departure', 90); await sleep(wait); }
      loader(false); SC.map.setLoading(false); SC.map.showResult(res, w); showCard(res, true);
    } catch (e) {
      console.error(e); loader(false); SC.map.setLoading(false); toast(e && e.message ? e.message : 'Something went wrong.', 'err', 6000);
    } finally { S.busy = false; const btn = $('btnAnalyze'); btn.classList.remove('busy'); btn.disabled = false; }
  }
  let reTimer = 0;
  function reanalyzeQuiet() {            // budget / settings changed: refresh numbers without replaying the animation
    clearTimeout(reTimer); reTimer = setTimeout(async () => {
      if (!S.route || !S.res || S.busy) return; try { const res = await Engine.analyze(buildReq(effectiveWeather())); S.res = res; renderLeave(false); renderTiles(); } catch (e) { /* keep old numbers */ }
    }, 450);
  }

  /* ---------- result card ------------------------------------------------------------------------------------------------- */
  const charts = {};
  function showCard(res, animate, opts) {
    S.res = res; S.budget = S.customBudget || res.budget; $('stale').classList.add('hidden');
    const card = $('result'); card.classList.remove('hidden', 'leaving'); S.cardOpen = true; document.body.classList.add('has-result'); SC.map.setCardOpen(true); $('rcOpen').classList.add('hidden');
    if (!(opts && opts.noFit)) SC.map.fit();
    $('rcTitle').textContent = shortName(S.from.name) + '  →  ' + shortName(S.to.name);
    const w = effectiveWeather(), tmp = w.tempC == null ? '' : ' ' + Math.round(w.tempC) + '°';
    $('rcMeta').innerHTML = '<span class="chip">' + S.route.distKm.toFixed(1) + ' km</span><span class="chip">' + fmt.min(res.free) + ' without traffic</span><span class="chip">' + SC.wxIcon(w.cond) + w.cond + tmp + '</span>' +
      '<span class="chip" title="Weather source">' + (w.source || '') + '</span>';
    if (!charts.gauge) { charts.gauge = new SC.charts.Gauge($('gauge')); charts.dist = new SC.charts.DistChart($('cDist'), onBudget); charts.exceed = new SC.charts.ExceedChart($('cExceed')); charts.leave = new SC.charts.LeaveChart($('cLeave')); charts.profile = new SC.charts.ProfileChart($('cProfile')); charts.conv = new SC.charts.ConvChart($('cConv')); }
    const mean = res.mean; countTo($('vMean'), mean, 1100, (v) => String(Math.round(v)));
    $('vSub').textContent = '95% CI ' + res.ci95[0].toFixed(1) + '–' + res.ci95[1].toFixed(1) + ' min · spread ±' + res.sd.toFixed(1) + ' min';
    const cls = res.risk.cls, col = U.riskColor(res.risk.score / 100); charts.gauge.set(res.risk.score, animate); $('gaugeLabel').textContent = cls + ' risk'; $('gaugeLabel').style.color = col;
    renderTiles(); updateLate(); renderLeave(animate); renderWhy(animate);
    S.paneAnimated = {}; activateTab(S.tab || 'overview', animate);
    document.dispatchEvent(new CustomEvent('sc:result', { detail: { res, route: S.route, weather: w, live: !!(opts && opts.live) } }));
  }
  function hideCard(silent) {
    const card = $('result'); if (card.classList.contains('hidden')) return; S.cardOpen = false; document.body.classList.remove('has-result'); SC.map.setCardOpen(false);
    if (silent) { card.classList.add('hidden'); return; } card.classList.add('leaving'); setTimeout(() => { card.classList.add('hidden'); card.classList.remove('leaving'); if (S.res) $('rcOpen').classList.remove('hidden'); }, 340);
  }
  function renderTiles() {
    const r = S.res, tol = r.leave.tol;
    $('tVar').textContent = '±' + r.sd.toFixed(1) + ' min'; $('tVarS').textContent = 'CV ' + r.cv.toFixed(2) + ' · 95% of trips ' + Math.round(r.pi95[0]) + '–' + Math.round(r.pi95[1]) + ' min';
    const d10 = r.delay.p[r.delay.t.indexOf(10)]; $('tDelay').textContent = fmt.pct(d10); $('tDelay').style.color = U.riskColor(U.clamp(d10 / 0.6));
    $('tCI').textContent = r.ci95[0].toFixed(1) + '–' + r.ci95[1].toFixed(1); $('tCIS').textContent = '95% CI of the mean · 99%: ' + r.ci99[0].toFixed(1) + '–' + r.ci99[1].toFixed(1) + ' min';
    const lv = r.congestion.level, lc = { Low: 'low', Medium: 'med', Heavy: 'high', Severe: 'sev' }[lv] || 'med';
    $('tCong').textContent = lv; $('tCong').className = 'pill ' + lc; $('tCongS').textContent = 'congestion index ' + r.congestion.index.toFixed(0) + ' · ' + fmt.pct(r.pHeavy) + ' chance of heavy jams';
    const wc = r.weather.cls; $('tWx').textContent = wc; $('tWx').className = 'pill ' + (wc === 'Low' ? 'low' : wc === 'Moderate' ? 'med' : 'high');
    const up = r.weather.upliftPct; $('tWxS').textContent = r.weather.cond + (Math.abs(up) < 0.5 ? ' · no measurable slowdown' : ' · ' + (up >= 0 ? '+' : '') + up.toFixed(0) + '% slower than clear');
    const L = r.leave, bi = L.best - 1, tile = $('tileReco'); tile.classList.toggle('warn', !L.met);
    $('tReco').textContent = fmt.hhmm(L.bestHour); const planned = $('inTime').value;
    $('tRecoS').textContent = L.met ? 'Arrive by ' + fmt.hhmm(L.arrival) + ' with ≤ ' + Math.round(L.tol * 100) + '% chance of being late (expected ' + fmt.min(L.exp[bi]) + ')' : 'No start time reaches ' + Math.round(L.tol * 100) + '% risk — this is the safest one (' + fmt.pct(L.pLate[bi]) + ' late)';
    const box = $('delayBars'); box.innerHTML = '';
    r.delay.t.forEach((t, i) => { const p = r.delay.p[i]; const d = document.createElement('div'); d.className = 'db'; d.innerHTML = '<span>Delay &gt; ' + t + ' min</span><div class="bar"><i></i></div><b>' + fmt.pct(p) + '</b>'; box.appendChild(d); requestAnimationFrame(() => setTimeout(() => { d.querySelector('i').style.width = Math.max(1.5, p * 100) + '%'; }, 120 + i * 90)); });
  }
  function updateLate() {
    const r = S.res, b = S.budget, p = 1 - U.cdfAt(r.q, b), n = r.n, se = Math.sqrt(Math.max(p * (1 - p), 1e-6) / n);
    const el = $('vLate'); el.textContent = fmt.pct(p); el.style.color = U.riskColor(U.clamp(p / 0.4)); $('vBudget').textContent = fmt.min(b); $('lateFill').style.width = U.clamp(p * 100, 1, 100) + '%';
    $('lateNote').innerHTML = 'You are late if the trip takes more than <b>' + fmt.min(b) + '</b>' + (S.customBudget ? '' : ' (1.2 × a typical trip)') + '. 95% CI ' + fmt.pct(Math.max(0, p - 1.96 * se), 1) + '–' + fmt.pct(Math.min(1, p + 1.96 * se), 1) + '. Drag the red handle on <i>Uncertainty</i> or use ± to try other budgets.';
    if (charts.dist) { charts.dist.setBudget(b); charts.exceed.setBudget(b); }
  }
  function onBudget(b, final) { S.customBudget = b; S.budget = b; updateLate(); if (final) reanalyzeQuiet(); }
  function renderLeave(animate) {
    const r = S.res, L = r.leave, bi = L.best - 1, planned = $('inTime').value.split(':').map(Number), dep = planned[0] + planned[1] / 60;
    const ban = $('recoBanner'); ban.classList.toggle('warn', !L.met);
    ban.innerHTML = '<div class="eyebrow">' + (L.met ? 'Latest safe departure' : 'Safest departure available') + '</div><div class="rb-t">Leave at ' + fmt.hhmm(L.bestHour) + '</div><div class="rb-s">' +
      (L.met ? 'To arrive by ' + fmt.hhmm(L.arrival) + ' with at most ' + Math.round(L.tol * 100) + '% risk of being late. Your expected trip is ' + fmt.min(L.exp[bi]) + ' (worst-case 95th percentile ' + fmt.min(L.p95[bi]) + ').'
        : 'Even the earliest option in the window carries a ' + fmt.pct(L.pLate[bi]) + ' chance of lateness. Try a longer budget or a higher accepted risk.') + '</div>';
    const near = (h) => { let k = 0, d = 9; L.h.forEach((x, i) => { if (Math.abs(x - h) < d) { d = Math.abs(x - h); k = i; } }); return k; };
    const k0 = near(dep), kE = near(dep - 0.25), kL = near(dep + 0.25), ch = $('leaveChips');
    ch.innerHTML = '<span class="chip">Planned ' + fmt.hhmm(L.h[k0]) + ': <b>' + fmt.pct(L.pLate[k0]) + ' late</b></span><span class="chip">15 min earlier: <b>' + fmt.pct(L.pLate[kE]) + '</b></span><span class="chip">15 min later: <b>' + fmt.pct(L.pLate[kL]) + '</b></span>';
    if (charts.leave) { charts.leave.set(r, dep, false); if (animate) S.paneAnimated.leave = false; }
  }
  function renderWhy() {
    const r = S.res, box = $('drivers'); box.innerHTML = '';
    r.drivers.forEach((d, i) => {
      const prob = d.name === 'Severe slowdowns', up = d.pct >= 0, w = U.clamp(Math.abs(d.pct) / 60, 0, 1) * 100;
      const el = document.createElement('div'); el.className = 'drv'; const col = prob ? 'linear-gradient(90deg,#fbc531,#f0454c)' : up ? 'linear-gradient(90deg,#fbc531,#f0454c)' : 'linear-gradient(90deg,#22d37f,#22e3ff)';
      el.innerHTML = '<b>' + d.name + '</b><span class="v" style="color:' + (prob ? '#fbc531' : up ? '#ff7d86' : '#22d37f') + '">' + (prob ? '' : up ? '+' : '−') + Math.abs(d.pct).toFixed(1) + '%</span><div class="note">' + d.note + '</div><div class="track"><i style="background:' + col + ';left:0"></i></div>';
      box.appendChild(el); setTimeout(() => { el.querySelector('i').style.width = Math.max(2, w) + '%'; }, 150 + i * 100);
    });
    const ev = r.evidence, f = r.fit, tb = f.table.slice().sort((a, b) => a.aic - b.aic), dA = tb.length > 1 ? tb[1].aic - tb[0].aic : null, chips = [];
    chips.push('Best fit <b>' + f.best + '</b>'); if (dA != null) chips.push('ΔAIC to runner-up <b>' + dA.toFixed(1) + '</b>');
    chips.push('<b>' + (f.records || 0).toLocaleString('en-US') + '</b> similar historical trips'); if (f.relax && f.relax !== 'none') chips.push('sample: ' + f.relax);
    chips.push('<b>' + r.n.toLocaleString('en-US') + '</b> simulated journeys');
    if (ev && ev.r2 != null) chips.push('weather/peak regression R² <b>' + ev.r2.toFixed(2) + '</b>');
    chips.push('Engine <b>' + (r.engine === 'matlab' ? 'MATLAB' : 'Demo') + '</b>');
    $('evidence').innerHTML = chips.map((c) => '<span class="chip">' + c + '</span>').join('');
  }

  /* ---------- tabs ----------------------------------------------------------------------------------------------------------- */
  function moveInk(btn) { const ink = $('tabInk'); ink.style.width = btn.offsetWidth + 'px'; ink.style.transform = 'translateX(' + (btn.offsetLeft - 4) + 'px)'; }
  function activateTab(name, animate) {
    S.tab = name; document.querySelectorAll('.tab').forEach((b) => { const on = b.dataset.tab === name; b.classList.toggle('active', on); if (on) moveInk(b); });
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.id === 'pane-' + name));
    requestAnimationFrame(() => {
      const first = !S.paneAnimated[name]; S.paneAnimated[name] = true; if (!S.res) return; const dep = $('inTime').value.split(':').map(Number), dh = dep[0] + dep[1] / 60;
      if (name === 'uncertainty') { charts.dist.set(S.res, S.budget, first); charts.exceed.set(S.res, S.budget, first); }
      if (name === 'leave') charts.leave.set(S.res, dh, first);
      if (name === 'why') { charts.profile.set(S.res, dh, first); charts.conv.set(S.res, first); }
    });
  }

  /* ---------- popovers / context menu ----------------------------------------------------------------------------------------------- */
  function closePopovers() { $('popSettings').classList.add('hidden'); $('popProfile').classList.add('hidden'); $('ctxMenu').classList.add('hidden'); }
  function renderSaved() {
    const box = $('savedList'), saved = store.get('places', {}); box.innerHTML = '';
    [['home', 'Home', 'i-home'], ['work', 'Work', 'i-work']].forEach(([k, label, icon]) => {
      const p = saved[k], d = document.createElement('div'); d.className = 'sv'; d.innerHTML = '<svg class="ic"><use href="#' + icon + '"/></svg><div class="sv-t"><b>' + label + '</b><span>' + (p ? p.name : 'Not set') + '</span></div>' + (p ? '<button data-u="from">From</button><button data-u="to">To</button>' : '');
      d.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { setPoint(b.dataset.u, p, { fly: true }); closePopovers(); })); box.appendChild(d);
    });
    const f = document.createElement('div'); f.className = 'sv'; f.style.flexWrap = 'wrap';
    f.innerHTML = '<div class="sv-t" style="flex-basis:100%"><b style="font-size:12px">Save a place</b><span>Use the current start or destination</span></div>' +
      ['from', 'to'].map((k) => ['home', 'work'].map((t) => '<button data-s="' + k + ':' + t + '">' + (k === 'from' ? 'A' : 'B') + ' → ' + t[0].toUpperCase() + t.slice(1) + '</button>').join('')).join('');
    f.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { const [k, t] = b.dataset.s.split(':'); if (!S[k]) { toast('Set the ' + (k === 'from' ? 'start' : 'destination') + ' first.', 'err'); return; } const cur = store.get('places', {}); cur[t] = S[k]; store.set('places', cur); renderSaved(); toast('Saved as ' + t + '.', 'ok'); }));
    box.appendChild(f);
  }

  /* ---------- reports (MATLAB) ------------------------------------------------------------------------------------------------------------- */
  function requestReport(kind) {
    if (!Engine.isMatlab()) { toast('PDF reports are generated by MATLAB — run main.m.', 'err'); return; }
    toast('Rendering the PDF report in MATLAB…', '', 6000); Engine.bridge.sendEventToMATLAB('report', JSON.stringify({ kind }));
  }

  /* ---------- theme ----------------------------------------------------------------------------------------------------------------------------- */
  function setTheme(t) {
    S.theme = t; document.documentElement.setAttribute('data-theme', t); $('themeUse').setAttribute('href', t === 'dark' ? '#i-sun' : '#i-moon'); SC.map.setTheme(t); store.set('theme', t);
    setTimeout(() => Object.values(charts).forEach((c) => c.draw && c.draw()), 60);
  }

  /* Hyderabad add-on: use Hyderabad defaults, and ignore a remembered point that lies outside the city */
  function saneStart(kind) {
    const H = SC.hyd; if (!H) return store.get('last.' + kind, null);
    const p = store.get('last.' + kind, null); return p && H.inBox(p.lat, p.lon) ? p : H.defaults[kind];
  }

  /* ---------- boot ------------------------------------------------------------------------------------------------------------------------------------- */
  function boot() {
    const now = new Date(); const rounded = new Date(now.getTime() + (15 - (now.getMinutes() % 15)) * 60000);
    $('inDate').value = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()); $('inTime').value = pad2(rounded.getHours()) + ':' + pad2(rounded.getMinutes());
    SC.map.init({
      onPick: (kind, ll) => { $('pickBanner').classList.add('hidden'); document.querySelectorAll('.mini').forEach((m) => m.classList.remove('active')); pointFromLatLng(kind, ll); },
      onContext: (pt, ll) => { const m = $('ctxMenu'); m.style.left = Math.min(pt.x, window.innerWidth - 180) + 'px'; m.style.top = Math.min(pt.y, window.innerHeight - 100) + 'px'; m.classList.remove('hidden'); m.dataset.lat = ll.lat; m.dataset.lon = ll.lng; },
      onMarkerDrag: (kind, ll) => pointFromLatLng(kind, ll), onMoveStart: () => $('ctxMenu').classList.add('hidden')
    });
    setTheme(store.get('theme', 'dark'));
    // defaults: Bengaluru commute so the first run is one click
    setPoint('from', saneStart('from') || { name: 'Majestic, Bengaluru', lat: 12.9767, lon: 77.5713 }, { silent: true });
    setPoint('to', saneStart('to') || { name: 'Electronic City, Bengaluru', lat: 12.8452, lon: 77.6602 }, { silent: true }); SC.map.fit({ animate: false });
    S.res = null; $('stale').classList.add('hidden');

    attachSuggest($('inFrom'), $('sugFrom'), (it) => setPoint('from', { name: it.name + (it.sub ? ', ' + it.sub.split(',')[0] : ''), lat: it.lat, lon: it.lon }, { fly: !S.to }), { enterAnalyze: true });
    attachSuggest($('inTo'), $('sugTo'), (it) => setPoint('to', { name: it.name + (it.sub ? ', ' + it.sub.split(',')[0] : ''), lat: it.lat, lon: it.lon }, { fly: !S.from }), { enterAnalyze: true });
    attachSuggest($('search'), $('sugSearch'), (it, kind) => {
      const p = { name: it.name + (it.sub ? ', ' + it.sub.split(',')[0] : ''), lat: it.lat, lon: it.lon }; $('search').value = '';
      if (kind) setPoint(kind, p, { fly: true }); else { SC.map.flyTo(p.lat, p.lon, 15); if (!S.to) setPoint('to', p); else if (!S.from) setPoint('from', p); else toast('Hover a result and choose From or To to use it in the route.'); }
    }, { actions: true });

    $('btnAnalyze').addEventListener('click', analyze);
    $('btnSwap').addEventListener('click', () => { const a = S.from, b = S.to; setPoint('from', b, { silent: true }); setPoint('to', a, { silent: true }); });
    ['inDate', 'inTime'].forEach((id) => $(id).addEventListener('change', markDirty));
    document.querySelectorAll('.mini').forEach((m) => m.addEventListener('click', () => { const k = m.dataset.pick; SC.map.startPick(k); m.classList.add('active'); $('pickText').textContent = 'Click the map to set the ' + (k === 'from' ? 'start' : 'destination'); $('pickBanner').classList.remove('hidden'); }));
    $('pickCancel').addEventListener('click', () => { SC.map.cancelPick(); $('pickBanner').classList.add('hidden'); document.querySelectorAll('.mini').forEach((m) => m.classList.remove('active')); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('pickCancel').click(); closePopovers(); } });
    document.querySelectorAll('#ctxMenu button').forEach((b) => b.addEventListener('click', () => { const m = $('ctxMenu'); pointFromLatLng(b.dataset.ctx, { lat: +m.dataset.lat, lng: +m.dataset.lon }); m.classList.add('hidden'); }));
    document.addEventListener('mousedown', (e) => { if (!e.target.closest('.popover, #btnSettings, #btnProfile, #ctxMenu')) closePopovers(); });

    document.querySelectorAll('#dock .dk').forEach((b) => b.addEventListener('click', () => { b.classList.toggle('on'); SC.map.setLayer(b.dataset.layer, b.classList.contains('on')); }));
    document.querySelectorAll('#styles .st').forEach((b) => b.addEventListener('click', () => { document.querySelectorAll('#styles .st').forEach((x) => x.classList.toggle('on', x === b)); SC.map.setStyle(b.dataset.style); }));
    $('zIn').addEventListener('click', () => SC.map.zoom(1)); $('zOut').addEventListener('click', () => SC.map.zoom(-1)); $('zFit').addEventListener('click', () => SC.map.fit());
    $('btnTheme').addEventListener('click', () => setTheme(S.theme === 'dark' ? 'light' : 'dark'));
    $('btnSettings').addEventListener('click', () => { const p = $('popSettings'); const open = p.classList.contains('hidden'); closePopovers(); p.classList.toggle('hidden', !open); });
    $('btnProfile').addEventListener('click', () => { const p = $('popProfile'); const open = p.classList.contains('hidden'); closePopovers(); if (open) { renderSaved(); p.classList.remove('hidden'); } });
    document.querySelectorAll('.seg[data-set]').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); const k = seg.dataset.set, v = b.dataset.v; S.settings[k] = k === 'wx' ? v : parseFloat(v);
      if (S.res) { clearTimeout(S.setT); S.setT = setTimeout(analyze, 350); }
    })));
    document.querySelectorAll('[data-report]').forEach((b) => b.addEventListener('click', () => requestReport(b.dataset.report)));
    $('rcClose').addEventListener('click', () => hideCard(false)); $('rcOpen').addEventListener('click', () => { if (S.res) { showCard(S.res, false); } });
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => activateTab(b.dataset.tab)));
    $('budMinus').addEventListener('click', (e) => { onBudget(Math.max(1, S.budget - (e.shiftKey ? 5 : 1)), true); }); $('budPlus').addEventListener('click', (e) => { onBudget(S.budget + (e.shiftKey ? 5 : 1), true); });
    $('btnReplay').addEventListener('click', () => { charts.dist.set(S.res, S.budget, true); charts.exceed.set(S.res, S.budget, true); });
    let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { Object.values(charts).forEach((c) => c.draw && c.draw()); const a = document.querySelector('.tab.active'); if (a) moveInk(a); }, 120); });

    setBadge(); setTimeout(() => { if (!Engine.bridge) setBadge(); }, 900);
  }
  /* extension API for the Hyderabad add-on (js/hyd/) — exposes existing functions, changes none of them */
  SC.ui = { setPoint, analyze, showCard, hideCard, toast, buildReq, effectiveWeather, pointFromLatLng, resolveField, closePopovers, store, renderTiles, updateLate, markDirty };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.SC = window.SC || {});
