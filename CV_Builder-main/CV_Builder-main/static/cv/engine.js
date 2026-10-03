/* CV engine: turns a CV data object into HTML for one of the templates.
   Pure functions, no DOM access, so the editor, the gallery thumbnails and
   print all draw exactly the same thing. */
(function (global) {
  'use strict';

  const uid = () => Math.random().toString(36).slice(2, 10);

  /* Field kinds: text (default), textarea, select. `main` fields render as
     the entry title / subtitle; dates and location go to the meta column. */
  const SECTION_TYPES = {
    summary: {
      title: 'Profile', single: true, hint: 'Two or three sentences about who you are and what you want next.',
      fields: [['text', 'Profile', 'textarea', 'Analyst with two years in equity research, now looking to move into corporate finance…']],
    },
    experience: {
      title: 'Experience', add: 'Add a job',
      fields: [['role', 'Job title', 'text', 'Summer Analyst'], ['org', 'Company', 'text', 'Morgan Stanley'],
               ['location', 'Location', 'text', 'London'], ['start', 'Start', 'text', 'Jun 2025'], ['end', 'End', 'text', 'Present'],
               ['description', 'What you achieved', 'textarea', 'One achievement per line. Start with a verb and add a number where you can.']],
      title_of: i => i.role, sub_of: i => i.org,
    },
    education: {
      title: 'Education', add: 'Add education',
      fields: [['degree', 'Degree', 'text', 'BSc Economics'], ['org', 'School', 'text', 'University of Manchester'],
               ['location', 'Location', 'text', 'Manchester'], ['start', 'Start', 'text', '2022'], ['end', 'End', 'text', '2025'],
               ['grade', 'Grade', 'text', 'First Class Honours'], ['description', 'Details', 'textarea', 'Relevant modules, dissertation, prizes…']],
      title_of: i => i.degree, sub_of: i => [i.org, i.grade].filter(Boolean).join(' · '),
    },
    projects: {
      title: 'Projects', add: 'Add a project',
      fields: [['name', 'Project', 'text', 'Budgeting app'], ['link', 'Link', 'text', 'github.com/you/app'],
               ['start', 'Start', 'text', '2024'], ['end', 'End', 'text', ''], ['description', 'What you built', 'textarea', '']],
      title_of: i => i.name, sub_of: i => i.link,
    },
    volunteering: {
      title: 'Volunteering', add: 'Add volunteering',
      fields: [['role', 'Role', 'text', 'Mentor'], ['org', 'Organisation', 'text', 'Code Club'],
               ['location', 'Location', 'text', ''], ['start', 'Start', 'text', ''], ['end', 'End', 'text', ''],
               ['description', 'What you did', 'textarea', '']],
      title_of: i => i.role, sub_of: i => i.org,
    },
    skills: {
      title: 'Skills', add: 'Add a skill', tags: true,
      fields: [['name', 'Skill', 'text', 'Financial modelling'],
               ['level', 'Level', 'select', ['', 'Beginner', 'Intermediate', 'Advanced', 'Expert']]],
    },
    languages: {
      title: 'Languages', add: 'Add a language', tags: true,
      fields: [['name', 'Language', 'text', 'Spanish'],
               ['level', 'Level', 'select', ['', 'Native', 'Fluent', 'Advanced', 'Intermediate', 'Basic']]],
    },
    certifications: {
      title: 'Certifications', add: 'Add a certification',
      fields: [['name', 'Certificate', 'text', 'CFA Level I'], ['org', 'Issued by', 'text', 'CFA Institute'], ['end', 'Date', 'text', '2025']],
      title_of: i => i.name, sub_of: i => i.org,
    },
    awards: {
      title: 'Awards', add: 'Add an award',
      fields: [['name', 'Award', 'text', "Dean's List"], ['org', 'From', 'text', ''], ['end', 'Date', 'text', ''], ['description', 'Details', 'textarea', '']],
      title_of: i => i.name, sub_of: i => i.org,
    },
    interests: {
      title: 'Interests', add: 'Add an interest', tags: true,
      fields: [['name', 'Interest', 'text', 'Long-distance running']],
    },
    custom: {
      title: 'Custom section', add: 'Add an entry',
      fields: [['name', 'Title', 'text', ''], ['org', 'Subtitle', 'text', ''], ['location', 'Location', 'text', ''],
               ['start', 'Start', 'text', ''], ['end', 'End', 'text', ''], ['description', 'Details', 'textarea', '']],
      title_of: i => i.name, sub_of: i => i.org,
    },
  };

  /* Short lists that move into the sidebar on two-column templates. */
  const SIDE_TYPES = ['skills', 'languages', 'interests', 'certifications', 'awards'];

  const PAGE = { A4: { w: 794, h: 1123 }, Letter: { w: 816, h: 1056 } };
  const SIZES = { s: 12.5, m: 13.5, l: 14.5 };
  const SPACING = { compact: 1.35, normal: 1.5, relaxed: 1.65 };

  /* ── Data helpers ──────────────────────────────────────── */
  function newSection(type, title) {
    const sec = { id: uid(), type, title: title || SECTION_TYPES[type].title, hidden: false, items: [] };
    if (SECTION_TYPES[type].single) sec.items.push({ id: uid(), text: '' });
    return sec;
  }
  function newItem() { return { id: uid() }; }

  function newCV(template) {
    const t = template || {};
    return {
      id: uid(),
      name: 'My CV',
      updatedAt: Date.now(),
      style: { template: t.id || 'clean', accent: t.accent || '#2F5D8A', font: t.font || 'inter',
               size: 'm', spacing: 'normal', page: 'A4', photo: !!t.photo },
      personal: { firstName: '', lastName: '', headline: '', email: '', phone: '', location: '', website: '', linkedin: '', photo: '' },
      sections: ['summary', 'experience', 'education', 'skills', 'languages'].map(ty => {
        const s = newSection(ty);
        if (!SECTION_TYPES[ty].single) s.items.push(newItem());
        return s;
      }),
      letter: { recipient: '', recipientTitle: '', company: '', address: '', role: '', body: '', signoff: 'Kind regards,' },
    };
  }

  function sampleCV(template) {
    const cv = newCV(template);
    const by = ty => cv.sections.find(s => s.type === ty);
    Object.assign(cv.personal, {
      firstName: 'Alexandra', lastName: 'Chen', headline: 'Equity Research Analyst',
      email: 'alex.chen@example.com', phone: '+44 7700 900123', location: 'London, UK',
      linkedin: 'linkedin.com/in/alexchen', website: '',
    });
    by('summary').items[0].text = 'Analyst with two internships in equity research and corporate strategy. I build clear financial models, turn messy data into decisions, and enjoy explaining numbers to people who are short on time.';
    by('experience').items = [
      { id: uid(), role: 'Summer Analyst, Equity Research', org: 'Morgan Stanley', location: 'London', start: 'Jun 2025', end: 'Aug 2025',
        description: 'Built a 5-company comparable set used in 4 sector notes\nDrafted initiation sections read by the senior analyst and 2 portfolio managers\nAutomated a weekly data pull in Python, saving 3 hours a week' },
      { id: uid(), role: 'President', org: 'Investment Society', location: 'Manchester', start: 'Sep 2024', end: 'Present',
        description: 'Grew active membership from 40 to 120 in three terms\nLed a 6-person team to the CFA Research Challenge regional final' },
    ];
    by('education').items = [
      { id: uid(), degree: 'BSc Economics and Mathematics', org: 'University of Manchester', location: 'Manchester', start: '2022', end: '2025',
        grade: 'First Class Honours', description: 'Modules: Corporate Finance, Econometrics, Game Theory' },
    ];
    by('skills').items = ['Financial modelling', 'Python', 'SQL', 'Excel & VBA', 'Bloomberg', 'Public speaking']
      .map((name, i) => ({ id: uid(), name, level: ['Expert', 'Advanced', 'Intermediate', 'Expert', 'Advanced', 'Intermediate'][i] }));
    by('languages').items = [{ id: uid(), name: 'English', level: 'Native' }, { id: uid(), name: 'Mandarin', level: 'Fluent' }, { id: uid(), name: 'Spanish', level: 'Intermediate' }];
    const interests = newSection('interests');
    interests.items = ['Running', 'Chess', 'Architecture'].map(name => ({ id: uid(), name }));
    cv.sections.push(interests);
    cv.letter = { recipient: 'Jane Smith', recipientTitle: 'Head of Campus Recruiting', company: 'Goldman Sachs',
      address: 'Plumtree Court, London EC4A 4AU', role: 'Investment Banking Analyst',
      body: 'I am writing to apply for the Investment Banking Analyst role at Goldman Sachs. Meeting your TMT team at the Manchester careers fair convinced me that your culture of ownership is where I want to start my career.\n\nDuring my summer at Morgan Stanley I built comparable company models used in four published notes and automated a weekly data pull that saved the team three hours a week. Leading the Investment Society taught me to bring a team with me and to deliver under pressure.\n\nI would welcome the chance to discuss how I could contribute to your team.',
      signoff: 'Kind regards,' };
    return cv;
  }

  /* ── Rendering ─────────────────────────────────────────── */
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function descHtml(text) {
    const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return '';
    const bulletish = lines.length > 1 || /^[•\-*]/.test(lines[0]);
    if (!bulletish) return `<p class="cv-desc">${esc(lines[0])}</p>`;
    return `<ul class="cv-desc">${lines.map(l => `<li>${esc(l.replace(/^[•\-*]\s*/, ''))}</li>`).join('')}</ul>`;
  }

  function filled(item, keys) { return keys.some(k => String(item[k] || '').trim()); }

  /* Original cvbuilders formats: short lists read as "Skills: a, b, c" lines,
     and neighbouring lists share one heading. */
  function linesHtml(secs, ghost) {
    const lines = secs.map(sec => {
      const items = sec.items.filter(i => String(i.name || '').trim());
      const text = items.length
        ? items.map(i => esc(i.name) + (i.level ? ` (${esc(i.level)})` : '')).join(', ')
        : (ghost ? `<span class="cv-ghost">Add your ${esc(sec.title.toLowerCase())}</span>` : '');
      return text ? `<p class="cv-line" data-sec="${esc(sec.id)}"><strong>${esc(sec.title)}:</strong> ${text}</p>` : '';
    }).filter(Boolean);
    if (!lines.length) return '';
    const titles = secs.map(s => s.title);
    const title = titles.length > 1 ? titles.slice(0, -1).join(', ') + ' & ' + titles[titles.length - 1] : titles[0];
    return `<section class="cv-sec cv-sec--lines" data-sec="${esc(secs[0].id)}"><h2 class="cv-h"><span>${esc(title)}</span></h2>${lines.join('')}</section>`;
  }

  function sectionsHtml(secs, ghost, meta) {
    if (!meta.lines) return secs.map(s => sectionHtml(s, ghost, meta)).join('');
    const out = [];
    let run = [];
    const flush = () => { if (run.length) out.push(linesHtml(run, ghost)); run = []; };
    secs.forEach(s => {
      if ((SECTION_TYPES[s.type] || {}).tags) run.push(s);
      else { flush(); out.push(sectionHtml(s, ghost, meta)); }
    });
    flush();
    return out.join('');
  }

  function sectionHtml(sec, ghost, meta) {
    const def = SECTION_TYPES[sec.type] || SECTION_TYPES.custom;
    const keys = def.fields.map(f => f[0]);
    const items = sec.items.filter(i => filled(i, keys));
    const head = `<h2 class="cv-h"><span>${esc(sec.title)}</span></h2>`;
    let body = '';
    if (def.single) {
      body = items.length ? `<p class="cv-summary">${esc(items[0].text)}</p>` : '';
    } else if (def.tags) {
      body = items.length ? `<ul class="cv-tags">${items.map(i =>
        `<li data-level="${esc(i.level || '')}"><span class="cv-tag-name">${esc(i.name)}</span>${i.level ? `<span class="cv-tag-level">${esc(i.level)}</span>` : ''}</li>`).join('')}</ul>` : '';
    } else {
      body = items.map(i => {
        let title = def.title_of(i), sub = def.sub_of(i);
        /* Original formats lead with the employer or school in bold. */
        if (meta && meta.org_first && i.org) {
          sub = [def.title_of(i), sec.type === 'education' ? i.grade : ''].filter(Boolean).join(', ');
          title = i.org;
        }
        const dates = [i.start, i.end].filter(Boolean).map(esc).join(' – ');
        return `<div class="cv-item">
          ${title ? `<div class="cv-item-title">${esc(title)}</div>` : ''}
          ${(dates || i.location) ? `<div class="cv-item-meta">${dates ? `<span class="cv-dates">${dates}</span>` : ''}${i.location ? `<span class="cv-loc">${esc(i.location)}</span>` : ''}</div>` : ''}
          ${sub ? `<div class="cv-item-sub">${esc(sub)}</div>` : ''}
          ${descHtml(i.description)}
        </div>`;
      }).join('');
    }
    if (!body) {
      if (!ghost) return '';
      body = `<p class="cv-ghost">${esc(def.hint || 'Add your ' + sec.title.toLowerCase() + ' here.')}</p>`;
    }
    return `<section class="cv-sec cv-sec--${esc(sec.type)}" data-sec="${esc(sec.id)}">${head}${body}</section>`;
  }

  const ICONS = {
    email: '<path d="M3 5h18v14H3z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m3 6 9 7 9-7" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    phone: '<path d="M6.6 3h3l1.5 4.5-2.2 1.4a11 11 0 0 0 6.2 6.2l1.4-2.2L21 14.4v3A2.6 2.6 0 0 1 18.4 20 15.4 15.4 0 0 1 4 5.6 2.6 2.6 0 0 1 6.6 3z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    location: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="9.5" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    website: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  };

  function contactHtml(p) {
    const parts = ['email', 'phone', 'location', 'linkedin', 'website'].filter(k => p[k]);
    if (!parts.length) return '';
    return `<ul class="cv-contact">${parts.map(k =>
      `<li><svg class="cv-ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg><span>${esc(p[k])}</span></li>`).join('')}</ul>`;
  }

  const safeColor = c => /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '#2F5D8A';

  function initials(p) {
    return ((p.firstName || ' ')[0] + (p.lastName || ' ')[0]).trim().toUpperCase() || '?';
  }

  /* opts: { templates: {id: meta}, fonts: {id: {body, head}}, ghost: bool } */
  function render(cv, opts) {
    opts = opts || {};
    const st = cv.style || {};
    const meta = (opts.templates && opts.templates[st.template]) || { id: st.template, layout: 'single' };
    const font = (opts.fonts && opts.fonts[st.font]) || { body: 'Inter, Arial, sans-serif', head: 'Inter, Arial, sans-serif' };
    const page = PAGE[st.page] || PAGE.A4;
    const p = cv.personal || {};
    const ghost = !!opts.ghost;
    const hasSide = meta.layout === 'side-left' || meta.layout === 'side-right';

    const visible = (cv.sections || []).filter(s => !s.hidden);
    const side = hasSide ? visible.filter(s => SIDE_TYPES.includes(s.type)) : [];
    const main = visible.filter(s => !side.includes(s));

    const name = [p.firstName, p.lastName].filter(Boolean).length
      ? `${esc(p.firstName)} <span class="cv-last">${esc(p.lastName)}</span>`
      : (ghost ? '<span class="cv-ghost-name">Your Name</span>' : '');
    const photo = st.photo
      ? (p.photo ? `<img class="cv-photo" src="${esc(p.photo)}" alt="">` : (ghost ? `<div class="cv-photo cv-photo--empty">${esc(initials(p))}</div>` : ''))
      : '';

    const header = `<header class="cv-head">
        <span class="cv-mono" aria-hidden="true">${esc(initials(p))}</span>
        ${photo}
        <div class="cv-id">
          <h1 class="cv-name">${name}</h1>
          ${p.headline ? `<p class="cv-headline">${esc(p.headline)}</p>` : (ghost ? '<p class="cv-headline cv-ghost">Your job title</p>' : '')}
        </div>
        ${hasSide ? '' : contactHtml(p)}
      </header>`;

    const sideHtml = hasSide
      ? `<aside class="cv-side">${contactHtml(p) ? `<section class="cv-sec cv-sec--contact"><h2 class="cv-h"><span>Contact</span></h2>${contactHtml(p)}</section>` : ''}${side.map(s => sectionHtml(s, ghost, meta)).join('')}</aside>`
      : '';

    const style = [
      `--accent:${safeColor(st.accent)}`,
      `--font-body:${font.body}`,
      `--font-head:${font.head}`,
      `--fs:${SIZES[st.size] || SIZES.m}px`,
      `--lh:${SPACING[st.spacing] || SPACING.normal}`,
      `--page-w:${page.w}px`,
      `--page-h:${page.h}px`,
    ].join(';');

    return `<div class="cv cv--${esc(meta.id || st.template)} cv--${esc(meta.layout || 'single')}${meta.org_first ? ' cv--orgfirst' : ''}" style="${style}">
      ${header}
      <div class="cv-body">
        <div class="cv-main">${sectionsHtml(main, ghost, meta)}</div>
        ${sideHtml}
      </div>
    </div>`;
  }

  function renderLetter(cv, opts) {
    opts = opts || {};
    const st = cv.style || {};
    const meta = (opts.templates && opts.templates[st.template]) || { id: st.template, layout: 'single' };
    const font = (opts.fonts && opts.fonts[st.font]) || { body: 'Inter, Arial, sans-serif', head: 'Inter, Arial, sans-serif' };
    const page = PAGE[st.page] || PAGE.A4;
    const p = cv.personal || {}, l = cv.letter || {};
    const ghost = !!opts.ghost;
    const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
    const gh = (v, fb) => v ? esc(v) : (ghost ? `<span class="cv-ghost">${esc(fb)}</span>` : '');
    const paras = String(l.body || '').split(/\n\s*\n/).map(t => t.trim()).filter(Boolean);
    const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    const style = [`--accent:${safeColor(st.accent)}`, `--font-body:${font.body}`, `--font-head:${font.head}`,
      `--fs:${SIZES[st.size] || SIZES.m}px`, `--lh:${SPACING[st.spacing] || SPACING.normal}`, `--page-w:${page.w}px`, `--page-h:${page.h}px`].join(';');
    return `<div class="cv cv-letter cv--${esc(meta.id || st.template)} cv--single" style="${style}">
      <header class="cv-head">
        <div class="cv-id">
          <h1 class="cv-name">${name ? esc(name) : gh('', 'Your Name')}</h1>
          ${p.headline ? `<p class="cv-headline">${esc(p.headline)}</p>` : ''}
        </div>
        ${contactHtml(p)}
      </header>
      <div class="cv-body"><div class="cv-main cv-letter-body">
        <p class="cv-letter-date">${esc(date)}</p>
        <p class="cv-letter-to">${gh(l.recipient, 'Recipient name')}${l.recipientTitle ? '<br>' + esc(l.recipientTitle) : ''}<br>${gh(l.company, 'Company')}${l.address ? '<br>' + esc(l.address) : ''}</p>
        ${l.role ? `<p class="cv-letter-re"><strong>Re: ${esc(l.role)}</strong></p>` : ''}
        <p>Dear ${l.recipient ? esc(l.recipient.trim()) : 'Hiring Manager'},</p>
        ${paras.length ? paras.map(t => `<p>${esc(t)}</p>`).join('') : (ghost ? '<p class="cv-ghost">Your letter goes here. Write it yourself, or let AI draft it from your CV.</p>' : '')}
        <p>${esc(l.signoff || 'Kind regards,')}<br>${esc(name)}</p>
      </div></div>
    </div>`;
  }

  /* ── CV strength ───────────────────────────────────────── */
  function strength(cv) {
    const p = cv.personal || {};
    const secs = (cv.sections || []).filter(s => !s.hidden);
    const by = ty => secs.find(s => s.type === ty);
    const filledItems = s => s ? s.items.filter(i => Object.entries(i).some(([k, v]) => k !== 'id' && String(v || '').trim())) : [];
    const exp = filledItems(by('experience'));
    const bullets = exp.flatMap(i => String(i.description || '').split('\n').map(t => t.trim()).filter(Boolean));
    const checks = [
      { ok: !!(p.firstName && p.lastName), tip: 'Add your full name', go: 'personal', w: 10 },
      { ok: !!p.email, tip: 'Add an email address', go: 'personal', w: 10 },
      { ok: !!p.phone, tip: 'Add a phone number', go: 'personal', w: 5 },
      { ok: !!p.headline, tip: 'Add a headline under your name', go: 'personal', w: 5 },
      { ok: !!(by('summary') && String((by('summary').items[0] || {}).text || '').trim().length > 60), tip: 'Write a short profile (2–3 sentences)', go: by('summary') ? by('summary').id : 'add', w: 15 },
      { ok: exp.length > 0, tip: 'Add at least one job or role', go: by('experience') ? by('experience').id : 'add', w: 20 },
      { ok: bullets.length >= 3, tip: 'Describe your roles with 3+ achievements', go: by('experience') ? by('experience').id : 'add', w: 10 },
      { ok: bullets.length > 0 && bullets.filter(b => /\d/.test(b)).length >= Math.ceil(bullets.length / 2), tip: 'Add numbers to your achievements', go: by('experience') ? by('experience').id : 'add', w: 10 },
      { ok: filledItems(by('education')).length > 0, tip: 'Add your education', go: by('education') ? by('education').id : 'add', w: 10 },
      { ok: filledItems(by('skills')).length >= 4, tip: 'List at least 4 skills', go: by('skills') ? by('skills').id : 'add', w: 5 },
    ];
    const total = checks.reduce((a, c) => a + c.w, 0);
    const score = Math.round(checks.filter(c => c.ok).reduce((a, c) => a + c.w, 0) / total * 100);
    return { score, tips: checks.filter(c => !c.ok) };
  }

  global.CVEngine = { SECTION_TYPES, SIDE_TYPES, PAGE, uid, newCV, sampleCV, newSection, newItem, render, renderLetter, strength, esc };
})(window);
