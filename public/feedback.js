// Feedback popup: a few words to the maker. Reachable from the footer and from Pinny.
let open = null;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const emit = (name, props) => dispatchEvent(new CustomEvent('wcay:track', { detail: { name, props } }));
const KINDS = [['idea', '💡', 'Idea'], ['bug', '🐛', 'Bug'], ['love', '💛', 'Love'], ['other', '💬', 'Other']];

export function openFeedback(toast) {
  if (open) return;
  emit('feedback_open');
  let kind = 'idea';
  const el = document.createElement('div');
  el.className = 'modal';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Feedback');
  el.innerHTML = `<div class="modal-back" data-close></div>
    <div class="modal-card">
      <button class="modal-x" data-close type="button" aria-label="Close">×</button>
      <h2 class="modal-title">Tell me anything 💬</h2>
      <p class="modal-sub">I built this alone and read every message. What would make it better? What broke? What do you love?</p>
      <form id="fb-form" novalidate>
        <div class="fb-kinds">${KINDS.map(([k, e, l]) => `<button type="button" class="fb-kind${k === kind ? ' on' : ''}" data-kind="${k}">${e} ${l}</button>`).join('')}</div>
        <textarea id="fb-msg" rows="5" maxlength="1500" placeholder="Write a few words…" required></textarea>
        <input id="fb-contact" type="text" maxlength="120" placeholder="Email or @handle if you want a reply (optional)" autocomplete="off">
        <input class="fb-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <p class="fb-err" id="fb-err" role="alert"></p>
        <button class="btn" type="submit" id="fb-send">Send</button>
      </form>
    </div>`;
  document.body.append(el);
  open = el;
  requestAnimationFrame(() => el.classList.add('show'));
  const msg = el.querySelector('#fb-msg');
  setTimeout(() => msg.focus(), 120);
  const close = () => { if (!open) return; open = null; el.classList.remove('show'); setTimeout(() => el.remove(), 250); removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    const k = e.target.closest('[data-kind]');
    if (k) { kind = k.dataset.kind; el.querySelectorAll('.fb-kind').forEach((b) => b.classList.toggle('on', b === k)); }
  });
  el.querySelector('#fb-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = el.querySelector('#fb-err'), btn = el.querySelector('#fb-send');
    err.textContent = '';
    if (msg.value.trim().length < 3) { err.textContent = 'Write a few words first.'; msg.focus(); return; }
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, message: msg.value, contact: el.querySelector('#fb-contact').value, website: el.querySelector('.fb-hp').value, page: location.pathname, lang: navigator.language, width: innerWidth }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not send. Try again?');
      emit('feedback_sent', { k: kind });
      el.querySelector('.modal-card').innerHTML = `<div class="fb-thanks"><div class="fb-big">🙏</div><h2 class="modal-title">Thank you!</h2><p class="modal-sub" style="margin:8px 0 18px">That really helps. I'll read it today.</p><button class="btn" data-close type="button">Back to the map</button></div>`;
      setTimeout(() => el.querySelector('[data-close]')?.focus(), 50);
    } catch (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = 'Send'; }
  });
}
