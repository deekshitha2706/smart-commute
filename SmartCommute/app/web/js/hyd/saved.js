/* SmartCommute / Hyderabad — saved places (Home, College, School, Office, any number of custom places)
 * Stored in the browser (localStorage 'sc.hyd.saved'), shown as quick-access chips in the planner and as hearts on the map.
 * One slot each for Home / College / School / Office; "Other" can be added as many times as needed.
 * Existing Home / Work entries of the old profile menu ('sc.places') are copied in once, never altered.                    */
(function (SC) {
  'use strict';
  const H = SC.hyd, esc = H.esc;
  const KINDS = [
    { k: 'home', label: 'Home', svg: '<path d="M4 11 12 4l8 7v8.5a.5.5 0 0 1-.5.5H15v-6H9v6H4.5a.5.5 0 0 1-.5-.5z"/>' },
    { k: 'college', label: 'College', svg: '<path d="m3 9 9-4.5L21 9l-9 4.5zM7 11.5V16c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-4.5M21 9v6"/>' },
    { k: 'school', label: 'School', svg: '<path d="M4 20V9l8-5 8 5v11zM9 20v-6h6v6M12 4V2"/>' },
    { k: 'office', label: 'Office', svg: '<rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 13h17"/>' },
    { k: 'other', label: 'Other', svg: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/>' }
  ];
  const KIND = Object.fromEntries(KINDS.map((x) => [x.k, x]));
  const svg = (k) => '<svg viewBox="0 0 24 24">' + (KIND[k] || KIND.other).svg + '</svg>';
  let list = H.store.get('saved', null), layer = null, dlg = null;

  function load() {
    if (list) return;
    list = [];
    try {                                                           // one-time import of the old profile-menu places
      const old = JSON.parse(localStorage.getItem('sc.places') || '{}');
      [['home', 'home'], ['work', 'office']].forEach(([from, kind]) => { const p = old[from]; if (p && H.inBox(p.lat, p.lon)) list.push({ id: kind, kind, label: KIND[kind].label, name: p.name, lat: p.lat, lon: p.lon }); });
    } catch (e) { /* ignore */ }
    persist();
  }
  const persist = () => H.store.set('saved', list);
  const get = (kind) => list.find((p) => p.kind === kind && kind !== 'other');

  function save(p) {                                               // p = {kind,label,name,lat,lon}
    if (!H.inBox(p.lat, p.lon)) { SC.ui.toast('Saved places must be inside Hyderabad.', 'err'); return false; }
    const item = { id: p.kind === 'other' ? 'o' + Date.now().toString(36) : p.kind, kind: p.kind, label: (p.label || KIND[p.kind].label).trim().slice(0, 24), name: p.name, lat: p.lat, lon: p.lon };
    if (p.kind !== 'other') list = list.filter((x) => x.kind !== p.kind);
    else if (p.id) list = list.filter((x) => x.id !== p.id);
    list.push(item); persist(); refresh(); return true;
  }
  function remove(id) { list = list.filter((x) => x.id !== id); persist(); refresh(); }

  /* ---------- search integration ------------------------------------------------------------------------------ */
  function search(qn) {
    const out = [];
    list.forEach((p) => {
      const hay = H.db.norm(p.label + ' ' + p.kind + ' ' + p.name);
      if (qn.length >= 2 && (hay.indexOf(qn) >= 0 || H.db.norm(p.label).startsWith(qn))) out.push({ name: p.label + ' — ' + p.name, sub: '', desc: 'Saved place', type: 'saved', lat: p.lat, lon: p.lon });
    });
    return out;
  }

  /* ---------- quick-access chips ----------------------------------------------------------------------------------- */
  function chips() {
    const box = document.getElementById('hydChips'); if (!box) return; box.innerHTML = '';
    KINDS.slice(0, 4).forEach((kd) => {
      const p = get(kd.k), b = document.createElement('button'); b.type = 'button'; b.className = 'sp-chip' + (p ? '' : ' empty'); b.dataset.kind = kd.k;
      b.title = p ? kd.label + ': ' + p.name + ' — click = destination, A = start' : 'Set your ' + kd.label.toLowerCase();
      b.innerHTML = svg(kd.k) + '<span>' + esc(kd.label) + '</span>' + (p ? '<i class="sp-a" data-as="from" title="Use as start">A</i>' : '');
      b.addEventListener('click', (e) => { if (!p) { openDialog({ kind: kd.k }); return; } use(p, e.target.dataset && e.target.dataset.as === 'from' ? 'from' : 'to'); });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); openDialog({ edit: p || null, kind: kd.k }); });
      box.appendChild(b);
    });
    list.filter((p) => p.kind === 'other').forEach((p) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sp-chip'; b.title = p.name + ' — click = destination, A = start, right-click = edit';
      b.innerHTML = svg('other') + '<span>' + esc(p.label) + '</span><i class="sp-a" data-as="from" title="Use as start">A</i>';
      b.addEventListener('click', (e) => use(p, e.target.dataset && e.target.dataset.as === 'from' ? 'from' : 'to'));
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); openDialog({ edit: p }); });
      box.appendChild(b);
    });
    const add = document.createElement('button'); add.type = 'button'; add.className = 'sp-chip sp-add'; add.title = 'Save another place'; add.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg><span>Add</span>';
    add.addEventListener('click', () => openDialog({ kind: 'other' })); box.appendChild(add);
  }
  function use(p, as) {
    SC.ui.setPoint(as, { name: p.label === p.name ? p.name : p.label + ' · ' + p.name, lat: p.lat, lon: p.lon }, { fly: true });
    SC.ui.toast((as === 'from' ? 'Start' : 'Destination') + ' set to ' + p.label, 'ok', 1800);
  }

  /* ---------- hearts on the map ------------------------------------------------------------------------------------ */
  function hearts() {
    const m = SC.map.getMap(); if (!m) return;
    if (!layer) { layer = L.layerGroup().addTo(m); }
    layer.clearLayers();
    list.forEach((p) => {
      const mk = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="hl hl-saved"><span class="hl-ic" style="--c:#22e3ff;color:#04121c">♥</span><span class="hl-t">' + esc(p.label) + '</span></div>' }), zIndexOffset: 300, keyboard: false });
      mk.on('click', () => H.layers.openCard({ n: p.label + ' — ' + p.name, t: 'saved', la: p.lat, lo: p.lon, a: '', x: null }));
      layer.addLayer(mk);
    });
  }
  function refresh() { chips(); hearts(); H.emit('saved', list); }

  /* ---------- dialog ---------------------------------------------------------------------------------------------- */
  function closeDialog() { if (dlg) { dlg.remove(); dlg = null; } }
  function openDialog(o) {
    o = o || {}; closeDialog(); const edit = o.edit || null;
    let kind = edit ? edit.kind : (o.kind || (o.place ? (get('home') ? (get('office') ? 'other' : 'office') : 'home') : 'home'));
    let pick = edit ? { name: edit.name, lat: edit.lat, lon: edit.lon } : (o.place || null);
    dlg = document.createElement('div'); dlg.id = 'hydDialog';
    dlg.innerHTML = '<div class="glass dlg" role="dialog" aria-label="Save a place"><h3>' + (edit ? 'Edit saved place' : 'Save a place') + '</h3><p>Stored only in this browser. Hyderabad places only.</p>' +
      '<label>Type</label><div class="kinds">' + KINDS.map((x) => '<button type="button" data-k="' + x.k + '">' + svg(x.k) + x.label + '</button>').join('') + '</div>' +
      '<div id="dlgName"><label>Name (optional)</label><input type="text" id="dlgLabel" maxlength="24" placeholder="e.g. Gym, Mom\'s house"></div>' +
      '<label>Place</label><div class="fld"><input type="text" id="dlgPlace" placeholder="Search Hyderabad — area, landmark, station…" autocomplete="off"><div class="suggest" id="dlgSug"></div></div>' +
      '<div class="quick"><button type="button" data-q="from">Use start</button><button type="button" data-q="to">Use destination</button><button type="button" data-q="me">Use my location</button></div>' +
      '<div class="picked" id="dlgPicked"></div>' +
      '<div class="foot"><div class="l"><button type="button" class="pri" id="dlgSave">Save</button><button type="button" id="dlgCancel">Cancel</button></div>' + (edit ? '<button type="button" class="del" id="dlgDel">Delete</button>' : '') + '</div></div>';
    document.body.appendChild(dlg);
    const $ = (id) => dlg.querySelector('#' + id), saveBtn = $('dlgSave'), picked = $('dlgPicked'), inp = $('dlgPlace');
    const showKind = () => { dlg.querySelectorAll('.kinds button').forEach((b) => b.classList.toggle('on', b.dataset.k === kind)); $('dlgName').style.display = kind === 'other' ? '' : 'none'; };
    const showPick = () => { picked.textContent = pick ? '✓ ' + pick.name : ''; saveBtn.disabled = !pick; if (pick) inp.value = pick.name; };
    dlg.querySelectorAll('.kinds button').forEach((b) => b.addEventListener('click', () => { kind = b.dataset.k; showKind(); }));
    if (edit && edit.kind === 'other') $('dlgLabel').value = edit.label;
    showKind(); showPick();
    const me = SC.state;
    dlg.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      const q = b.dataset.q;
      if (q === 'me') { if (H.loc.me && H.loc.insideCity()) { pick = { name: 'My current location', lat: H.loc.me.lat, lon: H.loc.me.lon }; SC.services.reverse(pick.lat, pick.lon).then((n) => { if (pick && pick.lat === H.loc.me.lat) { pick.name = n; showPick(); } }); } else SC.ui.toast('Turn on My location first (map toolbar, right side).', 'err'); }
      else { const p = me[q]; if (p && p.name !== 'My location') pick = { name: p.name, lat: p.lat, lon: p.lon }; else SC.ui.toast('That field is empty.', 'err'); }
      showPick();
    }));
    // autocomplete
    const sug = $('dlgSug'); let timer = 0, items = [], seq = 0;
    const draw = () => { sug.innerHTML = ''; if (!items.length) { sug.classList.remove('open'); return; }
      items.forEach((it) => { const d = document.createElement('div'); d.className = 'sg'; d.innerHTML = '<span class="sg-ico"></span><div class="sg-t"><b></b><span></span></div>'; d.querySelector('b').textContent = it.name; d.querySelector('.sg-t span').textContent = it.desc || '';
        const t = H.types[it.type] || { color: '#8fa3d1', glyph: '•' }, ic = d.querySelector('.sg-ico'); ic.style.background = t.color; ic.textContent = t.glyph || '•';
        d.addEventListener('mousedown', (e) => { e.preventDefault(); pick = { name: it.name, lat: it.lat, lon: it.lon }; sug.classList.remove('open'); showPick(); }); sug.appendChild(d); });
      sug.classList.add('open'); };
    inp.addEventListener('input', () => { pick = null; saveBtn.disabled = true; picked.textContent = ''; clearTimeout(timer); const q = inp.value.trim(); if (q.length < 2) { sug.classList.remove('open'); return; }
      timer = setTimeout(async () => { const my = ++seq; const r = await SC.services.search(q, null); if (my === seq) { items = r.filter((x) => x.type !== 'saved' && x.type !== 'me'); draw(); } }, 220); });
    inp.addEventListener('blur', () => setTimeout(() => sug.classList.remove('open'), 120));
    $('dlgCancel').addEventListener('click', closeDialog);
    dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) closeDialog(); });
    saveBtn.addEventListener('click', () => {
      if (!pick) return;
      const label = kind === 'other' ? ($('dlgLabel').value.trim() || pick.name.split(',')[0]) : KIND[kind].label;
      if (save({ kind, label, name: pick.name, lat: pick.lat, lon: pick.lon, id: edit && edit.kind === 'other' && kind === 'other' ? edit.id : null })) {
        if (edit && edit.kind !== kind && edit.kind !== 'other') remove(edit.id);
        closeDialog(); SC.ui.toast('Saved as ' + label + '.', 'ok', 2000);
      }
    });
    if (edit) $('dlgDel').addEventListener('click', () => { remove(edit.id); closeDialog(); SC.ui.toast('Removed.', '', 1600); });
    setTimeout(() => inp.focus(), 50);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dlg) closeDialog(); });

  function init() { load(); refresh(); }
  H.saved = { init, list: () => list.slice(), get, save, remove, search, openDialog, refresh, KINDS };
})(window.SC = window.SC || {});
