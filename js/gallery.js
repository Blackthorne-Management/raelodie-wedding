// "Our Journey" slideshow: rotates through the photos in the grid below it.
// Photos come from the grid's <a data-slide href="images/gallery/full/NN.jpg">
// links, so adding a photo to the grid adds it to the slideshow too.
// Auto-advances every 5s; pauses on hover/focus, when the tab is hidden, and
// never autoplays for visitors who prefer reduced motion.

document.addEventListener('DOMContentLoaded', () => {
  const show = document.querySelector('[data-slideshow]');
  const links = [...document.querySelectorAll('[data-gallery] [data-slide]')];
  if (!show || !links.length) return;

  const stage = show.querySelector('[data-stage]');
  const img = show.querySelector('[data-slide-img]');
  const backdrop = show.querySelector('[data-backdrop]');
  const count = show.querySelector('[data-count]');
  const toggle = show.querySelector('[data-toggle]');
  const INTERVAL = 5000;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const photos = links.map((a) => ({ src: a.getAttribute('href'), alt: a.querySelector('img').alt }));
  let index = 0;
  let timer = null;
  let playing = !reduceMotion;
  let hovering = false;

  show.hidden = false;

  function preload(i) {
    const p = photos[(i + photos.length) % photos.length];
    const im = new Image();
    im.src = p.src;
  }

  function go(i) {
    index = (i + photos.length) % photos.length;
    const p = photos[index];
    img.classList.remove('visible');
    const next = new Image();
    next.onload = next.onerror = () => {
      img.src = p.src;
      img.alt = p.alt;
      backdrop.style.backgroundImage = `url("${p.src}")`;
      requestAnimationFrame(() => img.classList.add('visible'));
    };
    next.src = p.src;
    count.textContent = `${index + 1} / ${photos.length}`;
    preload(index + 1);
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    if (playing && !hovering && !document.hidden) timer = setTimeout(() => go(index + 1), INTERVAL);
  }

  function setPlaying(on) {
    playing = on;
    toggle.textContent = on ? 'Pause' : 'Play';
    toggle.setAttribute('aria-label', on ? 'Pause slideshow' : 'Play slideshow');
    schedule();
  }

  show.querySelector('[data-prev]').addEventListener('click', () => go(index - 1));
  show.querySelector('[data-next]').addEventListener('click', () => go(index + 1));
  toggle.addEventListener('click', () => setPlaying(!playing));

  stage.addEventListener('mouseenter', () => { hovering = true; schedule(); });
  stage.addEventListener('mouseleave', () => { hovering = false; schedule(); });
  document.addEventListener('visibilitychange', schedule);

  show.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(index - 1);
    if (e.key === 'ArrowRight') go(index + 1);
  });

  // Swipe on phones.
  let touchX = null;
  stage.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  // Clicking a grid photo shows it in the slideshow instead of opening the file.
  links.forEach((a, i) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      go(i);
      show.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    })
  );

  setPlaying(playing);
  go(0);
});
