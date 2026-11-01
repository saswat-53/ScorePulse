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
      a.setAttribute('aria-disabled', 'true');
      a.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('get')?.scrollIntoView({ behavior: 'smooth' });
      });
    });
    if (note) note.textContent = 'The download opens soon. Check back here.';
  }
}

loadDownload();
