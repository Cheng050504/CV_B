/* CV editor: state, storage, panels, live preview and exports.
   The CV is plain JSON (see CVEngine.newCV); everything renders from it. */
(function () {
  'use strict';

  const E = window.CVEngine;
  const META = window.CV_META;
  const CFG = window.EDITOR_CONFIG || {};
  const T = E.SECTION_TYPES;
  const esc = E.esc;
  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

  const SPARKLE = '<svg class="sparkle" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0c.4 3.9 2.6 6.4 8 8-5.4 1.6-7.6 4.1-8 8-.4-3.9-2.6-6.4-8-8 5.4-1.6 7.6-4.1 8-8Z"/></svg>';
  const GRIP = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><g fill="currentColor"><circle cx="5" cy="3" r="1.2"/><circle cx="9" cy="3" r="1.2"/><circle cx="5" cy="7" r="1.2"/><circle cx="9" cy="7" r="1.2"/><circle cx="5" cy="11" r="1.2"/><circle cx="9" cy="11" r="1.2"/></g></svg>';
  const EYE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>';
  const EYE_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const SWATCHES = ['#2F5D8A', '#1F3A5F', '#3E7C6F', '#2E7D5B', '#E9785B', '#B23A48', '#7A6FBF', '#8A6A4F', '#4A5A6A', '#252525'];

  /* ── Storage: all CVs live in this browser ─────────────── */
  const STORE_KEY = 'cvb_cvs_v2';
  const LEGACY_KEY = 'cv_builder_draft_v1';
  let store = { currentId: null, cvs: {} };

  function loadStore() {
    try { store = JSON.parse(localStorage.getItem(STORE_KEY)) || store; } catch (_) { /* private mode */ }
    if (!store.cvs || typeof store.cvs !== 'object') store = { currentId: null, cvs: {} };
    if (!Object.keys(store.cvs).length) {
      const migrated = migrateLegacy();
      const cv = migrated || E.newCV(META.templates[CFG.requestedTemplate] || META.templates.clean);
      store.cvs[cv.id] = cv;
      store.currentId = cv.id;
    }
    if (!store.cvs[store.currentId]) store.currentId = Object.keys(store.cvs)[0];
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
      setStatus('Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setStatus('Could not save in this browser. Download a backup file.');
    }
  }

  /* The previous editor kept one finance-style draft; carry it over once. */
  function migrateLegacy() {
    let old;
    try { old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null'); } catch (_) { return null; }
    if (!old || !old.simple) return null;
    const s = old.simple, r = old.repeats || {};
    const cv = E.newCV(META.templates.classic);
    cv.name = 'My CV (from before)';
    Object.assign(cv.personal, { firstName: s.first_name || '', lastName: s.last_name || '', email: s.email || '', phone: s.phone || '', location: s.physical_address || '' });
    const col = (grp, k) => (r[grp] && r[grp][k]) || [];
    const by = ty => cv.sections.find(x => x.type === ty);
    const ed = col('ed', 'school').map((school, i) => ({ id: E.uid(), org: school, degree: [col('ed', 'degree_type')[i] && 'Bachelor of ' + col('ed', 'degree_type')[i], col('ed', 'field')[i]].filter(Boolean).join(' in '),
      location: col('ed', 'city')[i] || '', start: col('ed', 'start')[i] || '', end: col('ed', 'end')[i] || '', grade: col('ed', 'gpa')[i] ? 'GPA ' + col('ed', 'gpa')[i] : '',
      description: [col('ed', 'honors')[i], col('ed', 'courses')[i] && 'Coursework: ' + col('ed', 'courses')[i]].filter(Boolean).join('\n') }));
    if (ed.length) by('education').items = ed;
    const ex = col('e', 'company').map((org, i) => ({ id: E.uid(), org, role: [col('e', 'title')[i], col('e', 'group')[i]].filter(Boolean).join(', '),
      location: col('e', 'city')[i] || '', start: col('e', 'start')[i] || '', end: col('e', 'end')[i] || '', description: col('e', 'summary')[i] || '' }));
    if (ex.length) by('experience').items = ex;
    by('skills').items = String(s.technical_skills || '').split(',').map(t => t.trim()).filter(Boolean).map(name => ({ id: E.uid(), name, level: '' }));
    by('languages').items = String(s.languages || '').split(',').map(t => t.trim()).filter(Boolean).map(name => ({ id: E.uid(), name, level: 'Fluent' }));
    cv.letter = Object.assign(cv.letter, { recipient: s.recruiter_name || '', recipientTitle: s.recruiter_title || '', company: s.company_name || '',
      address: s.recruiter_address || '', role: s.position_name || '', body: [s.background_summary, s.skill_summary, s.firm_track_record].filter(Boolean).join('\n\n') });
    return cv;
  }

  const cv = () => store.cvs[store.currentId];

  /* ── AI settings: the visitor's own key stays in this browser ── */
  const AI_KEY = 'cvb_ai_v1';
  const PROVIDERS = CFG.aiProviders || [];
  function loadAi() {
    try { return JSON.parse(localStorage.getItem(AI_KEY) || sessionStorage.getItem(AI_KEY) || 'null') || {}; } catch (_) { return {}; }
  }
  let ai = loadAi();
  function saveAi(next) {
    ai = next || {};
    try {
      localStorage.removeItem(AI_KEY);
      sessionStorage.removeItem(AI_KEY);
      if (ai.key) (ai.remember ? localStorage : sessionStorage).setItem(AI_KEY, JSON.stringify(ai));
    } catch (_) { /* private mode: key lives in memory for this visit */ }
  }
  const aiReady = () => !!(ai.key || CFG.serverAi);
  const providerOf = id => PROVIDERS.find(p => p.id === id) || PROVIDERS[0] || { id: '', label: 'AI', model: '' };
  let aiDraft = null, aiMsg = null, skillIdeas = [], tplFilter = 'All';

  /* ── Undo / redo ───────────────────────────────────────── */
  let undoStack = [], redoStack = [], lastSnap = null, snapTimer = null;
  function snapshotSoon() {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(snapshotNow, 500);
  }
  function snapshotNow() {
    clearTimeout(snapTimer);
    const s = JSON.stringify(cv());
    if (s === lastSnap) return;
    if (lastSnap) { undoStack.push(lastSnap); if (undoStack.length > 100) undoStack.shift(); }
    redoStack = [];
    lastSnap = s;
    updateUndoButtons();
  }
  function restore(s) {
    store.cvs[store.currentId] = JSON.parse(s);
    lastSnap = s;
    persist(); renderAll();
  }
  function undo() { snapshotNow(); if (!undoStack.length) return; redoStack.push(lastSnap); restore(undoStack.pop()); updateUndoButtons(); }
  function redo() { if (!redoStack.length) return; undoStack.push(lastSnap); restore(redoStack.pop()); updateUndoButtons(); }
  function resetHistory() { undoStack = []; redoStack = []; lastSnap = JSON.stringify(cv()); updateUndoButtons(); }
  function updateUndoButtons() { $('#btnUndo').disabled = !undoStack.length; $('#btnRedo').disabled = !redoStack.length; }

  /* ── Change pipeline ───────────────────────────────────── */
  let saveTimer = null;
  function changed(opts) {
    opts = opts || {};
    cv().updatedAt = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 300);
    snapshotSoon();
    schedulePreview();
    updateStrength();
    if (opts.nav) renderNav();
    if (opts.panel) renderPanel();
  }

  /* ── Preview ───────────────────────────────────────────── */
  let doc = 'cv', previewQueued = false;
  const paper = $('#paper'), scaleBox = $('#paperScale'), stage = $('#stage');

  function schedulePreview() {
    if (previewQueued) return;
    previewQueued = true;
    requestAnimationFrame(() => { previewQueued = false; drawPreview(); });
  }

  function drawPreview() {
    const html = doc === 'letter' ? E.renderLetter(cv(), Object.assign({ ghost: true }, META)) : E.render(cv(), Object.assign({ ghost: true }, META));
    paper.innerHTML = html;
    fitPreview();
  }

  function fitPreview() {
    const page = E.PAGE[cv().style.page] || E.PAGE.A4;
    const avail = stage.clientWidth - parseFloat(getComputedStyle(stage).paddingLeft) * 2;
    const scale = Math.min(1, avail / page.w);
    const cvEl = paper.firstElementChild;
    const h = cvEl ? cvEl.scrollHeight : page.h;
    const pages = Math.max(1, Math.ceil((h - 4) / page.h));
    paper.style.width = page.w + 'px';
    paper.style.transform = `scale(${scale})`;
    scaleBox.style.width = page.w * scale + 'px';
    scaleBox.style.height = pages * page.h * scale + 'px';
    paper.style.height = pages * page.h + 'px';
    $$('.page-break', paper).forEach(n => n.remove());
    for (let i = 1; i < pages; i++) {
      const m = document.createElement('div');
      m.className = 'page-break';
      m.style.top = i * page.h + 'px';
      m.innerHTML = `<span>Page ${i + 1}</span>`;
      paper.appendChild(m);
    }
    const pc = $('#pageCount');
    pc.hidden = pages < 2;
    pc.textContent = `${pages} pages`;
  }

  function switchTemplateAnimated(fn) {
    if (REDUCE) { fn(); return; }
    paper.classList.add('is-switching');
    setTimeout(() => { fn(); requestAnimationFrame(() => paper.classList.remove('is-switching')); }, 180);
  }

  function showDoc(d) {
    if (d === doc) return;
    doc = d;
    $$('.doc-tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.doc === d)));
    switchTemplateAnimated(drawPreview);
  }

  /* ── Left nav ──────────────────────────────────────────── */
  let active = 'design';

  function navItem(id, label, extra) {
    return `<div class="sec-row ${active === id ? 'active' : ''} ${extra && extra.hidden ? 'is-hidden' : ''}" data-id="${esc(id)}" ${extra && extra.drag ? 'draggable="true"' : ''}>
      ${extra && extra.drag ? `<span class="grip" aria-hidden="true">${GRIP}</span>` : '<span class="grip-space"></span>'}
      <button type="button" class="sec-link" data-open="${esc(id)}">${esc(label)}</button>
      ${extra && extra.drag ? `<button type="button" class="eye" data-eye="${esc(id)}" aria-label="${extra.hidden ? 'Show' : 'Hide'} ${esc(label)}" title="${extra.hidden ? 'Show on CV' : 'Hide from CV'}">${extra.hidden ? EYE_OFF : EYE}</button>` : ''}
    </div>`;
  }

  function renderNav() {
    const c = cv();
    $('#cvName').textContent = c.name || 'My CV';
    $('#secNav').innerHTML = `
      ${navItem('design', 'Design')}
      ${navItem('personal', 'Personal details')}
      <div class="sec-list" id="secList">${c.sections.map(s => navItem(s.id, s.title, { drag: true, hidden: s.hidden })).join('')}</div>
      <button type="button" class="sec-add" data-open="add">+ Add section</button>
      ${navItem('letter', 'Cover letter')}
      ${navItem('ai', 'AI assistant')}`;
    $('.sec-row[data-id="ai"]').classList.toggle('ai-on', aiReady());
    enableSort($('#secList'), '.sec-row', (from, to) => {
      const arr = cv().sections;
      arr.splice(to, 0, arr.splice(from, 1)[0]);
      changed({ nav: true });
    });
  }

  /* ── Strength meter ────────────────────────────────────── */
  let strengthTipTarget = null;
  function updateStrength() {
    const r = E.strength(cv());
    $('#strengthScore').textContent = r.score + '%';
    $('#strengthBar').style.width = r.score + '%';
    $('#strength').classList.toggle('is-great', r.score >= 90);
    const tip = r.tips[0];
    strengthTipTarget = tip ? tip.go : null;
    $('#strengthTip').textContent = tip ? 'Next: ' + tip.tip : 'Looking great. Ready to download.';
  }

  /* ── Panels ────────────────────────────────────────────── */
  const panel = $('#panel');

  function open(id, opts) {
    active = id;
    if (id === 'letter') showDoc('letter');
    else if (id !== 'design' && id !== 'add' && id !== 'ai') showDoc('cv');
    if (id === 'ai') { aiDraft = null; aiMsg = null; }
    renderNav();
    renderPanel(opts);
    closePreview();
    if (!opts || !opts.keepScroll) window.scrollTo({ top: 0, behavior: REDUCE ? 'auto' : 'smooth' });
  }

  function renderPanel(opts) {
    let html;
    const sec = cv().sections.find(s => s.id === active);
    if (active === 'design') html = designPanel();
    else if (active === 'personal') html = personalPanel();
    else if (active === 'letter') html = letterPanel();
    else if (active === 'add') html = addPanel();
    else if (active === 'ai') html = aiPanel();
    else if (sec) html = sectionPanel(sec, opts && opts.openItem);
    else { active = 'personal'; html = personalPanel(); }
    panel.innerHTML = `<div class="panel-card">${html}</div>`;
    if (!REDUCE) panel.firstElementChild.classList.add('panel-in');
    if (sec) enableSort($('.items', panel), '.item-card', (from, to) => {
      sec.items.splice(to, 0, sec.items.splice(from, 1)[0]);
      changed({ panel: true });
    });
    $$('.cv-mini[data-template]', panel).forEach(drawMini);
  }

  const field = (label, attrs, value, kind, opts) => {
    if (kind === 'textarea') return `<label class="${opts && opts.full ? 'full' : ''}">${esc(label)}<textarea ${attrs} placeholder="${esc((opts && opts.ph) || '')}" rows="${(opts && opts.rows) || 4}">${esc(value)}</textarea>${(opts && opts.after) || ''}</label>`;
    if (kind === 'select') return `<label>${esc(label)}<select ${attrs}>${opts.options.map(o => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o || 'Not shown')}</option>`).join('')}</select></label>`;
    return `<label class="${opts && opts.full ? 'full' : ''}">${esc(label)}<input ${attrs} value="${esc(value)}" placeholder="${esc((opts && opts.ph) || '')}" ${(opts && opts.type) ? `type="${opts.type}"` : ''}></label>`;
  };

  function panelHead(eyebrow, title, sub) {
    return `<div class="panel-head"><span class="step-badge">${esc(eyebrow)}</span><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;
  }

  function designPanel() {
    const st = cv().style;
    const tpls = (META.order || Object.keys(META.templates)).map(id => META.templates[id]);
    return `${panelHead('Design', 'Make it yours', 'Pick a template, then tune the colour, font and spacing. Your content stays the same.')}
      <div class="panel-body">
        <div class="field-group"><div class="field-group-label">Template <span class="hint-inline">${tpls.length} to choose from</span></div>
          <div class="tpl-filter">${['All', ...(META.categories || [])].map(c => `<button type="button" class="pill" aria-pressed="${tplFilter === c}" data-tpl-filter="${esc(c)}">${esc(c)}</button>`).join('')}</div>
          <div class="tpl-pick">${tpls.filter(t => tplFilter === 'All' || t.category === tplFilter || t.id === st.template).map(t => `
            <button type="button" class="tpl-pick-card ${st.template === t.id ? 'selected' : ''}" data-template="${esc(t.id)}" aria-pressed="${st.template === t.id}">
              <span class="cv-mini" data-template="${esc(t.id)}"></span>
              <span class="tpl-pick-name">${esc(t.name)}</span>
            </button>`).join('')}</div>
        </div>
        <div class="field-group"><div class="field-group-label">Colour</div>
          <div class="swatches">${[...new Set([META.templates[st.template].accent, ...SWATCHES])].map(c => `
            <button type="button" class="swatch ${st.accent.toLowerCase() === c.toLowerCase() ? 'selected' : ''}" data-accent="${c}" style="--c:${c}" aria-label="Colour ${c}"></button>`).join('')}
            <label class="swatch swatch-custom" title="Pick any colour"><input type="color" id="accentPicker" value="${esc(st.accent)}" aria-label="Custom colour"></label>
          </div>
        </div>
        <div class="field-group"><div class="field-group-label">Font</div>
          <div class="seg seg-fonts">${(META.fontOrder || Object.keys(META.fonts)).map(id => [id, META.fonts[id]]).map(([id, f]) => `
            <button type="button" class="seg-btn ${st.font === id ? 'on' : ''}" data-font="${id}" style="font-family:${f.head}">${esc(f.label)}</button>`).join('')}</div>
        </div>
        <div class="grid">
          <div class="field-group"><div class="field-group-label">Text size</div>
            <div class="seg">${[['s', 'Small'], ['m', 'Medium'], ['l', 'Large']].map(([v, l]) => `<button type="button" class="seg-btn ${st.size === v ? 'on' : ''}" data-size="${v}">${l}</button>`).join('')}</div></div>
          <div class="field-group"><div class="field-group-label">Spacing</div>
            <div class="seg">${[['compact', 'Tight'], ['normal', 'Normal'], ['relaxed', 'Airy']].map(([v, l]) => `<button type="button" class="seg-btn ${st.spacing === v ? 'on' : ''}" data-spacing="${v}">${l}</button>`).join('')}</div></div>
          <div class="field-group"><div class="field-group-label">Paper</div>
            <div class="seg">${['A4', 'Letter'].map(v => `<button type="button" class="seg-btn ${st.page === v ? 'on' : ''}" data-page="${v}">${v}</button>`).join('')}</div></div>
          <div class="field-group"><div class="field-group-label">Photo</div>
            <div class="seg">${[[true, 'Show'], [false, 'Hide']].map(([v, l]) => `<button type="button" class="seg-btn ${!!st.photo === v ? 'on' : ''}" data-photo="${v}">${l}</button>`).join('')}</div></div>
        </div>
      </div>
      <div class="panel-foot"><span class="spacer"></span><button type="button" class="btn primary" data-open="personal">Next: your details <span class="arrow">→</span></button></div>`;
  }

  function personalPanel() {
    const p = cv().personal, st = cv().style;
    const f = (k, label, ph, opts) => field(label, `data-p="${k}"`, p[k] || '', 'text', Object.assign({ ph }, opts));
    return `${panelHead('Personal details', 'Tell us about you', 'These appear at the top of your CV and cover letter.')}
      <div class="panel-body">
        <div class="photo-row">
          <div class="photo-preview">${p.photo ? `<img src="${esc(p.photo)}" alt="Your photo">` : '<span>Photo</span>'}</div>
          <div>
            <div class="photo-actions">
              <button type="button" class="btn sm" id="btnPhoto">${p.photo ? 'Change photo' : 'Add a photo'}</button>
              ${p.photo ? '<button type="button" class="btn ghost sm" id="btnPhotoRemove">Remove</button>' : ''}
            </div>
            <p class="hint">${st.photo ? 'Optional. Many UK and US employers prefer no photo.' : 'This template is set to hide photos. Turn them on in Design.'}</p>
          </div>
        </div>
        <div class="grid">
          ${f('firstName', 'First name', 'Alexandra')}
          ${f('lastName', 'Last name', 'Chen')}
          ${f('headline', 'Headline', 'Equity Research Analyst', { full: true })}
          ${f('email', 'Email', 'alex@example.com', { type: 'email' })}
          ${f('phone', 'Phone', '+44 7700 900123', { type: 'tel' })}
          ${f('location', 'Location', 'London, UK')}
          ${f('linkedin', 'LinkedIn', 'linkedin.com/in/you')}
          ${f('website', 'Website or portfolio', 'yourname.com', { full: true })}
        </div>
      </div>
      <div class="panel-foot"><span class="spacer"></span>${nextButton('personal')}</div>`;
  }

  function nextButton(id) {
    const order = ['personal', ...cv().sections.filter(s => !s.hidden).map(s => s.id), 'letter'];
    const i = order.indexOf(id);
    const next = order[i + 1];
    if (!next) return `<button type="button" class="btn primary" data-download="pdf">Download PDF</button>`;
    const label = next === 'letter' ? 'Cover letter' : (cv().sections.find(s => s.id === next) || {}).title;
    return `<button type="button" class="btn primary" data-open="${esc(next)}">Next: ${esc(label)} <span class="arrow">→</span></button>`;
  }

  function aiChips(kind) {
    if (kind === 'desc') return `<span class="ai-row"><button type="button" class="ai-chip" data-ai="bullets">${SPARKLE} Write it for me</button><button type="button" class="ai-chip" data-ai="improve">${SPARKLE} Improve this</button><button type="button" class="ai-chip" data-ai="concise">${SPARKLE} Make it more concise</button></span>`;
    if (kind === 'summary') return `<span class="ai-row"><button type="button" class="ai-chip" data-ai="summary">${SPARKLE} Help me write this</button><button type="button" class="ai-chip" data-ai="improve">${SPARKLE} Improve this</button></span>`;
    return `<span class="ai-row"><button type="button" class="ai-chip" data-ai="improve">${SPARKLE} Improve this</button><button type="button" class="ai-chip" data-ai="concise">${SPARKLE} Make it more concise</button></span>`;
  }

  function itemLabel(sec, item) {
    const def = T[sec.type];
    const t = def.title_of ? def.title_of(item) : item.name;
    const s = def.sub_of ? def.sub_of(item) : '';
    return { title: t || 'New entry', sub: s };
  }

  function sectionPanel(sec, openItemId) {
    const def = T[sec.type] || T.custom;
    let body;
    if (def.single) {
      const item = sec.items[0] || (sec.items[0] = { id: E.uid(), text: '' });
      body = `<div class="grid">${field('Profile', `data-item="${item.id}" data-k="text"`, item.text || '', 'textarea', { full: true, rows: 6, ph: def.fields[0][3], after: aiChips('summary') })}</div>`;
    } else if (def.tags) {
      body = `<div class="items tag-items">${sec.items.map(item => `
          <div class="item-card tag-row" data-item-id="${item.id}" draggable="true">
            <span class="grip" aria-hidden="true">${GRIP}</span>
            <input data-item="${item.id}" data-k="name" value="${esc(item.name || '')}" placeholder="${esc(def.fields[0][3])}" aria-label="${esc(def.fields[0][1])}">
            ${def.fields[1] ? `<select data-item="${item.id}" data-k="level" aria-label="Level">${def.fields[1][3].map(o => `<option value="${esc(o)}" ${o === (item.level || '') ? 'selected' : ''}>${esc(o || 'Level')}</option>`).join('')}</select>` : ''}
            <button type="button" class="icon-btn remove" data-del-item="${item.id}" aria-label="Remove">✕</button>
          </div>`).join('')}</div>
        <input class="quick-add" id="quickAdd" placeholder="Type ${esc(def.fields[0][1].toLowerCase())} and press Enter. Separate several with commas.">
        ${sec.type === 'skills' ? `<div class="ai-row"><button type="button" class="ai-chip" data-ai="skills">${SPARKLE} Suggest skills</button></div>
          ${skillIdeas.length ? `<div class="ideas"><span class="hint">Tap to add:</span>${skillIdeas.map(n => `<button type="button" class="idea" data-add-skill="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div>` : ''}` : ''}`;
    } else {
      const openId = openItemId || (sec.items.length === 1 ? sec.items[0].id : null);
      body = `<div class="items">${sec.items.map((item, idx) => {
        const lab = itemLabel(sec, item);
        const isOpen = item.id === openId;
        return `<div class="item-card ${isOpen ? 'open' : ''}" data-item-id="${item.id}" draggable="true">
          <div class="item-head">
            <span class="grip" aria-hidden="true">${GRIP}</span>
            <button type="button" class="item-toggle" data-toggle="${item.id}" aria-expanded="${isOpen}">
              <span class="item-title">${esc(lab.title)}</span>${lab.sub ? `<span class="item-sub">${esc(lab.sub)}</span>` : ''}
            </button>
            <button type="button" class="icon-btn" data-move="${item.id}" data-dir="-1" aria-label="Move up" ${idx === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="icon-btn" data-move="${item.id}" data-dir="1" aria-label="Move down" ${idx === sec.items.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="icon-btn remove" data-del-item="${item.id}" aria-label="Remove">✕</button>
          </div>
          <div class="item-body"><div class="grid">${def.fields.map(([k, label, kind, ph]) =>
            kind === 'textarea'
              ? field(label, `data-item="${item.id}" data-k="${k}"`, item[k] || '', 'textarea', { full: true, ph, after: k === 'description' && ['experience', 'projects', 'volunteering', 'custom'].includes(sec.type) ? aiChips('desc') : '' })
              : field(label, `data-item="${item.id}" data-k="${k}"`, item[k] || '', 'text', { ph })).join('')}</div></div>
        </div>`;
      }).join('')}</div>`;
    }
    return `${panelHead(sec.hidden ? 'Hidden from your CV' : 'Section', sec.title, def.hint)}
      <div class="panel-body">
        <div class="sec-tools">
          <label class="sec-title-edit">Section title<input data-sec-title value="${esc(sec.title)}"></label>
          <button type="button" class="btn ghost sm" data-eye="${sec.id}">${sec.hidden ? EYE + ' Show on CV' : EYE_OFF + ' Hide'}</button>
          <button type="button" class="btn ghost sm danger" data-del-sec="${sec.id}">Delete</button>
        </div>
        ${body}
        ${def.single || def.tags ? '' : `<button type="button" class="btn add-btn" data-add-item>+ ${esc(def.add || 'Add entry')}</button>`}
      </div>
      <div class="panel-foot"><span class="spacer"></span>${nextButton(sec.id)}</div>`;
  }

  function addPanel() {
    const have = new Set(cv().sections.map(s => s.type));
    const blurbs = { summary: 'A short introduction at the top', experience: 'Jobs, internships and placements', education: 'Degrees, schools and courses',
      projects: 'Things you built or led', volunteering: 'Unpaid and community work', skills: 'Tools and strengths', languages: 'Languages you speak',
      certifications: 'Licences and certificates', awards: 'Prizes and scholarships', interests: 'What you do for fun', custom: 'Anything else, with your own title' };
    return `${panelHead('Add a section', 'What else should people know?', 'Pick a section to add. You can rename, hide or reorder it later.')}
      <div class="panel-body"><div class="add-grid">${Object.keys(T).filter(ty => ty === 'custom' || !have.has(ty)).map(ty => `
        <button type="button" class="add-card" data-new-sec="${ty}"><b>${esc(T[ty].title)}</b><span>${esc(blurbs[ty] || '')}</span></button>`).join('')}
      </div></div>`;
  }

  function aiPanel() {
    if (!aiDraft) aiDraft = { provider: ai.provider || (PROVIDERS[0] || {}).id, key: ai.key || '', model: ai.model || '', remember: ai.remember !== false };
    const cur = providerOf(aiDraft.provider);
    const connected = ai.key ? providerOf(ai.provider) : null;
    const status = connected
      ? `<p class="ai-status ok">✓ Connected to ${esc(connected.label)}${ai.model ? ` (${esc(ai.model)})` : ''}</p>`
      : (CFG.serverAi ? '<p class="ai-status ok">✓ AI is switched on for this site. You can also use your own key.</p>' : '<p class="ai-status">Not set up yet. Add a key to turn on the ✨ buttons.</p>');
    return `${panelHead('AI assistant', 'Let AI help with the words', 'Connect your own AI account. You pay the provider directly for what you use.')}
      <div class="panel-body">
        ${status}
        ${aiMsg ? `<p class="ai-msg ${aiMsg.ok ? 'ok' : 'bad'}" role="status">${esc(aiMsg.text)}</p>` : ''}
        <div class="field-group"><div class="field-group-label">Provider</div>
          <div class="seg seg-wrap">${PROVIDERS.map(p => `<button type="button" class="seg-btn ${p.id === cur.id ? 'on' : ''}" data-ai-provider="${esc(p.id)}">${esc(p.label)}</button>`).join('')}</div>
        </div>
        <div class="grid">
          <label class="full">API key
            <span class="key-row"><input id="aiKey" type="password" autocomplete="off" spellcheck="false" value="${esc(aiDraft.key)}" placeholder="${esc(cur.key_hint)}">
            <button type="button" class="btn ghost sm" id="aiShowKey">Show</button></span>
            <span class="hint">Don't have one? <a href="${esc(cur.key_url)}" target="_blank" rel="noopener">Get a ${esc(cur.label)} key</a></span>
          </label>
          <label class="full"><span>Model <span class="hint-inline">(optional)</span></span><input id="aiModel" value="${esc(aiDraft.model)}" placeholder="${esc(cur.model)}" spellcheck="false"></label>
          <label class="check full"><input type="checkbox" id="aiRemember" ${aiDraft.remember ? 'checked' : ''}> Remember my key on this device</label>
        </div>
        <div class="ai-actions">
          <button type="button" class="btn primary" id="aiSave">Save and test</button>
          ${ai.key ? '<button type="button" class="btn ghost sm danger" id="aiForget">Forget my key</button>' : ''}
        </div>
        <p class="hint privacy">Your key is kept only in this browser. When you ask for help it goes over HTTPS through our server to ${esc(cur.label)} for that one request. We never save or log it.</p>
        <div class="field-group job-group"><div class="field-group-label">Tailor to a job <span class="hint-inline">(optional)</span></div>
          ${field('Job advert', 'data-job', cv().job || '', 'textarea', { full: true, rows: 6, ph: 'Paste the job advert here. AI will tailor your profile, achievements, skills and cover letter to it.' })}
        </div>
        <div class="ai-can"><b>Where you'll find AI help</b>
          <ul><li>Profile: write it for you, or improve yours</li><li>Experience and projects: turn rough notes into achievements, improve or shorten them</li><li>Skills: suggest skills you may have missed</li><li>Cover letter: draft it from your CV</li></ul>
        </div>
      </div>`;
  }

  async function saveAiSettings(btn) {
    const draft = { provider: aiDraft.provider, key: aiDraft.key.trim(), model: aiDraft.model.trim(), remember: aiDraft.remember };
    if (!draft.key) { aiMsg = { ok: false, text: 'Paste your API key first.' }; renderPanel({ keepScroll: true }); return; }
    btn.disabled = true;
    btn.textContent = 'Testing…';
    try {
      await postJSON('/api/llm/test', {}, draft);
      saveAi(draft);
      aiMsg = { ok: true, text: 'It works. Look for the ✨ buttons as you write.' };
      renderNav();
    } catch (err) {
      aiMsg = { ok: false, text: err.message };
    }
    renderPanel();
  }

  function letterPanel() {
    const l = cv().letter;
    const f = (k, label, ph, opts) => field(label, `data-l="${k}"`, l[k] || '', 'text', Object.assign({ ph }, opts));
    const chips = `<span class="ai-row"><button type="button" class="ai-chip" data-ai="letter">${SPARKLE} Write it for me</button></span>`;
    return `${panelHead('Cover letter', 'A letter that matches your CV', 'It uses your details and design automatically.')}
      <div class="panel-body"><div class="grid">
        ${f('role', 'Job you are applying for', 'Investment Banking Analyst', { full: true })}
        ${f('company', 'Company', 'Goldman Sachs')}
        ${f('recipient', 'Recipient name', 'Jane Smith')}
        ${f('recipientTitle', 'Recipient title', 'Head of Recruiting')}
        ${f('address', 'Company address', 'Plumtree Court, London')}
        ${field('Your letter', 'data-l="body"', l.body || '', 'textarea', { full: true, rows: 12, ph: 'Leave a blank line between paragraphs.', after: chips })}
        ${f('signoff', 'Sign-off', 'Kind regards,')}
      </div></div>
      <div class="panel-foot"><span class="spacer"></span><button type="button" class="btn primary" data-download="pdf">Download PDF</button></div>`;
  }

  /* ── Panel events (delegated) ──────────────────────────── */
  panel.addEventListener('input', e => {
    const t = e.target, c = cv();
    if (t.id === 'aiKey') { aiDraft.key = t.value; return; }
    if (t.id === 'aiModel') { aiDraft.model = t.value; return; }
    if (t.id === 'aiRemember') { aiDraft.remember = t.checked; return; }
    if (t.hasAttribute('data-job')) { c.job = t.value.slice(0, 6000); changed(); return; }
    if (t.dataset.p) { c.personal[t.dataset.p] = t.value; changed(); }
    else if (t.dataset.l) { c.letter[t.dataset.l] = t.value; changed(); }
    else if (t.hasAttribute('data-sec-title')) {
      const sec = c.sections.find(s => s.id === active);
      sec.title = t.value; changed();
      const row = $(`.sec-row[data-id="${sec.id}"] .sec-link`); if (row) row.textContent = t.value;
      const h = $('.panel-head h2', panel); if (h) h.textContent = t.value;
    } else if (t.dataset.item) {
      const sec = c.sections.find(s => s.id === active);
      const item = sec && sec.items.find(i => i.id === t.dataset.item);
      if (!item) return;
      item[t.dataset.k] = t.value;
      changed();
      const card = t.closest('.item-card');
      if (card && !T[sec.type].tags && !T[sec.type].single) {
        const lab = itemLabel(sec, item);
        $('.item-title', card).textContent = lab.title;
      }
    } else if (t.id === 'accentPicker') {
      c.style.accent = t.value; changed();
      $$('.swatch.selected', panel).forEach(s => s.classList.remove('selected'));
    }
  });
  panel.addEventListener('change', e => { if (e.target.id === 'aiRemember') aiDraft.remember = e.target.checked; if (e.target.tagName === 'SELECT') e.target.dispatchEvent(new Event('input', { bubbles: true })); });

  panel.addEventListener('keydown', e => {
    if (e.target.id !== 'quickAdd' || e.key !== 'Enter') return;
    e.preventDefault();
    const sec = cv().sections.find(s => s.id === active);
    const names = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    if (!names.length) return;
    sec.items = sec.items.filter(i => String(i.name || '').trim());
    names.forEach(name => sec.items.push({ id: E.uid(), name, level: '' }));
    changed({ panel: true });
    $('#quickAdd').focus();
  });

  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const c = cv(), st = c.style;
    const sec = c.sections.find(s => s.id === active);
    if (b.dataset.aiProvider) { aiDraft.provider = b.dataset.aiProvider; if (aiDraft.provider !== ai.provider) { aiDraft.key = ''; aiDraft.model = ''; } aiMsg = null; renderPanel(); return; }
    if (b.dataset.tplFilter) { tplFilter = b.dataset.tplFilter; renderPanel(); return; }
    if (b.id === 'aiSave') { saveAiSettings(b); return; }
    if (b.id === 'aiForget') { saveAi({}); aiDraft = null; aiMsg = { ok: true, text: 'Your key was removed from this browser.' }; renderNav(); renderPanel(); return; }
    if (b.id === 'aiShowKey') { const k = $('#aiKey'); k.type = k.type === 'password' ? 'text' : 'password'; b.textContent = k.type === 'password' ? 'Show' : 'Hide'; return; }
    if (b.dataset.addSkill) {
      sec.items = sec.items.filter(i => String(i.name || '').trim());
      sec.items.push({ id: E.uid(), name: b.dataset.addSkill, level: '' });
      skillIdeas = skillIdeas.filter(n => n !== b.dataset.addSkill);
      changed({ panel: true });
      return;
    }
    if (b.dataset.template) {
      const t = META.templates[b.dataset.template];
      switchTemplateAnimated(() => {
        Object.assign(st, { template: t.id, accent: t.accent, font: t.font, photo: t.photo });
        changed({ panel: true });
        drawPreview();
      });
    } else if (b.dataset.accent) { st.accent = b.dataset.accent; changed({ panel: true }); }
    else if (b.dataset.font) { st.font = b.dataset.font; changed({ panel: true }); }
    else if (b.dataset.size) { st.size = b.dataset.size; changed({ panel: true }); }
    else if (b.dataset.spacing) { st.spacing = b.dataset.spacing; changed({ panel: true }); }
    else if (b.dataset.page) { st.page = b.dataset.page; changed({ panel: true }); }
    else if (b.dataset.photo) { st.photo = b.dataset.photo === 'true'; changed({ panel: true }); }
    else if (b.dataset.open) open(b.dataset.open);
    else if (b.dataset.download) download(b.dataset.download);
    else if (b.id === 'btnPhoto') $('#photoFile').click();
    else if (b.id === 'btnPhotoRemove') { c.personal.photo = ''; changed({ panel: true }); }
    else if (b.dataset.newSec) {
      const s = E.newSection(b.dataset.newSec, b.dataset.newSec === 'custom' ? 'New section' : undefined);
      if (!T[s.type].single) s.items.push(E.newItem());
      c.sections.push(s);
      changed();
      open(s.id);
      toast(`${s.title} added`);
    } else if (b.hasAttribute('data-add-item')) {
      const item = E.newItem();
      sec.items.push(item);
      changed();
      renderPanel({ openItem: item.id });
      const first = $(`[data-item="${item.id}"]`, panel);
      if (first) first.focus();
    } else if (b.dataset.toggle) {
      const card = b.closest('.item-card');
      const open_ = !card.classList.contains('open');
      card.classList.toggle('open', open_);
      b.setAttribute('aria-expanded', String(open_));
    } else if (b.dataset.move) {
      const i = sec.items.findIndex(x => x.id === b.dataset.move), j = i + Number(b.dataset.dir);
      if (j < 0 || j >= sec.items.length) return;
      [sec.items[i], sec.items[j]] = [sec.items[j], sec.items[i]];
      changed({ panel: true });
    } else if (b.dataset.delItem) {
      const i = sec.items.findIndex(x => x.id === b.dataset.delItem);
      const removed = sec.items.splice(i, 1)[0];
      changed({ panel: true });
      toast('Entry removed', 'Undo', () => { sec.items.splice(i, 0, removed); changed({ panel: true }); });
    } else if (b.dataset.eye) toggleHidden(b.dataset.eye);
    else if (b.dataset.delSec) {
      const i = c.sections.findIndex(s => s.id === b.dataset.delSec);
      const removed = c.sections.splice(i, 1)[0];
      changed();
      open('personal');
      toast(`${removed.title} deleted`, 'Undo', () => { c.sections.splice(i, 0, removed); changed(); open(removed.id); });
    } else if (b.dataset.ai) runAI(b);
  });

  function toggleHidden(id) {
    const s = cv().sections.find(x => x.id === id);
    if (!s) return;
    s.hidden = !s.hidden;
    changed({ nav: true, panel: active === id });
    toast(s.hidden ? `${s.title} hidden from your CV` : `${s.title} is back on your CV`);
  }

  /* Photo upload: shrink to 320px so it stays small in storage. */
  $('#photoFile').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const img = new Image();
    img.onload = () => {
      const size = 320, canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const s = Math.min(img.width, img.height);
      canvas.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      cv().personal.photo = canvas.toDataURL('image/jpeg', 0.85);
      cv().style.photo = true;
      URL.revokeObjectURL(img.src);
      changed({ panel: true });
    };
    img.src = URL.createObjectURL(file);
  });

  /* ── Nav events ────────────────────────────────────────── */
  $('#secNav').addEventListener('click', e => {
    const eye = e.target.closest('[data-eye]');
    if (eye) { toggleHidden(eye.dataset.eye); return; }
    const b = e.target.closest('[data-open]');
    if (b) open(b.dataset.open);
  });
  $('#strength').addEventListener('click', () => {
    if (!strengthTipTarget) return;
    open(strengthTipTarget === 'add' ? 'add' : strengthTipTarget);
  });

  /* Clicking the page opens the matching panel. */
  paper.addEventListener('click', e => {
    const sec = e.target.closest('[data-sec]');
    if (sec) { open(sec.dataset.sec, { keepScroll: true }); return; }
    if (e.target.closest('.cv-head') || e.target.closest('.cv-sec--contact')) open(doc === 'letter' ? 'letter' : 'personal', { keepScroll: true });
    else if (doc === 'letter') open('letter', { keepScroll: true });
  });

  $$('.doc-tab').forEach(t => t.addEventListener('click', () => {
    showDoc(t.dataset.doc);
    if (t.dataset.doc === 'letter' && active !== 'letter') open('letter', { keepScroll: true });
  }));

  /* ── Drag to reorder (sections and entries) ────────────── */
  function enableSort(list, selector, onMove) {
    if (!list) return;
    let dragEl = null, from = -1;
    list.addEventListener('dragstart', e => {
      const el = e.target.closest(selector);
      if (!el || e.target.matches('input, textarea, select')) { e.preventDefault(); return; }
      dragEl = el;
      from = [...list.children].indexOf(el);
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', ''); } catch (_) { /* old browsers */ }
    });
    list.addEventListener('dragover', e => {
      if (!dragEl) return;
      e.preventDefault();
      const after = [...list.children].filter(c => c !== dragEl).find(c => {
        const r = c.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
      });
      if (after) list.insertBefore(dragEl, after); else list.appendChild(dragEl);
    });
    list.addEventListener('dragend', () => {
      if (!dragEl) return;
      const to = [...list.children].indexOf(dragEl);
      dragEl.classList.remove('dragging');
      dragEl.classList.add('settle');
      const el = dragEl;
      setTimeout(() => el.classList.remove('settle'), 400);
      dragEl = null;
      if (to !== from && from > -1) onMove(from, to);
    });
  }

  /* ── CV switcher ───────────────────────────────────────── */
  const cvMenu = $('#cvMenu');
  function renderCvMenu() {
    const list = Object.values(store.cvs).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    cvMenu.innerHTML = `
      <div class="menu-label">Your CVs</div>
      ${list.map(c => `<button type="button" role="menuitemradio" aria-checked="${c.id === store.currentId}" data-switch="${c.id}">
        <b>${esc(c.name || 'My CV')}</b><span>${esc(META.templates[c.style.template] ? META.templates[c.style.template].name : '')} · edited ${esc(new Date(c.updatedAt || Date.now()).toLocaleDateString())}</span></button>`).join('')}
      <hr>
      <button type="button" role="menuitem" data-cv="rename">Rename this CV</button>
      <button type="button" role="menuitem" data-cv="duplicate">Duplicate for another job</button>
      <button type="button" role="menuitem" data-cv="new">Start a new CV</button>
      <button type="button" role="menuitem" data-cv="sample">Start from an example</button>
      <button type="button" role="menuitem" data-cv="import">Open a backup file</button>
      ${list.length > 1 ? '<button type="button" role="menuitem" class="danger" data-cv="delete">Delete this CV</button>' : ''}`;
  }
  function toggleMenu(menu, btn, force) {
    const show = force !== undefined ? force : menu.hidden;
    $$('.menu').forEach(m => { if (m !== menu) m.hidden = true; });
    menu.hidden = !show;
    btn.setAttribute('aria-expanded', String(show));
  }
  $('#cvSwitchBtn').addEventListener('click', e => { e.stopPropagation(); renderCvMenu(); toggleMenu(cvMenu, e.currentTarget); });
  cvMenu.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    toggleMenu(cvMenu, $('#cvSwitchBtn'), false);
    if (b.dataset.switch) return switchTo(b.dataset.switch);
    const c = cv();
    switch (b.dataset.cv) {
      case 'rename': {
        const name = prompt('Name this CV (only you see this)', c.name || 'My CV');
        if (name && name.trim()) { c.name = name.trim().slice(0, 60); changed({ nav: true }); }
        break;
      }
      case 'duplicate': {
        const copy = JSON.parse(JSON.stringify(c));
        copy.id = E.uid(); copy.name = (c.name || 'My CV') + ' (copy)'; copy.updatedAt = Date.now();
        addCv(copy); toast('Copy created. Tailor it for the new job.');
        break;
      }
      case 'new': addCv(E.newCV(META.templates[c.style.template])); open('design'); break;
      case 'sample': { const s = E.sampleCV(META.templates[c.style.template]); s.name = 'Example CV'; addCv(s); break; }
      case 'import': $('#importFile').click(); break;
      case 'delete':
        if (!confirm(`Delete "${c.name || 'My CV'}"? This can't be undone.`)) return;
        delete store.cvs[c.id];
        switchTo(Object.keys(store.cvs)[0]);
        toast('CV deleted');
        break;
    }
  });
  function addCv(c) { store.cvs[c.id] = c; switchTo(c.id); }
  function switchTo(id) {
    store.currentId = id;
    persist();
    resetHistory();
    switchTemplateAnimated(renderAll);
  }

  /* ── Downloads ─────────────────────────────────────────── */
  const dlMenu = $('#dlMenu');
  $('#btnDownload').addEventListener('click', e => { e.stopPropagation(); toggleMenu(dlMenu, e.currentTarget); });
  dlMenu.addEventListener('click', e => {
    const b = e.target.closest('[data-dl]');
    if (!b) return;
    toggleMenu(dlMenu, $('#btnDownload'), false);
    download(b.dataset.dl);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.menu') && !e.target.closest('[aria-haspopup]')) $$('.menu').forEach(m => { m.hidden = true; });
  });

  function fileBase() {
    const p = cv().personal;
    const who = [p.firstName, p.lastName].filter(Boolean).join('_').replace(/[^\w\-]+/g, '_') || 'My';
    return who + (doc === 'letter' ? '_Cover_Letter' : '_CV');
  }

  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  async function download(kind) {
    persist();
    if (kind === 'pdf') return printPdf();
    if (kind === 'json') {
      saveBlob(new Blob([JSON.stringify({ app: 'cvbuilders', version: 2, cv: cv() }, null, 2)], { type: 'application/json' }), fileBase().replace(/_(CV|Cover_Letter)$/, '') + '_backup.json');
      return toast('Backup saved. Open it from "Your CVs" any time.');
    }
    if (kind === 'docx') {
      const copy = JSON.parse(JSON.stringify(cv()));
      copy.personal.photo = '';
      toast('Preparing your Word file…');
      try {
        const resp = await fetch('/api/export/docx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': $('#csrfToken').value },
          body: JSON.stringify({ cv: copy, doc }),
        });
        if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `HTTP ${resp.status}`);
        saveBlob(await resp.blob(), fileBase() + '.docx');
        toast('Word file downloaded');
      } catch (err) {
        toast('Sorry, the Word download failed: ' + err.message);
      }
    }
  }

  function printPdf() {
    const c = cv();
    const page = c.style.page === 'Letter' ? 'letter' : 'A4';
    $('#pageRule').textContent = `@page { size: ${page}; margin: 12mm 0; } @page :first { margin-top: 0; }`;
    $('#printRoot').innerHTML = doc === 'letter' ? E.renderLetter(c, META) : E.render(c, META);
    const oldTitle = document.title;
    document.title = fileBase();
    toast('In the print window, choose "Save as PDF".');
    setTimeout(() => {
      window.print();
      document.title = oldTitle;
    }, 50);
  }

  /* Import a backup file as a new CV. */
  $('#importFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const c = data && data.cv;
      if (!c || !c.personal || !Array.isArray(c.sections) || !c.style) throw new Error('not a CV Builders backup');
      c.id = E.uid();
      c.updatedAt = Date.now();
      c.sections = c.sections.filter(s => s && T[s.type]).map(s => Object.assign({ id: E.uid(), hidden: false, items: [] }, s));
      c.letter = Object.assign(E.newCV().letter, c.letter || {});
      addCv(c);
      toast(`Opened "${c.name || 'My CV'}"`);
    } catch (err) {
      toast("That file couldn't be opened: " + err.message);
    }
  });

  /* ── AI helpers ────────────────────────────────────────── */
  async function postJSON(url, payload, keyOverride) {
    const k = keyOverride || ai;
    const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': $('#csrfToken').value };
    if (k.key) Object.assign(headers, { 'X-AI-Provider': k.provider || '', 'X-AI-Key': k.key, 'X-AI-Model': k.model || '' });
    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(data.error || `HTTP ${resp.status}`);
      err.needsKey = !!data.needsKey;
      throw err;
    }
    return data.result;
  }

  function revealInto(textarea, text) {
    return new Promise(resolve => {
      const done = () => { textarea.dispatchEvent(new Event('input', { bubbles: true })); resolve(); };
      if (REDUCE) { textarea.value = text; return done(); }
      const parts = text.split(/(\s+)/);
      const step = Math.max(1, Math.ceil(parts.length / 60));
      let i = 0;
      textarea.classList.add('is-revealing');
      (function tick() {
        i = Math.min(parts.length, i + step);
        textarea.value = parts.slice(0, i).join('');
        textarea.scrollTop = textarea.scrollHeight;
        if (i < parts.length) return setTimeout(tick, 22);
        textarea.classList.remove('is-revealing');
        done();
      })();
    });
  }

  function experienceDigest() {
    const lines = [];
    cv().sections.filter(s => !s.hidden && ['experience', 'education', 'projects', 'volunteering'].includes(s.type)).forEach(s => s.items.forEach(i => {
      const head = [i.role || i.degree || i.name, i.org].filter(Boolean).join(' at ');
      if (head) lines.push(`${s.title}: ${head}${i.description ? ' — ' + i.description.replace(/\n/g, '; ') : ''}`);
    }));
    return lines.join('\n').slice(0, 3500);
  }
  const skillsDigest = () => cv().sections.filter(s => s.type === 'skills').flatMap(s => s.items.map(i => i.name)).filter(Boolean).join(', ');

  async function runAI(btn) {
    const mode = btn.dataset.ai;
    if (!aiReady()) {
      open('ai', { keepScroll: true });
      toast('Add your AI key once, then the ✨ buttons will work everywhere.');
      return;
    }
    const label = btn.closest('label');
    const ta = label ? label.querySelector('textarea') : null;
    const job = cv().job || '';
    btn.disabled = true;
    btn.classList.add('is-thinking');
    try {
      let result;
      if (mode === 'skills') {
        const have = skillsDigest();
        const ideas = await postJSON('/api/llm/suggest-skills', { headline: cv().personal.headline, experience: experienceDigest(), have, job });
        skillIdeas = (ideas || []).filter(n => !have.toLowerCase().split(/,\s*/).includes(n.toLowerCase()));
        if (!skillIdeas.length) toast('No new ideas this time. Your skills look well covered.');
        renderPanel({ keepScroll: true });
        return;
      }
      if (mode === 'summary') {
        result = await postJSON('/api/llm/write-summary', { headline: cv().personal.headline, experience: experienceDigest(), skills: skillsDigest(), job });
      } else if (mode === 'letter') {
        const l = cv().letter, summary = (cv().sections.find(s => s.type === 'summary') || { items: [{}] }).items[0].text || '';
        result = await postJSON('/api/llm/draft-cover-letter', {
          position_name: l.role, company_name: l.company, background_summary: summary,
          past_experience: experienceDigest(), gained_skills: skillsDigest(), job,
        });
        result = String(result).trim().split(/\n+/).join('\n\n');
      } else if (mode === 'bullets') {
        const card = btn.closest('.item-card');
        const val = k => card ? (($(`[data-k="${k}"]`, card) || {}).value || '') : '';
        result = await postJSON('/api/llm/write-bullets', { role: val('role') || val('name'), org: val('org'), notes: ta.value, job });
      } else {
        const text = (ta.value || '').trim();
        if (!text) { ta.focus(); toast('Write a few words first, then AI can polish them.'); return; }
        const card = btn.closest('.item-card');
        const role = card ? ($('[data-k="role"]', card) || {}).value || '' : '';
        result = await postJSON('/api/llm/rewrite-bullet', { text, role, mode: mode === 'concise' ? 'concise' : 'improve', job });
      }
      const before = ta.value;
      await revealInto(ta, String(result).trim());
      toast('Done. Edit it however you like.', 'Undo', () => { ta.value = before; ta.dispatchEvent(new Event('input', { bubbles: true })); });
    } catch (err) {
      if (err.needsKey) { open('ai', { keepScroll: true }); }
      toast('The AI could not help just now: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-thinking');
    }
  }

  /* ── Small UI bits ─────────────────────────────────────── */
  function setStatus(t) { const s = $('#draftStatus'); s.textContent = t; s.classList.add('saved'); setTimeout(() => s.classList.remove('saved'), 1200); }

  let toastTimer = null;
  function toast(msg, actionLabel, action) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}`;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('show'));
    if (actionLabel) $('button', el).onclick = () => { action(); hideToast(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, actionLabel ? 6000 : 3200);
  }
  function hideToast() { const el = $('#toast'); el.classList.remove('show'); setTimeout(() => { el.hidden = true; }, 250); }

  function drawMini(el) {
    const t = META.templates[el.dataset.template];
    const sample = E.sampleCV(t);
    sample.style.photo = false;
    const page = E.PAGE.A4;
    el.innerHTML = `<div class="cv-mini-inner">${E.render(sample, META)}</div>`;
    requestAnimationFrame(() => {
      const scale = el.clientWidth / page.w;
      el.style.height = Math.round(page.h * scale) + 'px';
      el.firstElementChild.style.transform = `scale(${scale})`;
    });
  }

  /* Preview drawer on small screens */
  const canvasEl = $('#canvas');
  function openPreview() { canvasEl.classList.add('is-open'); document.body.classList.add('preview-open'); requestAnimationFrame(fitPreview); }
  function closePreview() { canvasEl.classList.remove('is-open'); document.body.classList.remove('preview-open'); }
  $('#btnOpenPreview').addEventListener('click', openPreview);
  $('#btnClosePreview').addEventListener('click', closePreview);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closePreview(); $$('.menu').forEach(m => { m.hidden = true; }); }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z' && !e.target.matches('input, textarea')) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  });
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);
  window.addEventListener('resize', () => requestAnimationFrame(fitPreview));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitPreview());

  /* ── Boot ──────────────────────────────────────────────── */
  function renderAll() {
    renderNav();
    renderPanel();
    drawPreview();
    updateStrength();
  }

  // Print CSS hides every direct child of <body> except this one.
  document.body.appendChild($('#printRoot'));
  loadStore();
  // A template chosen on the home page or gallery applies to the open CV.
  if (CFG.requestedTemplate && META.templates[CFG.requestedTemplate]) {
    const t = META.templates[CFG.requestedTemplate], st = cv().style;
    if (st.template !== t.id) Object.assign(st, { template: t.id, accent: t.accent, font: t.font, photo: t.photo });
    persist();
    history.replaceState(null, '', location.pathname);
  }
  const fresh = !E.strength(cv()).score;
  active = fresh ? 'personal' : 'design';
  resetHistory();
  renderAll();

  window.__cvEditor = { cv, open, store: () => store };
})();
