// Draws the link-preview image (public/og.png, 1200x630). Run: npm run build:og -- path/to/Fredoka.ttf
// Dev dependency only (@napi-rs/canvas); the PNG is committed.
import fs from 'node:fs';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

const fontFile = process.argv[2];
if (fontFile) GlobalFonts.registerFromPath(fontFile, 'Fredoka');
const W = 1200, H = 630;
const c = createCanvas(W, H);
const g = c.getContext('2d');

// paper
g.fillStyle = '#FBF3E4';
g.fillRect(0, 0, W, H);
g.fillStyle = 'rgba(15,138,122,.13)';
for (let y = 14; y < H; y += 26) for (let x = 14; x < W; x += 26) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }

// deterministic noise for torn edges
let s = 7;
const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
function hill(base, amp, waves, color, shadow) {
  const p1 = rand() * 6.28, p2 = rand() * 6.28;
  const y = (x) => base + Math.sin((x / W) * waves * 6.283 + p1) * amp + Math.sin((x / W) * waves * 2.7 * 6.283 + p2) * amp * 0.3;
  const path = () => { g.beginPath(); for (let x = -10; x <= W + 10; x += 6) { const yy = y(x) + (rand() - 0.5) * 3; x === -10 ? g.moveTo(x, yy) : g.lineTo(x, yy); } g.lineTo(W + 10, H + 10); g.lineTo(-10, H + 10); g.closePath(); };
  g.save();
  if (shadow) { g.shadowColor = 'rgba(10,60,50,.25)'; g.shadowBlur = 14; g.shadowOffsetY = -4; }
  g.translate(0, -5); path(); g.fillStyle = '#FFFCF5'; g.fill(); g.translate(0, 5);
  g.shadowColor = 'transparent'; path(); g.fillStyle = color; g.fill();
  g.restore();
  return y;
}

// bunting
const flags = ['sk', 'br', 'jp', 'it', 'in', 'ke', 'ca', 'au', 'fr', 'ng', 'ar', 'de', 'gb', 'us', 'kr'];
g.strokeStyle = 'rgba(36,50,48,.6)'; g.lineWidth = 3;
g.beginPath(); g.moveTo(-10, 26); g.quadraticCurveTo(W / 2, 26 + 2 * 46, W + 10, 26); g.stroke();
for (let i = 0; i < flags.length; i++) {
  const t = (i + 0.5) / flags.length, x = t * W, y = 26 + 4 * 46 * t * (1 - t);
  const ang = Math.atan((4 * 46 * (1 - 2 * t)) / W);
  const img = await loadImage(fs.readFileSync(`public/flags/4x3/${flags[i]}.svg`));
  const pw = 66, ph = 80;
  g.save();
  g.translate(x, y); g.rotate(ang);
  g.shadowColor = 'rgba(60,40,10,.3)'; g.shadowBlur = 8; g.shadowOffsetY = 5;
  g.beginPath(); g.moveTo(-pw / 2, 0); g.lineTo(pw / 2, 0); g.lineTo(pw / 2, ph * 0.76); g.lineTo(0, ph); g.lineTo(-pw / 2, ph * 0.76); g.closePath();
  g.fillStyle = '#fff'; g.fill(); g.shadowColor = 'transparent'; g.clip();
  g.drawImage(img, -pw / 2, 0, pw, ph);
  g.restore();
}

// hills
hill(492, 22, 1.3, '#C4E9DC', false);
hill(540, 22, 1.8, '#7AD2B4', true);
const front = hill(584, 16, 2.4, '#1BA88F', true);

// little trees and a pin
function round(x, y, k, col) { g.fillStyle = '#8A5A3C'; g.fillRect(x - 3 * k, y - 30 * k, 6 * k, 34 * k); g.fillStyle = col; g.beginPath(); g.arc(x, y - 42 * k, 22 * k, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.arc(x - 8 * k, y - 48 * k, 8 * k, 0, 7); g.fill(); }
round(90, front(90) + 8, 1.1, '#FFC233'); round(230, front(230) + 8, 0.8, '#EE5A36'); round(1010, front(1010) + 8, 1, '#FF6B9D'); round(1120, front(1120) + 8, 1.3, '#8C55D9');
function pin(x, y, k) {
  g.save(); g.translate(x, y); g.scale(k, k);
  g.fillStyle = 'rgba(10,60,50,.3)'; g.beginPath(); g.ellipse(0, 2, 26, 6, 0, 0, 7); g.fill();
  g.shadowColor = 'rgba(80,20,0,.35)'; g.shadowBlur = 8; g.shadowOffsetY = 4;
  g.fillStyle = '#EE5A36'; g.beginPath(); g.moveTo(0, -4);
  g.bezierCurveTo(-10, -26, -38, -46, -38, -72); g.arc(0, -72, 38, Math.PI, 0); g.bezierCurveTo(38, -46, 10, -26, 0, -4); g.fill();
  g.shadowColor = 'transparent'; g.fillStyle = '#FFFCF5'; g.beginPath(); g.arc(0, -72, 21, 0, 7); g.fill();
  g.fillStyle = '#243230'; g.beginPath(); g.arc(-8, -76, 4.6, 0, 7); g.arc(8, -76, 4.6, 0, 7); g.fill();
  g.strokeStyle = '#243230'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.arc(0, -66, 8, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  g.restore();
}
pin(930, front(930) + 10, 1.25);

// title as cut-paper stickers
function sticker(text, x, y, size, color, rot = 0) {
  g.save();
  g.translate(x, y); g.rotate(rot);
  g.font = `700 ${size}px Fredoka`;
  g.textBaseline = 'alphabetic';
  g.lineJoin = 'round';
  g.shadowColor = 'rgba(80,50,10,.3)'; g.shadowBlur = 12; g.shadowOffsetY = 8;
  g.strokeStyle = '#FFFCF5'; g.lineWidth = size * 0.2; g.strokeText(text, 0, 0);
  g.shadowColor = 'transparent';
  g.fillStyle = color; g.fillText(text, 0, 0);
  const w = g.measureText(text).width;
  g.restore();
  return w;
}
g.font = '700 128px Fredoka';
const w1 = g.measureText('Which ').width, w2 = g.measureText('country').width, w3 = g.measureText('are ').width, w4 = g.measureText('you?').width;
const line1 = w1 + w2, line2 = w3 + w4;
sticker('Which', (W - line1) / 2, 268, 128, '#0A5F55');
sticker('country', (W - line1) / 2 + w1, 268, 128, '#EE5A36', -0.04);
sticker('are', (W - line2) / 2, 396, 128, '#0A5F55');
sticker('you?', (W - line2) / 2 + w3, 396, 128, '#8C55D9', 0.04);

g.font = '500 34px Fredoka';
g.fillStyle = '#243230';
const sub = 'Vote. Watch the whole world answer.';
g.fillText(sub, (W - g.measureText(sub).width) / 2, 452);

g.font = '600 28px Fredoka';
g.fillStyle = '#0A5F55';
const url = 'whichcountryareyou.com';
g.fillText(url, W - g.measureText(url).width - 36, H - 30);

fs.writeFileSync('public/og.png', c.toBuffer('image/png'));
console.log('public/og.png written,', Math.round(fs.statSync('public/og.png').size / 1024), 'KB');
