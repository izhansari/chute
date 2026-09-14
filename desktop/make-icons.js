#!/usr/bin/env node
'use strict';
// Generates the app + tray icons as PNGs with no dependencies (pure Node PNG encoder).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, 'icons');
fs.mkdirSync(OUT, { recursive: true });

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Shape functions in unit coordinates (0..1). Return true if inside.
function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
// Downward arrow: stem + head, plus a tray line under it.
function inArrow(x, y) {
  const stem = x > 0.44 && x < 0.56 && y > 0.24 && y < 0.55;
  const headTop = 0.50, headBottom = 0.70, headHalf = 0.20;
  const t = (y - headTop) / (headBottom - headTop);
  const head = y >= headTop && y <= headBottom && Math.abs(x - 0.5) <= headHalf * (1 - t);
  const tray = inRoundedRect(x, y, 0.27, 0.74, 0.73, 0.80, 0.03);
  return stem || head || tray;
}

function render(size, { bg, bg2, fg, template, pad = 0, dot = false }) {
  const SS = 4; // supersampling
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let cover = 0, arrow = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) / size;
        const y = (py + (sy + 0.5) / SS) / size;
        const inBox = template ? true : inRoundedRect(x, y, pad, pad, 1 - pad, 1 - pad, 0.22);
        if (!inBox) continue;
        if (inArrow(x, y)) arrow++; else cover++;
      }
      const i = (py * size + px) * 4;
      // red notification dot, top-right
      if (dot) {
        const dx = (px + 0.5) / size - 0.78, dy = (py + 0.5) / size - 0.22;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.2) {
          const ring = d > 0.15 ? 1 - (d - 0.15) / 0.05 : 1; // soft edge
          buf[i] = 255; buf[i + 1] = 59; buf[i + 2] = 48; buf[i + 3] = Math.round(255 * Math.max(0, Math.min(1, ring)));
          continue;
        }
      }
      if (template) {
        // monochrome: arrow is the glyph, rest transparent
        const a = Math.round(255 * arrow / (SS * SS));
        buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = a;
      } else {
        const total = cover + arrow;
        const a = total / (SS * SS);
        const fa = arrow / (SS * SS), ba = cover / (SS * SS);
        const t = py / size;
        const g = bg2 ? bg.map((c, k) => Math.round(c * (1 - t) + bg2[k] * t)) : bg;
        const mix = (c) => a === 0 ? 0 : Math.round((g[c] * ba + fg[c] * fa) / a);
        buf[i] = mix(0); buf[i + 1] = mix(1); buf[i + 2] = mix(2); buf[i + 3] = Math.round(255 * a);
      }
    }
  }
  return encodePNG(size, size, buf);
}

const blue = [52, 120, 246], indigo = [106, 92, 255], white = [255, 255, 255];
fs.writeFileSync(path.join(OUT, 'icon.png'), render(512, { bg: blue, bg2: indigo, fg: white, pad: 0.04 }));
fs.writeFileSync(path.join(OUT, 'icon-256.png'), render(256, { bg: blue, bg2: indigo, fg: white, pad: 0.04 }));
fs.writeFileSync(path.join(OUT, 'trayTemplate.png'), render(16, { template: true }));
fs.writeFileSync(path.join(OUT, 'trayTemplate@2x.png'), render(32, { template: true }));
fs.writeFileSync(path.join(OUT, 'tray.png'), render(32, { bg: blue, bg2: indigo, fg: white, pad: 0.02 }));
fs.writeFileSync(path.join(OUT, 'tray-16.png'), render(16, { bg: blue, bg2: indigo, fg: white, pad: 0.02 }));
fs.writeFileSync(path.join(OUT, 'tray-badge.png'), render(32, { bg: blue, bg2: indigo, fg: white, pad: 0.02, dot: true }));
fs.writeFileSync(path.join(OUT, 'tray-badge-16.png'), render(16, { bg: blue, bg2: indigo, fg: white, pad: 0.02, dot: true }));
console.log('icons written to', OUT);
