// Share sheet: a friendly popup with the usual suspects.
import { ICONS } from './icons.js';
import { mark } from './me.js';
import { renderCard } from './card.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const glyph = (name) => `<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
let open = null;
const emit = (name, props) => dispatchEvent(new CustomEvent('wcay:track', { detail: { name, props } }));

export function openShare({ title, text, url, toast, card }) {
  closeShare();
  // every link we hand out carries ?s=<channel>, so we can see how many new visitors each share brings (the viral loop)
  const tagged = (ch) => { try { const x = new URL(url); x.searchParams.set('s', ch); return x.toString(); } catch { return url; } };
  emit('share_open', { q: (url.split('/q/')[1] || url.split('/c/')[1] || 'home').slice(0, 30) });
  const enc = encodeURIComponent;
  const targets = [
    { id: 'whatsapp', label: 'WhatsApp', bg: '#25D366', href: `https://wa.me/?text=${enc(`${text} ${tagged('whatsapp')}`)}` },
    { id: 'x', label: 'X', bg: '#111', href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(tagged('x'))}` },
    { id: 'instagram', label: 'Instagram', bg: 'linear-gradient(45deg,#FEDA75,#FA7E1E 30%,#D62976 60%,#962FBF 80%,#4F5BD5)', copy: true, href: 'https://www.instagram.com/', note: 'Link copied. Paste it in a story or message.' },
    { id: 'facebook', label: 'Facebook', bg: '#1877F2', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(tagged('facebook'))}` },
    { id: 'telegram', label: 'Telegram', bg: '#26A5E4', href: `https://t.me/share/url?url=${enc(tagged('telegram'))}&text=${enc(text)}` },
    { id: 'reddit', label: 'Reddit', bg: '#FF4500', href: `https://www.reddit.com/submit?url=${enc(tagged('reddit'))}&title=${enc(title)}` },
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
      ${card ? '<div class="share-card-box" aria-live="polite"><div class="share-card-wait">Making your card…</div></div>' : ''}
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

  if (card) {
    renderCard(card).then((blob) => {
      if (!blob || open !== el) return;
      const src = URL.createObjectURL(blob);
      const file = new File([blob], 'which-country-are-you.png', { type: 'image/png' });
      const canFile = navigator.canShare?.({ files: [file] });
      el.querySelector('.share-card-box').innerHTML = `<img class="share-card" src="${src}" alt="Your share card"><div class="share-card-actions"><a class="btn alt mini" href="${src}" download="which-country-are-you.png" data-img="save">Save image</a>${canFile ? '<button class="btn mini" type="button" data-img="share">Share image</button>' : ''}</div>`;
      el.querySelector('[data-img="share"]')?.addEventListener('click', async () => { try { await navigator.share({ files: [file], title, text, url: tagged('image') }); emit('share_image', { a: 'share' }); mark('share'); } catch { /* dismissed */ } });
      el.querySelector('[data-img="save"]')?.addEventListener('click', () => { emit('share_image', { a: 'save' }); mark('share'); });
    });
  }
  async function copy(ch = 'copy') {
    const link = tagged(ch);
    try { await navigator.clipboard.writeText(link); return true; } catch { input.value = link; input.select(); try { return document.execCommand('copy'); } catch { return false; } }
  }
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return closeShare(prevFocus);
    const b = e.target.closest('[data-t]');
    if (!b) return;
    const id = b.dataset.t;
    emit('share_click', { ch: id });
    if (id === 'copy') {
      const ok = await copy();
      b.textContent = ok ? 'Copied!' : 'Press Ctrl+C';
      if (ok) mark('share');
      setTimeout(() => (b.textContent = 'Copy link'), 1800);
      return;
    }
    if (id === 'native') { try { await navigator.share({ title, text, url: tagged('native') }); mark('share'); } catch { /* dismissed */ } return; }
    if (id === 'mail') { location.href = `mailto:?subject=${enc(title)}&body=${enc(`${text}\n${tagged('mail')}`)}`; mark('share'); return; }
    const t = targets.find((x) => x.id === id);
    if (t.copy) { await copy(t.id); toast?.(t.note); }
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
