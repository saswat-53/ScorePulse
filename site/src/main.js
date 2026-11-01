import './style.css';

// The download link lives in public/config.json, so it can change without touching the app or rebuilding the page.
async function loadDownload() {
  let url = '';
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (res.ok) url = ((await res.json()).downloadUrl || '').trim();
  } catch {
    // Offline or missing file: fall through to "coming soon".
  }

  const links = document.querySelectorAll('[data-download]');
  const note = document.querySelector('[data-download-note]');
  if (url) {
    links.forEach((a) => {
      a.href = url;
      a.removeAttribute('aria-disabled');
    });
    if (note) note.textContent = 'Android only for now. Installing from a link may ask you to allow it once.';
  } else {
    links.forEach((a) => {
      if (a.classList.contains('btn')) a.setAttribute('aria-disabled', 'true');
      a.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('get')?.scrollIntoView({ behavior: 'smooth' });
      });
    });
    if (note) note.textContent = 'The download opens soon. Check back here.';
  }
}

// The big phone swaps its screen as each step scrolls into the middle of the page.
function tour() {
  const root = document.querySelector('[data-tour]');
  const stack = root?.querySelector('[data-stack]');
  if (!root || !stack) return;
  const steps = [...root.querySelectorAll('.step')];
  const shots = [...stack.querySelectorAll('img')];
  const tilts = [-3, 3, -2];
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const i = steps.indexOf(e.target);
        steps.forEach((s, k) => s.classList.toggle('is-on', k === i));
        shots.forEach((img, k) => img.classList.toggle('on', k === i));
        stack.style.setProperty('--tilt', `${tilts[i] ?? 0}deg`);
      }
    },
    { rootMargin: '-45% 0px -45% 0px' },
  );
  steps.forEach((s) => io.observe(s));
}

// The hero phone leans toward the pointer.
function lean() {
  const stage = document.querySelector('.stage');
  const bezel = stage?.querySelector('.bezel');
  if (!stage || !bezel || matchMedia('(hover: none), (prefers-reduced-motion: reduce)').matches) return;
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    bezel.style.setProperty('--ry', `${-8 + x * 16}deg`);
    bezel.style.setProperty('--rx', `${3 - y * 12}deg`);
  });
  stage.addEventListener('pointerleave', () => {
    bezel.style.removeProperty('--ry');
    bezel.style.removeProperty('--rx');
  });
}

function reveal() {
  const plain = document.querySelector('.plain');
  if (!plain) return;
  new IntersectionObserver(([e], io) => {
    if (e.isIntersecting) {
      plain.classList.add('seen');
      io.disconnect();
    }
  }, { threshold: 0.4 }).observe(plain);
}

loadDownload();
tour();
lean();
reveal();
