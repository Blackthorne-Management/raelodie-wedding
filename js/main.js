// Shared behavior: mobile nav, countdown, gallery reveal-on-scroll.

document.addEventListener('DOMContentLoaded', () => {
  initNavToggle();
  initCountdown();
  initGalleryReveal();
});

function initNavToggle() {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

// Wedding date/time: update WEDDING_DATETIME once ceremony time is finalized.
const WEDDING_DATETIME = '2027-05-08T16:00:00-04:00';

function initCountdown() {
  const el = document.querySelector('[data-countdown]');
  if (!el) return;

  const target = new Date(WEDDING_DATETIME).getTime();
  const daysEl = el.querySelector('[data-days]');
  const hoursEl = el.querySelector('[data-hours]');
  const minsEl = el.querySelector('[data-mins]');
  const secsEl = el.querySelector('[data-secs]');

  function tick() {
    const diff = Math.max(0, target - Date.now());
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    if (daysEl) daysEl.textContent = days;
    if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
    if (minsEl) minsEl.textContent = String(mins).padStart(2, '0');
    if (secsEl) secsEl.textContent = String(secs).padStart(2, '0');

    if (diff <= 0) clearInterval(timer);
  }

  tick();
  const timer = setInterval(tick, 1000);
}

function initGalleryReveal() {
  const figures = document.querySelectorAll('.gallery figure');
  if (!figures.length) return;

  if (!('IntersectionObserver' in window)) {
    figures.forEach((f) => f.classList.add('in-view'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  figures.forEach((f) => observer.observe(f));
}
