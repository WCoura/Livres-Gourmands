import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function insideRoundRect(x, y, size, radius) {
  const inset = 1;
  const max = size - 1 - inset;
  if (x < inset || y < inset || x > max || y > max) return false;
  const corners = [
    [inset + radius, inset + radius],
    [max - radius, inset + radius],
    [inset + radius, max - radius],
    [max - radius, max - radius],
  ];
  const inCornerZone = (x < inset + radius || x > max - radius) && (y < inset + radius || y > max - radius);
  if (!inCornerZone) return true;
  return corners.some(([cx, cy]) => (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2);
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const radius = size * 0.18;
  const bookX = Math.round(size * 0.27);
  const bookY = Math.round(size * 0.2);
  const bookW = Math.round(size * 0.46);
  const bookH = Math.round(size * 0.58);
  const spine = bookX + Math.round(bookW * 0.16);
  const ribbonX = bookX + Math.round(bookW * 0.62);
  const ribbonW = Math.max(4, Math.round(size * 0.07));
  const ribbonH = Math.round(size * 0.2);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const pixel = row + 1 + x * 4;
      if (!insideRoundRect(x, y, size, radius)) {
        raw[pixel + 3] = 0;
        continue;
      }
      let r = 0x9d;
      let g = 0x34;
      let b = 0x1f;
      const inBook = x >= bookX && x < bookX + bookW && y >= bookY && y < bookY + bookH;
      if (inBook) {
        r = 0xff;
        g = 0xfa;
        b = 0xf3;
        if (x === spine || x === spine + 1) {
          r = 0xc4;
          g = 0xa5;
          b = 0x74;
        }
        if (x >= ribbonX && x < ribbonX + ribbonW && y >= bookY && y < bookY + ribbonH) {
          r = 0x1e;
          g = 0x5c;
          b = 0x45;
        }
      }
      raw[pixel] = r;
      raw[pixel + 1] = g;
      raw[pixel + 2] = b;
      raw[pixel + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'icon-192.png'), png(192));
fs.writeFileSync(path.join(root, 'icon-512.png'), png(512));
console.log('Icônes écrites.');
