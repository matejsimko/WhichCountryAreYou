// Personal share card, drawn in the browser (no server, nothing uploaded). 1080 x 1350, fits feeds and stories.

const W = 1080, H = 1350;

function load(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function wrap(g, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (g.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// { prompt, answer, emoji, flag, pct, total, kicker }
export async function renderCard(o) {
  try { await Promise.all([document.fonts.load('700 80px Fredoka'), document.fonts.load('500 40px Fredoka'), document.fonts.load('400 30px Outfit')]); } catch { /* fonts optional */ }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = rng(11);

  g.fillStyle = '#FBF3E4';
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(15,138,122,.13)';
  for (let y = 14; y < H; y += 26) for (let x = 14; x < W; x += 26) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }

  // flag bunting
  const codes = ['sk', 'br', 'jp', 'it', 'in', 'ke', 'ca', 'au', 'fr', 'ng', 'ar', 'de', 'gb', 'us'];
  const imgs = await Promise.all(codes.map((cc) => load(`/flags/4x3/${cc}.svg`)));
  g.strokeStyle = 'rgba(36,50,48,.6)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(-10, 28); g.quadraticCurveTo(W / 2, 28 + 2 * 44, W + 10, 28); g.stroke();
  imgs.forEach((im, i) => {
    if (!im) return;
    const t = (i + 0.5) / imgs.length, x = t * W, y = 28 + 4 * 44 * t * (1 - t), ang = Math.atan((4 * 44 * (1 - 2 * t)) / W), pw = 62, ph = 76;
    g.save(); g.translate(x, y); g.rotate(ang);
    g.shadowColor = 'rgba(60,40,10,.3)'; g.shadowBlur = 8; g.shadowOffsetY = 5;
    g.beginPath(); g.moveTo(-pw / 2, 0); g.lineTo(pw / 2, 0); g.lineTo(pw / 2, ph * 0.76); g.lineTo(0, ph); g.lineTo(-pw / 2, ph * 0.76); g.closePath();
    g.fillStyle = '#fff'; g.fill(); g.shadowColor = 'transparent'; g.clip(); g.drawImage(im, -pw / 2, 0, pw, ph); g.restore();
  });

  // hills
  function hill(base, amp, waves, color, shadow) {
    const p1 = r() * 6.28, p2 = r() * 6.28;
    const y = (x) => base + Math.sin((x / W) * waves * 6.283 + p1) * amp + Math.sin((x / W) * waves * 2.7 * 6.283 + p2) * amp * 0.3;
    const path = () => { g.beginPath(); for (let x = -10; x <= W + 10; x += 6) { const yy = y(x) + (r() - 0.5) * 3; x === -10 ? g.moveTo(x, yy) : g.lineTo(x, yy); } g.lineTo(W + 10, H + 10); g.lineTo(-10, H + 10); g.closePath(); };
    g.save();
    if (shadow) { g.shadowColor = 'rgba(10,60,50,.25)'; g.shadowBlur = 14; g.shadowOffsetY = -4; }
    g.translate(0, -5); path(); g.fillStyle = '#FFFCF5'; g.fill(); g.translate(0, 5);
    g.shadowColor = 'transparent'; path(); g.fillStyle = color; g.fill();
    g.restore();
  }
  hill(1130, 26, 1.2, '#C4E9DC', false);
  hill(1190, 24, 1.7, '#7AD2B4', true);
  hill(1250, 18, 2.2, '#1BA88F', true);

  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.lineJoin = 'round';

  // the thing you picked
  const cx = W / 2, cy = 470;
  g.save();
  g.shadowColor = 'rgba(40,30,10,.35)'; g.shadowBlur = 24; g.shadowOffsetY = 12;
  g.beginPath(); g.arc(cx, cy, 190, 0, 7); g.fillStyle = '#fff'; g.fill();
  g.restore();
  if (o.flag) {
    const f = await load(`/flags/1x1/${o.flag}.svg`);
    g.save(); g.beginPath(); g.arc(cx, cy, 176, 0, 7); g.clip();
    if (f) g.drawImage(f, cx - 176, cy - 176, 352, 352);
    g.restore();
  } else if (o.emoji) {
    g.beginPath(); g.arc(cx, cy, 176, 0, 7); g.fillStyle = '#FFE9A8'; g.fill();
    g.font = '200px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textBaseline = 'middle'; g.fillStyle = '#243230'; g.fillText(o.emoji, cx, cy + 12); g.textBaseline = 'alphabetic';
  }

  g.font = '500 44px Fredoka, Outfit, sans-serif';
  g.fillStyle = '#5B6A66';
  g.fillText(o.kicker || 'I picked', cx, 740);

  // answer, as a cut-paper sticker
  let size = 118;
  g.font = `700 ${size}px Fredoka, sans-serif`;
  while (g.measureText(o.answer).width > W - 140 && size > 56) { size -= 6; g.font = `700 ${size}px Fredoka, sans-serif`; }
  g.save();
  g.shadowColor = 'rgba(80,50,10,.3)'; g.shadowBlur = 14; g.shadowOffsetY = 8;
  g.strokeStyle = '#FFFCF5'; g.lineWidth = size * 0.2; g.strokeText(o.answer, cx, 850);
  g.shadowColor = 'transparent'; g.fillStyle = '#0A5F55'; g.fillText(o.answer, cx, 850);
  g.restore();

  // the question and the numbers
  g.font = '500 42px Fredoka, Outfit, sans-serif';
  g.fillStyle = '#243230';
  const lines = wrap(g, o.prompt, W - 200);
  lines.slice(0, 2).forEach((ln, i) => g.fillText(ln, cx, 925 + i * 52));
  if (o.pct != null) {
    g.font = '600 46px Fredoka, Outfit, sans-serif';
    g.fillStyle = '#EE5A36';
    g.fillText(`${o.pct} of ${o.total.toLocaleString('en-US')} people agree`, cx, 925 + Math.min(lines.length, 2) * 52 + 28);
  }

  g.font = '700 54px Fredoka, sans-serif';
  g.fillStyle = '#FFFCF5';
  g.fillText('Which country are you?', cx, 1310);
  g.font = '500 30px Fredoka, sans-serif';
  g.fillStyle = 'rgba(255,252,245,.9)';
  g.fillText('whichcountryareyou.com', cx, 1345 - 2);

  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}
