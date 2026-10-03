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
    knowledge hiring hire looking senior junior across every month monthly weekly within plus bonus familiarity exposure background
    monday tuesday wednesday thursday friday saturday sunday weekend weekends morning mornings afternoon evening evenings
    january february march april june july august september sept october november december
    overview description summary duties qualifications qualification criteria details perks reward rewards shift shifts hourly
    ll re ve don am pm a.m p.m e.g i.e and/or his/her he/she s/he full-time part-time fixed-term`.split(/\s+/));

  const norm = s => String(s || '').toLowerCase().replace(/[’']/g, "'");
  // sses -> ss first, and never strip the s of a trailing ss, so process/processes share a stem.
  const stem = w => w.replace(/sses$/, 'ss').replace(/(ies)$/, 'y').replace(/(ing|ed|es|([^s])s)$/, (m, a, b) => b || '').replace(/e$/, '');
  const WORD = /\p{L}[\p{L}\p{N}+#./&\-]*[\p{L}\p{N}+#]|\p{L}/gu;

  function words(text) {
    return norm(text).match(WORD) || [];
  }

  /* Is position i the start of a sentence, line or bullet point? (No lookbehind: Safari < 16.4.) */
  function atStart(raw, i) {
    let j = i - 1;
    while (j >= 0 && /[ \t]/.test(raw[j])) j--;
    if (j < 0 || /[.!?:•\n\r]/.test(raw[j])) return true;
    if (!/[-*–·▪]/.test(raw[j])) return false;
    j--;
    while (j >= 0 && /[ \t]/.test(raw[j])) j--;
    return j < 0 || /[\n\r]/.test(raw[j]);
  }

  function cvText(cv) {
    const p = cv.personal || {};
    const out = [p.headline, p.location];
    (cv.sections || []).filter(s => !s.hidden).forEach(s => {
      out.push(s.title);
      s.items.forEach(i => Object.keys(i).forEach(k => { if (k !== 'id') out.push(i[k]); }));
    });
    return out.filter(Boolean).join(' \n ');
  }

  /* Pick the words and two-word phrases that matter in an advert.
     skip: lower-case words to leave out (the employer's name). */
  function keywords(job, skip) {
    const raw = String(job || '').replace(/[’']/g, "'");
    const ws = [], caps = new Set(), forms = new Map();
    const re = new RegExp(WORD.source, 'gu');
    let m;
    while ((m = re.exec(raw))) {
      const w = norm(m[0]), start = atStart(raw, m.index);
      ws.push(w);
      // Capitalised mid-sentence words (Python, Bloomberg, IFRS) are usually tools or names.
      if (!start && w.length > 1 && /^\p{Lu}/u.test(m[0])) caps.add(w);
      // Keep the advert's own casing (SQL, Power BI); a sentence-start capital only counts if all caps.
      if (!start || (w.length > 1 && m[0] === m[0].toUpperCase())) { if (!forms.has(w)) forms.set(w, m[0]); }
    }
    if (ws.length < 8) return [];
    const junk = w => STOP.has(w) || w.length < 2 || /^\d+$/.test(w) || (w.length <= 4 && /[./]/.test(w)) || (skip && skip.has(w));
    const freq = new Map(), bi = new Map();
    ws.forEach((w, i) => {
      if (junk(w)) return;
      freq.set(w, (freq.get(w) || 0) + 1);
      const n = ws[i + 1];
      if (n && !junk(n)) {
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
    terms.forEach(t => { t.display = t.term.split(' ').map(w => forms.get(w) || w).join(' '); });
    return terms.slice(0, 24);
  }

  function has(text, stems, term) {
    const parts = term.split(' ');
    if (parts.length > 1) return text.includes(term) || text.includes(parts.join('-')) || parts.every(p => stems.has(stem(p)));
    if (stems.has(stem(term))) return true;
    const bits = term.split(/[/-]/).filter(Boolean);
    return bits.length > 1 && bits.every(p => stems.has(stem(p)));
  }

  /* display maps each term to its casing in the advert, e.g. {'power bi': 'Power BI'}. */
  function jobMatch(cv, job) {
    const company = words(cv.letter && cv.letter.company).filter(w => !STOP.has(w));
    const terms = keywords(job, new Set(company));
    if (!terms.length) return null;
    const text = norm(cvText(cv));
    const stems = new Set();
    // Also index the pieces of Excel/VBA or customer-facing, keeping the whole token for node.js and c++.
    words(text).forEach(w => { stems.add(stem(w)); w.split(/[/-]/).forEach(p => { if (p) stems.add(stem(p)); }); });
    const matched = [], missing = [], display = {};
    let got = 0, total = 0;
    terms.forEach(t => {
      total += t.weight;
      display[t.term] = t.display;
      if (has(text, stems, t.term)) { got += t.weight; matched.push(t.term); } else missing.push(t.term);
    });
    return { score: Math.round(got / total * 100), matched, missing, display };
  }

  /* ── Writing tips ───────────────────────────────────────── */
  const WEAK = /^(responsible for|helped|helping|assisted|assisting|worked on|working on|involved in|tasked with|duties included|participated in|in charge of|did|was)\b/i;
  const PRESENT = /^(manage|lead|develop|build|create|support|work|design|run|handle|oversee|coordinate|maintain|deliver|analyse|analyze|write|prepare|train|teach|sell|serve|assist|help|organise|organize|plan|implement|monitor|review|produce|conduct)s?\b/i;
  const CLICHE = /\b(hard[- ]working|team player|go[- ]getter|detail[- ]oriented|results[- ]driven|self[- ]starter|think outside the box|synergy|dynamic (?:professional|individual)|passionate)\b/i;
  const FIRST = /(^|\s)(i|my|me|i'm|i've)(\s|$|,|\.)/i;
  // "CFA Level I" or "Phase I" is a numeral, not first person.
  const firstPerson = l => FIRST.test(' ' + l.replace(/\b(level|phase|type|part|class|grade|tier|stage|series)\s+I\b/gi, '$1') + ' ');

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
    if (lines.some(firstPerson)) tips.push('Leave out “I” and “my”. CVs read better without them.');
    const ended = ctx.end && !/present|current|now|today|ongoing|to date|till date|until now/i.test(ctx.end);
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
