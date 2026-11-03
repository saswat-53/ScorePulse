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

// One phone for the whole story: it swaps its screen and leans as each step scrolls into the reading area. The alerts
// belong to the first screen only, so they switch off once the page moves on.
function tour() {
  const root = document.querySelector('[data-tour]');
  const stack = root?.querySelector('[data-stack]');
  if (!root || !stack) return;
  const steps = [...root.querySelectorAll('.step')];
  const shots = [...stack.querySelectorAll('img')];
  const tilts = [0, -3, 3, -2];
  // The step in charge is the last one whose top has passed the reading line. Reading the scroll position, not entry
  // events, means a reload halfway down or a jump to the end still picks the right screen.
  const line = () => innerHeight * (matchMedia('(max-width: 900px)').matches ? 0.66 : 0.55);
  let current = -1;
  const update = () => {
    const y = line();
    let i = 0;
    steps.forEach((s, k) => {
      if (s.getBoundingClientRect().top <= y) i = k;
    });
    if (i === current) return;
    current = i;
    steps.forEach((s, k) => s.classList.toggle('is-on', k === i));
    shots.forEach((img, k) => img.classList.toggle('on', k === i));
    stack.style.setProperty('--tilt', `${tilts[i] ?? 0}deg`);
    root.classList.toggle('is-hero', i === 0);
  };
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update();
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  update();
}

// On a screen with a pointer, the phone leans toward it.
function lean() {
  const stage = document.querySelector('.sticky');
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
