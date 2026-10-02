/* Draws scaled-down live previews: <div class="cv-mini" data-template="clean"></div>
   Each one shows the first page of the sample CV in that template. */
(function () {
  const META = window.CV_META || { templates: {}, fonts: {} };
  const minis = document.querySelectorAll('.cv-mini[data-template]');
  if (!minis.length || !window.CVEngine) return;

  function draw(el) {
    const tpl = META.templates[el.dataset.template];
    if (!tpl) return;
    const cv = CVEngine.sampleCV(tpl);
    if (el.dataset.photo === 'off') cv.style.photo = false;
    const page = CVEngine.PAGE[cv.style.page];
    el.innerHTML = `<div class="cv-mini-inner">${CVEngine.render(cv, Object.assign({ ghost: true }, META))}</div>`;
    el._page = page;
    fit(el);
  }
  function fit(el) {
    const page = el._page;
    if (!page) return;
    const scale = el.clientWidth / page.w;
    el.style.height = Math.round(page.h * scale) + 'px';
    el.firstElementChild.style.transform = `scale(${scale})`;
  }
  minis.forEach(draw);
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(entries => entries.forEach(e => fit(e.target)));
    minis.forEach(el => ro.observe(el));
  }
})();
