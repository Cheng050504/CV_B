/* Shared, framework-free interactions: entrance reveal, FAQ accordion,
   draggable template carousel and category pills. Everything degrades to
   plain, visible content without JS or with reduced motion. */
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Entrance: fade elements up as they enter the viewport ── */
  const revealEls = document.querySelectorAll('[data-reveal]');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach(el => el.classList.add('is-visible'));
  } else {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach(el => io.observe(el));
  }

  /* ── FAQ: animate <details> height instead of snapping ── */
  document.querySelectorAll('.faq details').forEach(d => {
    const summary = d.querySelector('summary');
    const body = d.querySelector('.faq-body');
    if (!summary || !body || reduceMotion) return;
    summary.addEventListener('click', ev => {
      ev.preventDefault();
      if (d.dataset.animating) return;
      d.dataset.animating = '1';
      const opening = !d.open;
      if (opening) d.open = true;
      const full = body.scrollHeight;
      const anim = body.animate(
        [{ height: opening ? '0px' : full + 'px', opacity: opening ? 0 : 1 },
         { height: opening ? full + 'px' : '0px', opacity: opening ? 1 : 0 }],
        { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      anim.onfinish = () => { if (!opening) d.open = false; delete d.dataset.animating; };
    });
  });

  /* ── Template carousel: drag with mouse, swipe natively on touch ── */
  document.querySelectorAll('[data-carousel]').forEach(track => {
    let startX = 0, startScroll = 0, moved = false, down = false;
    track.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse') return;
      down = true; moved = false; startX = e.clientX; startScroll = track.scrollLeft;
    });
    window.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 6) { moved = true; track.classList.add('is-dragging'); }
      if (moved) track.scrollLeft = startScroll - dx;
    });
    window.addEventListener('pointerup', () => {
      if (!down) return;
      down = false;
      // Let the click that ends a drag be swallowed, then restore snapping.
      setTimeout(() => track.classList.remove('is-dragging'), 0);
    });
    track.addEventListener('click', e => { if (moved) { e.preventDefault(); moved = false; } }, true);
  });

  /* ── Category pills filter the carousel ── */
  document.querySelectorAll('[data-filter-for]').forEach(group => {
    const track = document.getElementById(group.dataset.filterFor);
    if (!track) return;
    group.addEventListener('click', e => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      group.querySelectorAll('.pill').forEach(p => p.setAttribute('aria-pressed', String(p === pill)));
      const cat = pill.dataset.cat;
      track.querySelectorAll('[data-cat]').forEach(card => {
        card.hidden = !(cat === 'all' || card.dataset.cat === cat);
      });
      track.scrollTo({ left: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });
})();
