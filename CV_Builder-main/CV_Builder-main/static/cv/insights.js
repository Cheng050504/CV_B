/* Writing helpers that run in the browser, no AI needed:
   - jobMatch: which important words from a job advert the CV already uses
   - lint: quick tips for a profile or a list of achievements */
(function (global) {
  'use strict';

  const STOP = new Set(`a about above across after again against all almost also am among an and any are as at be because been before being
    below between both but by can could did do does doing down during each either else etc even ever every few for from further get gets
    getting give given go going had has have having he her here hers him his how however i if in into is it its itself just less like
    made make makes many may me might more most much must my need needs new no nor not now of off often on once one only or other our
    ours out over own part per please plus quite rather really role roles same see seeking she should so some such than that the their
    theirs them then there these they this those through thus to too under until up upon us use used using very via want wants was way
    we well were what when where whether which while who whom whose why will with within without would yet you your yours
    able ability abilities across additional apply applying applicant applicants benefits candidate candidates career careers closing
    company date day days daily degree desirable desired employer employment environment equal essential excellent experience experienced
    good great help helping high highly ideal ideally include includes including job join joining key level looking month months
    offer offers opportunity opportunities opportunity people person plus position positions preferred previous proven related relevant
    requirement requirements required responsibilities responsibility responsible right salary skill skills strong successful support
    team teams time today understanding various week weeks work working world year years full part apply us uk london based within
    hours hour hybrid remote office location contract permanent temporary ltd inc llc package bonus competitive pension holiday
    knowledge hiring hire looking senior junior across every month monthly weekly within plus bonus familiarity exposure background`.split(/\s+/));

  const norm = s => String(s || '').toLowerCase().replace(/[’']/g, "'");
  const stem = w => w.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '').replace(/e$/, '');

  function words(text) {
    return norm(text).match(/[a-z][a-z0-9+#./&\-]*[a-z0-9+#]|[a-z]/g) || [];
  }

  function cvText(cv) {
    const p = cv.personal || {};
    const out = [p.headline];
    (cv.sections || []).filter(s => !s.hidden).forEach(s => {
      out.push(s.title);
      s.items.forEach(i => Object.keys(i).forEach(k => { if (k !== 'id') out.push(i[k]); }));
    });
    return out.filter(Boolean).join(' \n ');
  }

  /* Pick the words and two-word phrases that matter in an advert. */
  function keywords(job) {
    const raw = String(job || '');
    const ws = words(raw);
    if (ws.length < 8) return [];
    // Capitalised mid-sentence words (Python, Bloomberg, IFRS) are usually tools or names.
    const caps = new Set((raw.match(/(?<![.!?:•\n]\s*|^\s*)\b[A-Z][A-Za-z0-9+#.&]*[A-Za-z0-9+#]\b/g) || []).map(norm));
    const freq = new Map(), bi = new Map();
    ws.forEach((w, i) => {
      if (STOP.has(w) || w.length < 2 || /^\d+$/.test(w)) return;
      freq.set(w, (freq.get(w) || 0) + 1);
      const n = ws[i + 1];
      if (n && !STOP.has(n) && n.length > 1 && !/^\d+$/.test(n)) {
        const k = w + ' ' + n;
        bi.set(k, (bi.get(k) || 0) + 1);
      }
    });
    const score = (term, f) => f + (caps.has(term.split(' ')[0]) ? 1 : 0) + (/[+#.]|\d/.test(term) ? 1 : 0);
    const terms = [];
    bi.forEach((f, k) => { if (f >= 2) terms.push({ term: k, weight: score(k, f) + 1 }); });
    freq.forEach((f, k) => {
      const inPhrase = terms.some(t => t.term.split(' ').includes(k) && bi.get(t.term) >= f);
      if (!inPhrase && (f >= 2 || caps.has(k) || /[+#]/.test(k))) terms.push({ term: k, weight: score(k, f) });
    });
    terms.sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term));
    return terms.slice(0, 24);
  }

  function has(text, stems, term) {
    const parts = term.split(' ');
    if (parts.length > 1) return text.includes(term) || parts.every(p => stems.has(stem(p)));
    return stems.has(stem(term));
  }

  function jobMatch(cv, job) {
    const terms = keywords(job);
    if (!terms.length) return null;
    const text = norm(cvText(cv));
    const stems = new Set(words(text).map(stem));
    const matched = [], missing = [];
    let got = 0, total = 0;
    terms.forEach(t => {
      total += t.weight;
      if (has(text, stems, t.term)) { got += t.weight; matched.push(t.term); } else missing.push(t.term);
    });
    return { score: Math.round(got / total * 100), matched, missing };
  }

  /* ── Writing tips ───────────────────────────────────────── */
  const WEAK = /^(responsible for|helped|helping|assisted|assisting|worked on|working on|involved in|tasked with|duties included|participated in|in charge of|did|was)\b/i;
  const PRESENT = /^(manage|lead|develop|build|create|support|work|design|run|handle|oversee|coordinate|maintain|deliver|analyse|analyze|write|prepare|train|teach|sell|serve|assist|help|organise|organize|plan|implement|monitor|review|produce|conduct)s?\b/i;
  const CLICHE = /\b(hard[- ]working|team player|go[- ]getter|detail[- ]oriented|results[- ]driven|self[- ]starter|think outside the box|synergy|dynamic|passionate)\b/i;
  const FIRST = /(^|\s)(i|my|me|i'm|i've)(\s|$|,|\.)/i;

  function lint(text, ctx) {
    ctx = ctx || {};
    const tips = [];
    const t = String(text || '').trim();
    if (!t) return tips;
    if (ctx.kind === 'summary') {
      const n = t.split(/\s+/).length;
      if (n < 20) tips.push('A little short. Two or three sentences work best.');
      if (n > 90) tips.push('Quite long. Aim for about 50 to 80 words.');
      const c = t.match(CLICHE);
      if (c) tips.push(`“${c[0]}” is a cliché. Show it with a quick example instead.`);
      return tips;
    }
    const lines = t.split('\n').map(l => l.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);
    const weak = lines.find(l => WEAK.test(l));
    if (weak) tips.push(`Start with a strong verb instead of “${weak.match(WEAK)[0]}”. Try Led, Built, Cut or Grew.`);
    if (lines.some(l => FIRST.test(' ' + l + ' '))) tips.push('Leave out “I” and “my”. CVs read better without them.');
    const ended = ctx.end && !/present|current|now|today/i.test(ctx.end);
    if (ended && lines.some(l => PRESENT.test(l))) tips.push('This role has ended, so use the past tense (Managed, Led, Built).');
    if (ctx.kind === 'achievements' && lines.length >= 2 && lines.filter(l => /\d/.test(l)).length < Math.ceil(lines.length / 2)) {
      tips.push('Add numbers where you can: %, £, people, time saved, rankings.');
    }
    const long = lines.findIndex(l => l.split(/\s+/).length > 32);
    if (long > -1) tips.push(`Line ${long + 1} is long. Keep each point to one or two lines.`);
    const c = t.match(CLICHE);
    if (c) tips.push(`“${c[0]}” is a cliché. Show it with a result instead.`);
    return tips.slice(0, 3);
  }

  global.CVInsights = { jobMatch, keywords, lint, cvText };
})(window);
