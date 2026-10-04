// Share sheet: a friendly popup with the usual suspects.
import { ICONS } from './icons.js';
import { mark } from './me.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const glyph = (name) => `<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
let open = null;

export function openShare({ title, text, url, toast }) {
  closeShare();
  const enc = encodeURIComponent;
  const targets = [
    { id: 'whatsapp', label: 'WhatsApp', bg: '#25D366', href: `https://wa.me/?text=${enc(`${text} ${url}`)}` },
    { id: 'x', label: 'X', bg: '#111', href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}` },
    { id: 'instagram', label: 'Instagram', bg: 'linear-gradient(45deg,#FEDA75,#FA7E1E 30%,#D62976 60%,#962FBF 80%,#4F5BD5)', copy: true, href: 'https://www.instagram.com/', note: 'Link copied. Paste it in a story or message.' },
    { id: 'facebook', label: 'Facebook', bg: '#1877F2', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { id: 'telegram', label: 'Telegram', bg: '#26A5E4', href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}` },
    { id: 'reddit', label: 'Reddit', bg: '#FF4500', href: `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(title)}` },
  ];
  const el = document.createElement('div');
  el.className = 'modal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Share');
  el.innerHTML = `<div class="modal-back" data-close></div>
    <div class="modal-card">
      <button class="modal-x" type="button" data-close aria-label="Close">&times;</button>
      <h3 class="modal-title">Share this</h3>
      <p class="modal-sub">${esc(text)}</p>
      <div class="share-grid">
        ${targets.map((t) => `<button class="share-btn" type="button" data-t="${t.id}"><span class="share-ic" style="background:${t.bg}">${glyph(t.id)}</span>${t.label}</button>`).join('')}
        <button class="share-btn" type="button" data-t="mail"><span class="share-ic" style="background:#6B7A76"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg></span>Email</button>
        ${navigator.share ? '<button class="share-btn" type="button" data-t="native"><span class="share-ic" style="background:#0F8A7A"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/></svg></span>More</button>' : ''}
      </div>
      <div class="share-link"><input id="share-url" type="text" readonly value="${esc(url)}" aria-label="Link"><button class="btn" type="button" data-t="copy">Copy link</button></div>
    </div>`;
  document.body.append(el);
  open = el;
  const input = el.querySelector('#share-url');
  const prevFocus = document.activeElement;
  requestAnimationFrame(() => el.classList.add('show'));
  el.querySelector('[data-t="copy"]').focus();

  async function copy() {
    try { await navigator.clipboard.writeText(url); return true; } catch { input.select(); try { return document.execCommand('copy'); } catch { return false; } }
  }
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return closeShare(prevFocus);
    const b = e.target.closest('[data-t]');
    if (!b) return;
    const id = b.dataset.t;
    if (id === 'copy') {
      const ok = await copy();
      b.textContent = ok ? 'Copied!' : 'Press Ctrl+C';
      if (ok) mark('share');
      setTimeout(() => (b.textContent = 'Copy link'), 1800);
      return;
    }
    if (id === 'native') { try { await navigator.share({ title, text, url }); mark('share'); } catch { /* dismissed */ } return; }
    if (id === 'mail') { location.href = `mailto:?subject=${enc(title)}&body=${enc(`${text}\n${url}`)}`; mark('share'); return; }
    const t = targets.find((x) => x.id === id);
    if (t.copy) { await copy(); toast?.(t.note); }
    window.open(t.href, '_blank', 'noopener');
    mark('share');
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeShare(prevFocus);
    if (e.key === 'Tab') { // keep focus inside the sheet
      const f = [...el.querySelectorAll('button, input')].filter((x) => !x.disabled);
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

export function closeShare(restore) {
  if (!open) return;
  const el = open;
  open = null;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 250);
  restore?.focus?.();
}
